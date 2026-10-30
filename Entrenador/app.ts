import './theme';
import { difficultyLabels, difficultyDescriptions, readingQuestions, practiceTest, speakingTask, extensionContent } from './levels';
import { createDaily, rateDaily, completeDaily, hasLearning, addDailyPractice } from './daily';
import { audioAvailable, speakEnglish, stopAudio } from './audio';
import { independentAccuracy, prioritize, milestones, recordEvidence } from './learning';
import { guideDays, guideDay, situations } from './guide';
import { publicContent, practiceSentences, categories, publicVocabulary, sentenceQuestions, wordExamples, categoryProgress, publicResume, uniqueTerms, outcomes, conversationPrompt, challengeSentences } from './free';
import { connectAdvertising } from './advertising';
import {
  STORAGE_KEY, LEGACY_KEY, localDate, vocabulary, cardKey, dueWords, schedule, emptyState, emptyAssessment,
  loadState, persist, touch, streak, parseRoute, matches, shuffle,
  translationQuestions, recallQuestions, questionCorrect, quizStreak, retryQuiz, newQuiz, answerQuiz, quizScore, finishQuiz, assessmentScore,
  modeLabel, importBackup, exportBackup, validateState,
} from './core';
import type { Direction, Difficulty, Mode, Section, State, Vocabulary, Assessment, Rating } from './core';

const data = { weeks: categories.map(c => ({ ...c, week: c.id })) };
const words = vocabulary(publicVocabulary);
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id); if (!el) throw new Error(`Missing element: ${id}`); return el as T;
};
const e = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const storage = { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value) };
const loaded = loadState(storage, words);
let state = loaded.state;
let protectOriginal = loaded.warning !== null;
let suppressWrite = false;
let storageSaved = loaded.warning === null;
let route = parseRoute(location.hash, state.day);
let card: Vocabulary | undefined;
let revealed = false;
let dailySaving = false;
let extraPractice = false;
let selectedTokens: number[] = [];
let importCandidate: State | null = null;

let timer: ReturnType<typeof setInterval> | undefined;
const labels: Record<Section, string> = { home: 'Inicio', daily: 'Práctica diaria', plan: 'Ruta anterior', cards: 'Vocabulario', challenge: 'Juegos', assessments: 'Tests', ai: 'Práctica con IA', progress: 'Mi progreso', guide: 'Practicar con mi guía', situations: 'Situaciones reales' };
const ads = connectAdvertising();
const status = (message: string) => { $('status').textContent = message; };
const savedStatus = (message: string) => status(storageSaved ? message : 'Tu avance está solo en esta sesión. Expórtalo desde Mi progreso antes de cerrar.');
const warning = (message: string) => { $('storageWarning').textContent = message; $('storageWarning').hidden = !message; };
if (loaded.warning) warning(loaded.warning);
function save(active = false): void {
  if (active) touch(state);
  if (protectOriginal) { storageSaved = false; return; }
  if (suppressWrite) return;
  storageSaved = persist(storage, state);
  warning(storageSaved ? '' : 'No pudimos guardar en el navegador. Tu avance está en esta sesión: expórtalo desde Mi progreso antes de cerrar.');
}
const weekOptions = (selected: number) => data.weeks.map(w => `<option value="${w.week}" ${selected === w.week ? 'selected' : ''}>${e(w.title)}</option>`).join('');
const link = (href: string, text: string, cls = 'outline') => `<a class="${cls}" href="${e(href)}">${e(text)}</a>`;
const button = (id: string, text: string, cls = 'primary') => `<button id="${id}" type="button" class="${cls}">${e(text)}</button>`;
const heading = (kicker: string, title: string, description = '') => `<div class="section-top"><div><div class="eyebrow">${e(kicker)}</div><h1>${e(title)}</h1>${description ? `<p class="hint">${e(description)}</p>` : ''}</div></div>`;
const panel = (content: string) => `<section class="panel active">${content}</section>`;
const dayLabel = (count: number) => `${count} ${count === 1 ? 'día' : 'días'}`;
const dateText = (n: number) => new Date(n).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function go(hash: string): void { if (location.hash === hash) render(); else location.hash = hash; }
function bind(id: string, fn: () => void): void { $(id).onclick = fn; }
function difficultyControl(id: string): string {
  const value = state.preferences.difficulty || 'standard';
  return `<label class="field difficulty-control">Dificultad<select id="${id}">${(['gentle','standard','challenge'] as Difficulty[]).map(d => `<option value="${d}" ${d === value ? 'selected' : ''}>${difficultyLabels[d]}</option>`).join('')}</select><span class="difficulty-note">${difficultyDescriptions[value]} Puedes cambiarla libremente; no es un nivel certificado.</span></label>`;
}
function bindDifficulty(id: string, redraw: () => void, change?: () => void): void {
  $(id).onchange = ev => { selectDifficulty((ev.target as HTMLSelectElement).value as Difficulty); change?.(); save(); redraw(); document.getElementById(id)?.focus(); };
}
function selectDifficulty(difficulty: Difficulty): void {
  state.preferences.difficulty = difficulty;
  state.preferences.cardPractice = difficulty === 'gentle' ? 'reveal' : 'recall';
  state.preferences.direction = difficulty === 'gentle' ? 'en-es' : 'es-en';
  extraPractice = false;
}
function audioControls(text: string): string {
  if (state.preferences.learningAudio === false) return '<p class="hint">Audio desactivado. Puedes activarlo en Mi progreso.</p>';
  return `<div class="audio-controls"><div class="lesson-btns"><button type="button" class="outline" data-speak="${e(text)}" ${audioAvailable() ? '' : 'disabled'}>Escuchar en inglés</button><button type="button" class="outline" data-speak="${e(text)}" data-slow="1" ${audioAvailable() ? '' : 'disabled'}>Escuchar más lento</button></div><p class="hint audio-status" role="status">${audioAvailable() ? 'Voz de tu dispositivo. Su calidad puede variar.' : 'Audio no disponible: hace falta una voz local en inglés. Puedes continuar leyendo.'}</p></div>`;
}
document.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-speak]');
  if (!target || state.preferences.learningAudio === false) return;
  const output = target.closest('.audio-controls')!.querySelector('.audio-status')!;
  speakEnglish(target.dataset.speak!, !!target.dataset.slow, message => { if (output.isConnected) output.textContent = message; });
});
if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener('voiceschanged', () => {
  document.querySelectorAll<HTMLButtonElement>('[data-speak], [data-audio-needed]').forEach(el => { el.disabled = !audioAvailable(); });
  document.querySelectorAll('.audio-status').forEach(el => { el.textContent = audioAvailable() ? 'Audio en inglés disponible. Pulsa Escuchar.' : 'No hay voz local en inglés. Puedes continuar leyendo.'; });
});
function renderDailyPractice(): void {
  const session = state.daily!, practice = session.practice!, index = practice.index;
  const item = practice.questions[index], response = practice.responses[index], answered = response !== null;
  const correct = questionCorrect(item, response);
  $('view').innerHTML = panel(`${heading(`USA LO QUE RECUERDAS · ${difficultyLabels[session.difficulty || 'standard']}`,  item.context ? 'Lee y comprende' : item.options ? 'Reconoce la respuesta' : ['Completa la expresión', 'Construye una frase', 'Escribe de memoria'][index], 'Una respuesta de referencia; pueden existir otras formas válidas.')}<div class="session-progress"><span>${index + 1} de 3 ejercicios</span><progress value="${index}" max="3" aria-label="Ejercicios escritos completados"></progress></div>${item.context ? `<div class="reading-passage" lang="en">${e(item.context)}</div>` : ''}<h2 lang="${item.context || index === 0 ? 'en' : 'es'}">${e(item.prompt)}</h2>${!answered ? item.options ? `<div class="options">${item.options.map((option,i) => `<button class="answer" data-daily-option="${i}" lang="en">${e(option)}</button>`).join('')}</div>${button('skipDailyAnswer', 'No lo sé · repasar después', 'quiet-link')}` : `<form id="dailyAnswerForm"><label for="dailyAnswer">Tu respuesta en inglés</label><input id="dailyAnswer" maxlength="500" autocomplete="off" autocapitalize="off" spellcheck="false" required><button class="primary" type="submit">Comprobar respuesta</button></form>${button('skipDailyAnswer', 'No lo sé · repasar después', 'quiet-link')}` : `<div class="feedback ${correct ? 'is-correct' : 'needs-review'}" role="status"><strong>${correct ? '✓ ¡Correcto!' : 'Vamos a reforzar esta expresión.'}</strong><p lang="en">${e(item.answer)}</p><p>${e(item.explanation)}</p></div>${button('nextDailyAnswer', 'Continuar')}`}<div class="lesson-btns">${link('#/home', 'Salir y continuar después')}</div>`);
  const answer = (value: string) => { void updateDaily(() => {
    const current = state.daily?.practice;
    if (state.daily?.id === session.id && current?.index === index && current.responses[index] === null) current.responses[index] = value;
  }).then(() => document.getElementById('nextDailyAnswer')?.focus()); };
  if (!answered) {
    document.querySelectorAll<HTMLButtonElement>('[data-daily-option]').forEach(b => { b.onclick = () => answer(item.options![Number(b.dataset.dailyOption)]); });
    if (!item.options) $('dailyAnswerForm').onsubmit = ev => { ev.preventDefault(); answer($<HTMLInputElement>('dailyAnswer').value.trim()); };
    bind('skipDailyAnswer', () => answer(''));
  } else bind('nextDailyAnswer', () => { void updateDaily(() => {
    if (state.daily?.id === session.id && state.daily.practice?.index === index) state.daily.practice.index++;
  }).then(() => document.querySelector<HTMLElement>('#dailyAnswer, [data-daily-option], #completeDaily')?.focus()); });
}
function learningMetrics(): string {
  const current = words.map(w => state.cards[cardKey(w, state.preferences.direction)]).filter(Boolean);
  return `<div class="stats-grid"><div class="metric"><span>Tarjetas estudiadas</span><b>${current.length}<small> / ${words.length}</small></b><small>Calificadas al menos una vez</small></div><div class="metric"><span>Repasos pendientes</span><b>${current.filter(c => c.due <= Date.now()).length}</b><small>Según tu calendario de repaso</small></div><div class="metric"><span>Recordadas la última vez</span><b>${current.filter(c => c.rating === 'known').length}</b><small>Según tu propia valoración</small></div><div class="metric"><span>Racha de práctica</span><b>${streak(state.activity)}<small> ${streak(state.activity) === 1 ? 'día' : 'días'}</small></b><small>Solo cuentan días con actividad</small></div></div>`;
}
function renderHome(): void {
  const returning = hasLearning(state);
  const due = words.filter(w => state.cards[cardKey(w, state.preferences.direction)]?.due <= Date.now()).length;
  const pending = state.daily && state.daily.completedAt === null && state.daily.items.length > 0;
  const today = state.daily?.completedAt !== null && state.daily?.day === localDate();
  $('view').innerHTML = `<section class="hero"><div><div class="eyebrow">${returning ? 'TU INGLÉS, PASO A PASO' : 'PRÁCTICA GRATUITA · SIN CUENTA'}</div><h1>${returning ? 'Qué bueno verte de nuevo.' : 'Inglés práctico para<br>situaciones de todos los días.'}</h1><p>${returning ? `${due ? `Tienes ${due} tarjetas pendientes de repaso.` : 'Tu calendario de repaso está al día.'} ${pending ? 'Tu sesión está guardada: continúa desde donde la dejaste.' : today ? 'Ya completaste tu sesión de hoy. Puedes repasar lo aprendido o explorar otra actividad.' : 'Te proponemos una sesión breve para seguir avanzando.'}` : `Aprende expresiones para presentarte, pedir comida o moverte por una ciudad. Practica con ${uniqueTerms} expresiones en ${categories.length} situaciones, a tu ritmo.`}</p><div class="lesson-btns">${link('#/daily', returning ? 'Practicar hoy' : 'Empezar a practicar', 'primary light')}</div>${returning ? `<p class="hero-secondary">${link(pending ? '#/daily' : publicResume(state.lastRoute), 'Continuar última actividad', 'text-link')}</p>` : '<p class="hero-secondary">Una sesión breve, sin reloj ni registro.</p>'}</div><div class="journey-mark" aria-hidden="true">E90<span>APRENDE. PRACTICA. CONVERSA.</span></div></section>
  ${difficultyControl('homeDifficulty')}
  ${returning ? `<div class="callout"><strong>Tu siguiente paso</strong><p>${independentAccuracy(state).ready ? 'Estás recordando bien sin ayuda. Prueba construir frases y escuchar antes de leer.' : 'Tu objetivo: completar una práctica diaria y volver a las expresiones difíciles.'}</p>${state.history.length ? `<p class="hint">Última actividad: ${e(state.history.at(-1)!.label)} · ${state.history.at(-1)!.score}/${state.history.at(-1)!.total}. ${link('#/progress', 'Ver mi progreso')}</p>` : ''}${link(independentAccuracy(state).ready ? `#/challenge?week=${state.preferences.week}&mode=listening` : '#/daily', independentAccuracy(state).ready ? 'Probar escucha sin texto' : 'Continuar mi práctica')}</div>` : ''}
  ${returning ? learningMetrics() : `<ol class="learning-steps"><li><span>1</span><div><h2>Aprende expresiones</h2><p>Empieza por situaciones que te resulten útiles.</p></div></li><li><span>2</span><div><h2>Recuerda sin mirar</h2><p>Intenta la traducción y comprueba tu respuesta.</p></div></li><li><span>3</span><div><h2>Vuelve a repasarlas</h2><p>El calendario se ajusta a lo que recuerdas.</p></div></li></ol>`}
  ${panel(`<div class="section-top"><div><div class="eyebrow">LLEVA EL INGLÉS A TU DÍA</div><h2>¿Qué te gustaría practicar?</h2></div>${link('#/cards', 'Ver todo el vocabulario')}</div><div class="category-grid">${categories.filter(c => [1, 4, 6].includes(c.id)).map(c => `<a class="category-card" href="#/cards?week=${c.id}"><strong>${e(outcomes[c.id])}</strong><span>${c.vocabulary.length} tarjetas · ${e(c.title)}</span><span>Practicar →</span></a>`).join('')}</div><div class="lesson-btns">${link('#/challenge', 'Juegos de palabras y frases')}${link('#/assessments', `Tests por situación y dificultad`)}${link('#/challenge?mode=reading', 'Leer y comprender')}${link('#/challenge?mode=listening', 'Escuchar y escribir')}${link('#/situations', 'Situaciones reales')}${link('#/ai', 'Practicar conversación con IA')}</div>`)}
  <div class="dashboard-grid spaced">${panel(`<h2>Una forma de estudiar que funciona para ti</h2><p>Ideas sencillas para recordar vocabulario y empezar a conversar.</p>${link('/aprender/', 'Leer las guías de práctica')}`)}${panel(`<h2>¿Prefieres una ruta de estudio?</h2><p>Conoce English 90 Premium, el programa autoguiado de 90 días que complementa esta práctica gratuita.</p>${link('#/guide', 'Practicar con mi guía')}${link('/premium/', 'Conocer el programa')}`)}</div>`;
  bindDifficulty('homeDifficulty', renderHome);
}

// Lock daily changes across tabs where supported, and refresh before committing a grade.
async function updateDaily(change: () => void): Promise<void> {
  if (dailySaving) return;
  dailySaving = true;
  $('view').setAttribute('aria-busy', 'true');
  status('Guardando tu avance…');
  const update = () => {
    if (!protectOriginal && storageSaved) {
      try {
        const current = localStorage.getItem(STORAGE_KEY);
        if (current) state = validateState(JSON.parse(current));
      } catch { protectOriginal = true; warning('No pudimos actualizar el progreso. Exporta esta sesión antes de cerrar.'); }
    }
    change(); save(); if (route.section === 'daily') renderDaily();
  };
  try {
    if (navigator.locks) await navigator.locks.request('english90-daily-progress', update);
    else update();
  } finally { dailySaving = false; $('view').removeAttribute('aria-busy'); }
  savedStatus('Tu avance está guardado.');
}
function renderDaily(): void {
  revealed = false;
  const session = state.daily;
  const needsStart = !session || (!session.items.length) || (session.completedAt !== null && session.day !== localDate());
  if (needsStart) {
    const preview = createDaily(state, words);
    $('view').innerHTML = panel(`${heading('UN RATO PARA TU INGLÉS', 'Tu práctica de hoy', 'Reserva unos 10 minutos, sin límite de tiempo. Puedes salir y retomar cuando quieras.')}${difficultyControl('dailyDifficulty')}<div class="daily-plan"><h2>${preview.items.length ? `${preview.items.length} tarjetas y 3 ejercicios a tu dificultad` : 'Tus repasos están al día'}</h2><p>${preview.items.length ? `${preview.items.filter(i => i.kind === 'review').length} repasos pendientes · ${preview.items.filter(i => i.kind === 'reinforce').length} tarjetas por reforzar · ${preview.items.filter(i => i.kind === 'new').length} nuevas.` : 'Ya estudiaste todas las tarjetas de esta dirección y no hay repasos pendientes. Vuelve cuando toque tu próximo repaso o prueba otra actividad.'}</p><p class="hint">Las tarjetas por reforzar son práctica adicional antes de su fecha de repaso. Tú decides cómo calificarlas.</p>${preview.items.length ? button('startDaily', 'Comenzar sesión') : link('#/cards', 'Ir al vocabulario', 'primary')}</div><div class="lesson-btns">${link('#/home', 'Volver al inicio')}${link('#/challenge', 'Elegir un juego')}</div>`);
    bindDifficulty('dailyDifficulty', renderDaily);
    if (preview.items.length) bind('startDaily', () => { void updateDaily(() => {
      if (!state.daily || !state.daily.items.length || state.daily.completedAt !== null) state.daily = createDaily(state, words);
      addDailyPractice(state, words);
    }); });
    return;
  }
  const finished = session.items.filter(i => i.rating !== null).length;
  const item = session.items.find(i => i.rating === null);
  const word = item && words.find(w => w.id === item.wordId);
  const progress = `<div class="session-progress"><span>${finished} de ${session.items.length} tarjetas repasadas · ${difficultyLabels[session.difficulty || 'standard']}</span><progress value="${finished}" max="${session.items.length}" aria-label="Progreso de la sesión"></progress></div>`;
  if (!item) {
    if (session.practice && session.practice.index < 3) { renderDailyPractice(); return; }
    const selected = session.items.map(i => ({item: i, word: words.find(w => w.id === i.wordId)})).filter(v => v.word);
    const category = selected[0]?.word?.weeks[0] || state.preferences.week;
    $('view').innerHTML = panel(`${heading(session.completedAt === null ? 'DALE UN USO A LO QUE APRENDISTE' : 'SESIÓN COMPLETADA', session.completedAt === null ? 'Un último repaso.' : 'Hoy practicaste tu inglés.')}${progress}<p>Marcaste ${session.items.filter(i => i.rating === 'known').length} tarjetas como recordadas y ${session.items.filter(i => i.rating !== 'known').length} para reforzar. Cada una conserva su próximo repaso.</p>${session.practice ? `<h2>Tus respuestas de práctica</h2><p>${session.practice.questions.filter((q, i) => questionCorrect(q, session.practice!.responses[i])).length} de 3 respuestas de referencia correctas al primer intento.</p>${session.practice.questions.map((q,i) => `<details><summary>${questionCorrect(q,session.practice!.responses[i]) ? '✓ Correcta' : '↻ Para reforzar'} · ${e(q.prompt)}</summary><p lang="en">${e(q.answer)}</p><p>${e(q.explanation)}</p>${!questionCorrect(q,session.practice!.responses[i]) ? `<label>Inténtalo otra vez sin mirar<input data-retry="${i}" autocomplete="off" maxlength="500"></label><button type="button" class="outline" data-check-retry="${i}">Comprobar repaso</button><p role="status" data-retry-status="${i}"></p>` : ''}</details>`).join('')}<p class="hint">Repetir ahora ayuda a practicar; no aumenta el resultado ni cambia el calendario.</p>` : ''}<h2>Elige dos expresiones y úsalas en una frase</h2><p>Inténtalo en voz alta antes de mirar la traducción. Esta recapitulación no cambia tus calificaciones.</p><div class="recap-list">${selected.map(({item: i, word: w}) => `<details><summary><span lang="en">${e(w!.en)}</span> <small>${i.rating === 'known' ? 'Recordada' : 'Por reforzar'}</small></summary><p>${e(w!.es)}</p></details>`).join('')}</div><div class="lesson-btns">${session.completedAt === null ? button('completeDaily', 'Terminar sesión') : link('#/progress', 'Ver mi progreso', 'primary')}${link(`#/situations?week=${category}`, 'Escucha y repite')}${link(`#/ai?week=${category}&daily=1`, 'Practicar conversación con IA')}${link('#/home', 'Volver al inicio')}</div>${session.completedAt !== null ? '<p class="hint">Tu práctica gratuita sigue disponible. Si buscas una ruta de estudio, <a href="/premium/">conoce English 90 Premium</a>.</p>' : ''}`);
    document.querySelectorAll<HTMLButtonElement>('[data-check-retry]').forEach(b => { b.onclick = () => { const i = Number(b.dataset.checkRetry); const input = document.querySelector<HTMLInputElement>(`[data-retry="${i}"]`)!; document.querySelector(`[data-retry-status="${i}"]`)!.textContent = questionCorrect(session.practice!.questions[i], input.value) ? 'Correcto. Vuelve a recordarla otro día.' : `Respuesta de referencia: ${session.practice!.questions[i].answer}`; }; });
    if (session.completedAt === null) bind('completeDaily', () => { void updateDaily(() => { if (state.daily?.id === session.id) completeDaily(state); }).then(() => savedStatus('Sesión completada. Tu progreso está guardado.')); });
    return;
  }
  if (!word) {
    $('view').innerHTML = panel(`${heading('TU PROGRESO SE CONSERVA', 'Esta tarjeta ya no está disponible.')}<p>Podemos reorganizar las tarjetas pendientes sin borrar tus repasos.</p>${button('repairDaily', 'Reorganizar pendientes')}`);
    bind('repairDaily', () => { void updateDaily(() => { state.daily = createDaily(state, words); addDailyPractice(state, words); }); }); return;
  }
  const direction = session.direction;
  const kind = {review: 'REPASO PENDIENTE', reinforce: 'PRÁCTICA PARA REFORZAR', new: 'EXPRESIÓN NUEVA'}[item.kind];
  $('view').innerHTML = panel(`${heading('PRÁCTICA DIARIA', 'Una expresión a la vez.')} ${progress}<div class="flash daily-flash"><span class="card-kicker">${kind} · ${direction === 'en-es' ? 'INGLÉS → ESPAÑOL' : 'ESPAÑOL → INGLÉS'}</span><h2 class="flash-word" lang="${direction === 'en-es' ? 'en' : 'es'}">${e(direction === 'en-es' ? word.en : word.es)}</h2><p id="dailyMeaning" class="flash-meaning">Intenta recordar la traducción.</p>${button('dailyReveal', 'Mostrar respuesta')}</div><div id="dailyRatings" class="card-buttons" hidden>${button('dailyForgotten', 'La olvidé · 10 minutos', 'outline')}${button('dailyDifficult', 'Difícil · mañana', 'outline')}${button('dailyKnown', `La conozco · ${schedule(state.cards[cardKey(word, direction)], 'known').interval} días`, 'outline')}</div><p class="hint">Califica lo que recordaste sin ayuda. Mirar la respuesta no marca la tarjeta como aprendida.</p><div class="lesson-btns">${link('#/home', 'Salir y continuar después')}</div><details><summary>Reorganizar esta sesión</summary><p>Conservaremos las tarjetas ya calificadas. Se elegirán otras pendientes sin volver a registrar esos repasos.</p>${button('restartDaily', 'Reorganizar pendientes', 'outline')}</details>`);
  bind('dailyReveal', () => { status(''); revealed = true; $('dailyMeaning').textContent = direction === 'en-es' ? word.es : word.en; $('dailyMeaning').lang = direction === 'en-es' ? 'es' : 'en'; $('dailyRatings').hidden = false; $('dailyReveal').hidden = true; $('dailyForgotten').focus(); });
  for (const [id, rating] of [['dailyForgotten', 'forgotten'], ['dailyDifficult', 'difficult'], ['dailyKnown', 'known']] as const) bind(id, () => {
    if (!revealed) return; revealed = false;
    void updateDaily(() => { rateDaily(state, words, session.id, word.id, rating as Rating); }).then(() => { savedStatus('Repaso guardado.'); document.querySelector<HTMLElement>('#dailyReveal, #dailyAnswer, [data-daily-option], #completeDaily')?.focus(); });
  });
  bind('restartDaily', () => { void updateDaily(() => { state.daily = createDaily(state, words); addDailyPractice(state, words); }); });
}
function renderPlan(): void {
  const n = route.day;
  $('view').innerHTML = panel(`${heading('UN NUEVO ESPACIO DE PRÁCTICA', 'Este enlace pertenece a la versión anterior.')}<p>English 90 es gratuito y se organiza por situaciones, juegos y tests. Esta versión se centra en la práctica autónoma y conserva tus registros anteriores.</p><div class="callout"><p>Tu progreso anterior no se ha borrado. El día ${n} figura como <strong>${state.done[n] ? 'completado' : 'no completado'}</strong> en tu archivo local.</p>${state.notes[n] ? `<p>Tu nota guardada: ${e(state.notes[n])}</p>` : ''}</div><div class="lesson-btns">${link('#/cards', 'Practicar gratis', 'primary')}${link('#/progress', 'Ver archivo de progreso')}</div>`);
}
function renderGuide(): void {
  const selected = guideDay(route.day);
  const url = (section: string, mode = 'ordering') => `#/${section}/${selected.day}?week=${selected.category}&mode=${mode}&guide=1`;
  $('view').innerHTML = panel(`${heading('TU GUÍA + TU PRÁCTICA GRATUITA', 'Practicar con mi guía', 'Elige dónde vas en tu programa. Estas actividades refuerzan parte del tema; continúa las explicaciones, tareas y evaluaciones en tu guía.')}<div class="controls"><label class="field">Semana<select id="guideWeek">${Array.from({length:13}, (_, i) => `<option value="${i+1}" ${selected.week === i+1 ? 'selected' : ''}>Semana ${i+1}${i===12 ? ' · proyectos' : ''}</option>`).join('')}</select></label><label class="field">Estoy estudiando el día<select id="guideDay">${guideDays.map(d => `<option value="${d.day}" ${d.day === selected.day ? 'selected' : ''}>${d.day} · ${e(d.topic)}</option>`).join('')}</select></label></div><div class="callout"><h2>Día ${selected.day} · ${e(selected.topic)}</h2><p>${selected.kind === 'assessment' ? 'Evaluación semanal en tu guía. Aquí puedes reforzar vocabulario y estructuras; este repaso no es la evaluación de la guía.' : selected.kind === 'capstone' ? 'Proyecto de integración: usa la guía para las instrucciones y el registro de tu trabajo.' : 'Practica el vocabulario del día y las estructuras relacionadas que están disponibles en el Trainer.'}</p>${selected.day === 90 ? '<p>La edición disponible menciona una evaluación final, pero no incluye el examen ni su clave de respuestas. No hay un resultado final oficial disponible en el Trainer.</p>' : ''}${[30,60].includes(selected.day) ? '<p>El punto de control integral está en tu guía. Los ejercicios gratuitos de abajo son refuerzo y no lo sustituyen.</p>' : ''}<div class="lesson-btns">${selected.vocabulary.length ? link(url('cards'), `Repasar ${selected.vocabulary.length} expresiones del día`, 'primary') : selected.day !== 90 ? link(`#/cards?week=${selected.category}`, 'Repasar vocabulario de la situación', 'primary') : ''}${selected.sentences.length ? link(url('challenge'), 'Construir frases relacionadas') : ''}${selected.day !== 90 ? link(`#/ai?week=${selected.category}`, 'Preparar conversación') : link('#/progress', 'Ver mi progreso')}</div>${!selected.sentences.length && selected.day !== 90 ? '<p class="hint">Aún no hay una actividad de frases que corresponda directamente a este día. El vocabulario sigue disponible.</p>' : ''}</div><p class="hint">Sin cuenta ni comprobante de compra. Los tests gratuitos no equivalen a las 12 evaluaciones semanales de la guía.</p>${link('/premium/', 'Conocer English 90 Premium')}`);
  $('guideDay').onchange = ev => go(`#/guide/${(ev.target as HTMLSelectElement).value}`);
  $('guideWeek').onchange = ev => go(`#/guide/${guideDays.find(d => d.week === Number((ev.target as HTMLSelectElement).value))!.day}`);
}
function renderSituations(): void {
  const scene = situations.find(s => s.category === route.week) || situations[0];
  const requested = Number(new URLSearchParams(location.hash.split('?')[1]).get('step')) || 0;
  const step = Math.max(0, Math.min(scene.steps.length, requested));
  const interaction = scene.steps[step];
  const model = interaction && publicContent.sentences.find(s => s.id === interaction.sentence)!;
  $('view').innerHTML = panel(`${heading('ESCUCHA, RESPONDE Y REPITE', scene.title, scene.goal)}${difficultyControl('oralDifficulty')}<div class="callout"><p>${e(speakingTask(scene.category,state.preferences.difficulty || 'standard'))}</p></div><label class="field">Elegir situación<select id="scene">${situations.map(s => `<option value="${s.category}" ${s.category===scene.category?'selected':''}>${e(s.title)}</option>`).join('')}</select></label><progress value="${step}" max="${scene.steps.length}" aria-label="Pasos de la situación"></progress>${interaction ? `<p class="eyebrow">INTERACCIÓN ${step+1} DE ${scene.steps.length}</p><h2>${e(interaction.cue)}</h2><p>Di tu respuesta en voz alta. Después abre el modelo, escúchalo y repítelo.</p><details id="spokenModel"><summary>Ver y escuchar una respuesta de referencia</summary><p lang="en">${e(model.en)}</p><p>${e(model.es)}</p>${audioControls(model.en)}<p class="hint">${e(model.explanation)}</p></details><p class="hint">No usamos micrófono ni evaluamos pronunciación. Si no puedes hablar ahora, practica leyendo.</p><div class="lesson-btns">${link(`#/situations?week=${scene.category}&step=${step+1}`, 'Continuar', 'primary')}${link(`#/situations?week=${scene.category}&step=${step+1}`, 'Omitir la práctica oral')}</div>` : `<div class="result-card"><h2>Ya tienes una conversación para practicar.</h2><p>Ahora cambia un dato y repítela con tus propias palabras. Esta práctica oral no recibe puntuación automática.</p>${link(`#/ai?week=${scene.category}`, 'Continuar con un diálogo abierto', 'primary')}${link(`#/situations?week=${scene.category}`, 'Repetir situación')}</div>`}${link('#/home', 'Volver al inicio')}`);
  bindDifficulty('oralDifficulty', renderSituations);
  $('scene').onchange = ev => go(`#/situations?week=${(ev.target as HTMLSelectElement).value}`);
}

function celebrationMark(): string {
  return '<span class="success-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18"/><path d="m11 20 6 6 12-13"/></svg><i></i><i></i><i></i><i></i></span>';
}
function celebrate(container: HTMLElement): void {
  container.classList.add('celebrate');
}
function renderCards(): void {
  const direction = state.preferences.direction;
  const writing = state.preferences.cardPractice === 'recall';
  const mapped = new URLSearchParams(location.hash.split('?')[1]).get('guide') === '1' ? guideDay(route.day) : null;
  const all = words.filter(w => mapped?.vocabulary.length ? mapped.vocabulary.includes(w.id) : w.weeks.includes(route.week));
  const phrases = all.filter(w => w.en.trim().split(/\s+/).length > 1);
  const pool = mapped ? all : state.preferences.difficulty === 'gentle' ? all.slice(0,20) : state.preferences.difficulty === 'challenge' && phrases.length ? phrases : all;
  const due = dueWords(pool, state.cards, direction);
  const candidate = pool.find(w => cardKey(w, direction) === state.lastCard && due.some(d => d.id === w.id));
  card = candidate || due[0];
  if (!card && extraPractice) card = shuffle(pool.filter(w => cardKey(w, direction) !== state.lastCard))[0] || pool[0];
  revealed = false;
  if (card) { state.lastCard = cardKey(card, direction); save(); }
  const pendingReview = due.filter(w => state.cards[cardKey(w, direction)]).length;
  const nextReview = pool.map(w => state.cards[cardKey(w, direction)]?.due).filter((n): n is number => n !== undefined).sort((a, b) => a - b)[0];
  const reviewed = pool.filter(w => state.cards[cardKey(w, direction)]).length;
  $('view').innerHTML = panel(`${heading('RECUERDA ANTES DE MIRAR', 'Haz tuyo el vocabulario.', 'Primero recuerda, después comprueba y finalmente decide cuándo repasar.')}${difficultyControl('cardDifficulty')}
    <div class="controls"><label class="field">Situación<select id="cardWeek">${weekOptions(route.week)}</select></label><label class="field">Dirección<select id="direction"><option value="en-es" ${direction === 'en-es' ? 'selected' : ''}>Inglés → Español</option><option value="es-en" ${direction === 'es-en' ? 'selected' : ''}>Español → Inglés</option></select></label><label class="field">Forma de practicar<select id="cardPractice"><option value="reveal" ${!writing ? 'selected' : ''}>Recordar y revelar</option><option value="recall" ${writing ? 'selected' : ''}>Escribir antes de mirar</option></select></label></div>
    <div class="session-progress"><span>${reviewed} de ${pool.length} tarjetas estudiadas</span><progress value="${reviewed}" max="${pool.length}" aria-label="Tarjetas estudiadas en esta dirección"></progress></div><p class="hint">${pendingReview} repasos pendientes · ${due.length - pendingReview} tarjetas nuevas. Cada dirección tiene su propio calendario.</p>
    ${card ? `<div class="flash"><span class="card-kicker">${direction === 'en-es' ? 'INGLÉS → ESPAÑOL' : 'ESPAÑOL → INGLÉS'} · ${writing ? 'ESCRIBE DE MEMORIA' : 'RECUERDA'}</span><h2 class="flash-word" lang="${direction === 'en-es' ? 'en' : 'es'}">${e(direction === 'en-es' ? card.en : card.es)}</h2><p id="flashMeaning" class="flash-meaning">${writing ? 'Escribe la traducción sin mirar. Después podrás calificar tu recuerdo.' : 'Intenta recordar la traducción antes de verla.'}</p>${writing ? `<form id="cardRecallForm" class="recall-form"><label for="cardAnswer">Tu traducción en ${direction === 'en-es' ? 'español' : 'inglés'}</label><input id="cardAnswer" maxlength="500" autocomplete="off" autocapitalize="off" spellcheck="false" required><button class="primary" type="submit">Comprobar mi respuesta</button></form>` : ''}${button('reveal', 'Mostrar respuesta', writing ? 'quiet-link' : 'primary')}<div id="cardFeedback" role="status"></div></div><div id="cardContext" hidden></div><div id="ratings" class="card-buttons" hidden>${button('forgotten', 'La olvidé · 10 minutos', 'outline')}${button('difficult', 'Difícil · mañana', 'outline')}${button('known', `La conozco · ${schedule(state.cards[cardKey(card, direction)], 'known').interval} días`, 'outline')}</div><p class="hint">El calendario cambia solo cuando calificas la tarjeta. Elige según lo que recordaste sin ayuda.</p>` : `<div class="empty-state"><div class="eyebrow">POR HOY, AL DÍA</div><h2>Un descanso también ayuda.</h2><p>Próximo repaso: ${nextReview ? dateText(nextReview) : 'sin tarjetas programadas'}.</p>${button('extraPractice', 'Practicar más', 'outline')}</div>`}
    <div class="lesson-btns">${link(`#/challenge?week=${route.week}&mode=recall`, 'Probar un juego de memoria')}${link(`#/ai?week=${route.week}`, 'Practicar conversación con IA')}</div>
    <details class="spaced"><summary>Explorar las ${pool.length} expresiones de esta situación</summary><label for="wordSearch">Buscar en inglés o español</label><input id="wordSearch" type="search" placeholder="Escribe una palabra o expresión"><p id="wordCount" class="hint" role="status"></p><dl id="wordLibrary" class="word-list vocabulary-library"></dl></details>
    <details><summary>Cómo se programan los repasos</summary><p>Olvidada: vuelve en 10 minutos. Difícil: al día siguiente. Conocida: empieza en 3 días y amplía el intervalo de forma gradual hasta 90 días.</p><p>Una palabra puede tener varios significados. Las comprobaciones usan las traducciones del vocabulario; también puede haber otras opciones válidas.</p></details>`);
  bindDifficulty('cardDifficulty', renderCards);
  $('cardWeek').onchange = ev => { extraPractice = false; state.preferences.week = Number((ev.target as HTMLSelectElement).value); go(`#/cards?week=${state.preferences.week}`); };
  $('direction').onchange = ev => { state.preferences.direction = (ev.target as HTMLSelectElement).value as Direction; extraPractice = false; save(); renderCards(); };
  $('cardPractice').onchange = ev => { state.preferences.cardPractice = (ev.target as HTMLSelectElement).value as 'reveal' | 'recall'; save(); renderCards(); document.querySelector<HTMLElement>('#cardAnswer, #reveal')?.focus(); };
  const renderLibrary = () => {
    const plain = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const query = plain($<HTMLInputElement>('wordSearch').value.trim());
    const filtered = pool.filter(w => plain(`${w.en} ${w.es}`).includes(query));
    $('wordCount').textContent = `${filtered.length} expresiones${filtered.length ? '' : '. Prueba con otra palabra.'}`;
    $('wordLibrary').innerHTML = filtered.map(w => `<div><dt lang="en">${e(w.en)}</dt><dd>${e(w.es)}</dd></div>`).join('');
  };
  $('wordSearch').oninput = renderLibrary; renderLibrary();
  if (!card) { bind('extraPractice', () => { extraPractice = true; renderCards(); }); return; }
  const revealCard = (answer?: string) => {
    if (revealed || !card) return;
    revealed = true; $('flashMeaning').textContent = direction === 'en-es' ? card.es : card.en;
    $('flashMeaning').lang = direction === 'en-es' ? 'es' : 'en'; $('ratings').hidden = false; $('reveal').hidden = true;
    const form = document.getElementById('cardRecallForm'); if (form) form.hidden = true;
    if (answer !== undefined) {
      const question = recallQuestions([card], words, direction)[0];
      const correct = questionCorrect(question, answer);
      recordEvidence(state, [question], [answer]); save();
      $('cardFeedback').innerHTML = `<div class="feedback ${correct ? 'is-correct' : 'needs-review'}">${correct ? celebrationMark() : ''}<strong>${correct ? '✓ ¡Correcto! Lo recordaste sin opciones.' : 'Todavía no coincide con la traducción de la tarjeta.'}</strong><p>Escribiste: ${e(answer)}</p>${!correct ? '<p>Compara las dos expresiones y vuelve a decirla antes de continuar.</p>' : ''}</div>`;
      if (correct) celebrate($('cardFeedback'));
    }
    const examples = wordExamples(card);
    $('cardContext').innerHTML = `<div class="word-context"><div class="eyebrow">${examples.length ? 'EN UNA FRASE' : 'PONLO EN PRÁCTICA'}</div>${examples.map(s => `<p lang="en" class="context-sentence">${e(s.en)}</p><p>${e(s.es)}</p>`).join('')}<p class="hint">${e(categories.find(c => c.id === route.week)!.tip)}</p><p>Di una frase propia con <strong lang="en">${e(card.en)}</strong>. Cambia una persona, un lugar o un detalle para hacerla tuya.</p></div>`;
    $('cardContext').insertAdjacentHTML('beforeend', audioControls(card.en)); $('cardContext').hidden = false; $('flashMeaning').classList.add('answer-reveal'); $('forgotten').focus();
  };
  bind('reveal', () => revealCard());
  if (writing) $('cardRecallForm').onsubmit = event => { event.preventDefault(); const answer = $<HTMLInputElement>('cardAnswer').value.trim(); if (answer) revealCard(answer); };
  for (const rating of ['forgotten', 'difficult', 'known'] as const) bind(rating, () => {
    if (!card || !revealed) return;
    state.cards[cardKey(card, direction)] = schedule(state.cards[cardKey(card, direction)], rating);
    save(true); renderCards(); savedStatus('Repaso guardado.'); document.querySelector<HTMLElement>('#cardAnswer, #reveal, #extraPractice')?.focus();
  });
}


function gameDescription(mode: Mode, difficulty: Difficulty): string {
  if (mode === 'reading') return 'Lee un texto y responde sobre información explícita, relaciones o inferencias según la dificultad. Cada respuesta tiene una explicación apoyada en el texto.';
  if (mode === 'listening') return 'Escucha una frase y escríbela sin ver el texto. Puedes repetirla más lento. Si necesitas verla, continúa como lectura asistida: esa respuesta no suma aciertos de escucha.';
  const hard = difficulty === 'challenge';
  if (mode === 'timed') return `Tienes 60 segundos para ${hard ? 'escribir las traducciones en inglés sin opciones' : 'elegir las traducciones'}. El reloj sigue si sales. Puedes saltar una pregunta y repasarla después.`;
  if (mode === 'recall' || (mode === 'translation' && hard)) return 'Lee la expresión en español y escribe su traducción en inglés, sin opciones. Aceptamos las alternativas incluidas en este vocabulario. Puedes saltar lo que aún no recuerdas.';
  if (mode === 'ordering') return hard ? 'Escribe la frase completa en inglés, sin banco de palabras. Practicarás esta situación y las dos anteriores. Comparamos con una frase de referencia; pueden existir otras traducciones válidas.' : 'Toca las palabras para construir la frase. Toca una palabra elegida para quitarla; también puedes deshacer el último paso.';
  if (mode === 'completion') return hard ? 'Completa frases de esta situación y las dos anteriores. Fíjate en el tiempo verbal, las preposiciones y el contexto; no todas las respuestas son una sola palabra.' : 'Completa la frase con la palabra o expresión que falta. Usa la pista entre paréntesis cuando aparezca y lee el porqué después de responder.';
  return 'Elige la traducción correcta entre expresiones de la misma situación. Después prueba escribir de memoria para recordar sin opciones.';
}
function renderChallenge(): void {
  const q = state.quiz;
  const active = q && q.week === route.week && q.mode === route.mode && (!location.hash.includes('guide=1') || q.guideDay === route.day);
  // Older saved games did not store their direction. Freeze it when resumed.
  if (active && !q.direction) { q.direction = state.preferences.direction; save(); }
  const difficulty = state.preferences.difficulty || 'standard';
  const forcedEnglish = route.mode === 'recall' || difficulty === 'challenge';
  const direction = forcedEnglish ? 'es-en' : state.preferences.direction;
  $('view').innerHTML = panel(`${heading('PRÁCTICA EN CONTEXTO', 'Pon tu inglés en juego.', 'Reconoce, recuerda y construye. Cada error te da una oportunidad de practicar otra vez.')}
    ${!active ? '<div class="practice-path" aria-label="Formas de practicar"><span><b>01</b> Reconoce la expresión</span><span><b>02</b> Escríbela de memoria</span><span><b>03</b> Úsala en una frase</span></div>' : ''}
    <details id="gameSettings" class="game-settings" ${!active || q.finishedAt !== null ? 'open' : ''}><summary>${active ? `${e(categories.find(c => c.id === q.week)!.title)} · ${modeLabel(q.mode)} · ${q.difficulty === 'challenge' ? 'Desafío' : q.difficulty === 'gentle' ? 'Paso a paso' : 'Normal'}<small>Cambiar actividad o ritmo</small>` : 'Elige tu actividad'}</summary>
    <div class="controls"><label class="field">Situación<select id="quizWeek">${weekOptions(route.week)}</select></label><label class="field">Actividad<select id="quizMode">${(['translation', 'recall', 'completion', 'ordering', 'timed', 'listening', 'reading'] as Mode[]).map(m => `<option value="${m}" ${m === route.mode ? 'selected' : ''}>${modeLabel(m)}</option>`).join('')}</select></label><label class="field">Dificultad<select id="difficulty"><option value="gentle" ${difficulty === 'gentle' ? 'selected' : ''}>Paso a paso · hasta 5 preguntas</option><option value="standard" ${difficulty === 'standard' ? 'selected' : ''}>Consolidación · hasta 10 preguntas</option><option value="challenge" ${difficulty === 'challenge' ? 'selected' : ''}>Desafío · escribe y combina</option></select></label></div>
    ${route.mode === 'translation' || route.mode === 'timed' || route.mode === 'recall' ? `<label class="field difficulty-field">Dirección de traducción<select id="quizDirection" ${forcedEnglish ? 'disabled' : ''}><option value="en-es" ${direction === 'en-es' ? 'selected' : ''}>Inglés → Español</option><option value="es-en" ${direction === 'es-en' ? 'selected' : ''}>Español → Inglés</option></select></label>` : ''}
    <p class="hint">${active && q.finishedAt === null ? 'Los cambios se aplican al próximo intento. El intento actual conserva su ritmo y dirección.' : 'Elige una situación, una actividad y un ritmo. Tu resultado se guarda al terminar.'}</p></details><div id="quizArea"></div><div class="lesson-btns">${button('newQuiz', active ? 'Reiniciar actividad' : 'Comenzar actividad', active && q.finishedAt === null ? 'outline' : 'primary')}</div><div id="restartConfirm" hidden class="warning"><p>Reiniciar descarta este intento sin terminar. Los resultados anteriores se conservan.</p>${button('confirmRestart', 'Descartar intento y comenzar')}${button('cancelRestart', 'Seguir con este intento', 'outline')}</div>`);
  const change = () => { selectedTokens = []; go(`#/challenge/${route.day}?week=${$<HTMLSelectElement>('quizWeek').value}&mode=${$<HTMLSelectElement>('quizMode').value}`); };
  $('quizWeek').onchange = change; $('quizMode').onchange = change;
  $('difficulty').onchange = ev => { selectDifficulty((ev.target as HTMLSelectElement).value as Difficulty); save(); renderChallenge(); $<HTMLDetailsElement>('gameSettings').open = true; $('difficulty').focus(); };
  const directionSelect = document.getElementById('quizDirection');
  if (directionSelect) directionSelect.onchange = ev => { state.preferences.direction = (ev.target as HTMLSelectElement).value as Direction; save(); };
  bind('newQuiz', () => {
    if (state.quiz && state.quiz.finishedAt === null) { $('restartConfirm').hidden = false; $('confirmRestart').focus(); }
    else startQuiz();
  });
  bind('confirmRestart', startQuiz); bind('cancelRestart', () => { $('restartConfirm').hidden = true; $('newQuiz').focus(); });
  if (active) renderQuestion();
  else $('quizArea').innerHTML = `<div class="empty-state game-preview"><div class="eyebrow">${difficulty === 'challenge' ? 'UN PASO MÁS ALLÁ' : 'TU PRÓXIMO RETO'}</div><h2>${modeLabel(route.mode)}</h2><p>${gameDescription(route.mode, difficulty)}</p><p class="hint">${route.mode === 'timed' ? '60 segundos' : 'Sin límite de tiempo'} · ${difficulty === 'gentle' ? 'Hasta 5' : 'Hasta 10'} preguntas · Explicación después de cada respuesta</p>${state.quiz?.finishedAt === null ? `<p class="hint">Tienes otro intento pendiente. ${link(`#/challenge/${state.quiz.day}?week=${state.quiz.week}&mode=${state.quiz.mode}`, 'Volver al intento pendiente')}</p>` : ''}</div>`;
  if (timer) clearInterval(timer);
  if (state.quiz?.deadline && state.quiz.finishedAt === null) timer = setInterval(updateTimer, 250);
}
function focusQuestion(): void {
  document.querySelector<HTMLElement>('[data-speak]:not(:disabled), #revealListening, #answerInput:not(:disabled), [data-option], [data-token]:not(:disabled), #retryMistakes, #newQuiz')?.focus();
  document.querySelector<HTMLElement>('.question-box')?.scrollIntoView({block: 'nearest'});
}
function startQuiz(): void {
  const mapped = new URLSearchParams(location.hash.split('?')[1]).get('guide') === '1' ? guideDay(route.day) : null;
  const pool = words.filter(w => mapped?.vocabulary.length ? mapped.vocabulary.includes(w.id) : w.weeks.includes(route.week));
  const difficulty = state.preferences.difficulty || 'standard';
  const hard = difficulty === 'challenge';
  const direction: Direction = hard || route.mode === 'recall' ? 'es-en' : state.preferences.direction;
  const sentencePool = (hard ? categories.filter(c => c.id <= route.week && c.id >= route.week - 2) : categories.filter(c => c.id === route.week))
    .flatMap(c => sentenceQuestions(c.id, route.mode));
  const questions = route.mode === 'reading' ? readingQuestions(route.week, difficulty) : route.mode === 'listening' ? practiceSentences.filter(s => mapped ? mapped.sentences.includes(s.id) : s.category === route.week && (hard ? s.id.startsWith('extension-') : !s.id.startsWith('extension-') && !challengeSentences.has(s.id))).slice(0, difficulty === 'gentle' ? 2 : hard ? 6 : 4).map(s => ({ id: s.id, prompt: 'Escucha y escribe la frase en inglés.', answer: s.en, explanation: `${s.es} ${s.explanation}` })) : route.mode === 'completion' || route.mode === 'ordering' ? sentencePool.filter(q => mapped ? mapped.sentences.includes(q.id) : hard || (!challengeSentences.has(q.id) && !q.id.startsWith('extension-')))
    : hard || route.mode === 'recall' ? recallQuestions(pool, words, direction) : translationQuestions(pool, words, direction);
  if (!questions.length) { status('No hay ejercicios de este tipo para ese día. Elige otra actividad.'); return; }
  const candidates = !mapped && difficulty === 'gentle' && (route.mode === 'completion' || route.mode === 'ordering') ? questions.filter(q => /-[12]$/.test(q.id)) : questions;
  const chosen = prioritize(shuffle(candidates), state).slice(0, difficulty === 'gentle' ? 5 : 10);
  state.quiz = { ...newQuiz(route.mode, route.week, route.day, chosen), direction, difficulty, ...(mapped ? { guideDay: mapped.day } : {}) };
  selectedTokens = []; save(); renderChallenge(); focusQuestion();
  $('quizArea').scrollIntoView({ block: 'nearest' });
}
function renderQuestion(): void {
  $('quizArea').classList.remove('celebrate');
  stopAudio();
  const q = state.quiz!;
  const direction = q.direction || state.preferences.direction;
  const hard = q.difficulty === 'challenge';
  const listening = q.mode === 'listening';
  const translation = q.mode === 'translation' || q.mode === 'timed' || q.mode === 'recall';
  if (q.deadline !== null && Date.now() >= q.deadline && q.finishedAt === null) { finishQuiz(state, q); save(); }
  if (q.finishedAt !== null) {
    const score = quizScore(q); const missed = q.questions.length - score;
    $('quizArea').innerHTML = `<div class="result-card"><div class="eyebrow">${storageSaved ? 'ACTIVIDAD COMPLETADA' : 'RESULTADO DE ESTA SESIÓN'}${q.retry ? ' · REPASO DE ERRORES' : ''}</div><h2>${score} de ${q.questions.length}</h2><p>${translation ? 'Traducciones correctas.' : 'Respuestas correctas según el modelo del ejercicio.'} ${q.deadline ? 'Las preguntas sin contestar cuentan como cero.' : ''}${listening ? ` Escucha sin texto: ${score} aciertos. ${q.assisted?.length || 0} respuestas con apoyo escrito, sin puntuación.` : ''}</p><p>${missed ? `${missed} ${missed === 1 ? 'respuesta para reforzar' : 'respuestas para reforzar'}. Intenta recordarlas de nuevo antes de mirar la solución.` : '¡Ronda completa! Prueba otra situación o un ritmo más exigente.'}</p>${missed ? button('retryMistakes', `Repasar ${missed} ${missed === 1 ? 'error' : 'errores'}`) : ''}${q.deadline && missed ? '<p class="hint">El repaso inicia un nuevo reloj de 60 segundos.</p>' : ''}<p class="hint">Cada ronda guarda su propio resultado. El repaso no cambia la nota anterior.</p></div><details><summary>Ver respuestas y explicaciones</summary>${q.questions.map((item, i) => `<div class="review-item"><span class="review-label">${q.assisted?.includes(i) ? 'Con apoyo escrito' : questionCorrect(item, q.responses[i]) ? '✓ Recordada' : '↻ Por reforzar'}</span><p><strong>${e(item.prompt)}</strong></p><p>Tu respuesta: ${e(q.responses[i] || 'Sin responder')}</p><p>Respuesta de referencia: <strong>${e(item.answer)}</strong></p><p class="hint">${e(item.explanation)}</p></div>`).join('')}</details>`;
    if (missed) bind('retryMistakes', () => {
      const retry = retryQuiz(q); if (!retry) return;
      state.quiz = retry; selectedTokens = []; save(); renderChallenge(); focusQuestion();
    });
    return;
  }
  const item = q.questions[q.index]; const response = q.responses[q.index]; const answered = response !== null;
  const correct = questionCorrect(item, response); const combo = quizStreak(q);
  const needsReading = listening && (state.preferences.learningAudio === false || !audioAvailable()) && !q.assisted?.includes(q.index);
  const typed = !item.options && (q.mode !== 'ordering' || hard);
  const feedback = answered ? `<div class="feedback ${correct ? 'is-correct' : 'needs-review'}" role="status">${correct ? celebrationMark() : ''}<strong>${correct ? '✓ ¡Correcto!' : response === '' ? 'La dejamos para el repaso.' : 'Todavía no. Compara y vuelve a intentarlo en el repaso.'}</strong>${correct && combo >= 2 ? `<span class="combo-message">${combo} aciertos seguidos${combo >= 5 ? ' · ¡Vas muy bien!' : ''}</span>` : ''}<p>Respuesta de referencia: <span lang="${translation && direction === 'en-es' ? 'es' : 'en'}">${e(item.answer)}</span></p><p>${e(item.explanation)}</p>${typed ? '<p class="hint">Usamos respuestas de referencia. Puede haber otras formas válidas; compáralas con el ejemplo.</p>' : ''}</div>` : '';
  const inputLabel = listening ? 'La frase que escuchaste en inglés' : q.mode === 'completion' ? 'Palabra o expresión que falta' : q.mode === 'ordering' ? 'La frase completa en inglés' : `Tu traducción en ${direction === 'en-es' ? 'español' : 'inglés'}`;
  $('quizArea').innerHTML = `<div class="question-box"><div class="question-meta"><span class="eyebrow">PREGUNTA ${q.index + 1} DE ${q.questions.length}</span>${q.deadline ? '<strong id="timer" role="timer" aria-label="Segundos restantes"></strong>' : ''}</div><div class="game-progress"><progress value="${q.responses.filter(r => r !== null).length}" max="${q.questions.length}" aria-label="Preguntas respondidas"></progress><span>${quizScore(q)} ${quizScore(q) === 1 ? 'acierto' : 'aciertos'}${combo >= 2 ? ` · ${combo} seguidos` : ''}</span></div><p class="hint">${q.retry ? 'Repaso de errores · ' : ''}${hard ? 'Desafío · ' : ''}${q.mode === 'reading' ? 'Lee el texto y elige la respuesta mejor respaldada.' : listening ? 'Escucha antes de leer.' : translation ? direction === 'en-es' ? 'Inglés → Español' : 'Español → Inglés' : q.mode === 'ordering' ? hard ? 'Escribe la frase sin banco de palabras.' : 'Toca las palabras en orden.' : 'Completa el espacio; puede faltar más de una palabra.'}${hard && !translation ? ' · Situaciones combinadas' : ''}</p>${item.context ? `<div class="reading-passage" lang="en">${e(item.context)}</div>` : ''}<h2 lang="${listening || q.mode === 'ordering' || (translation && direction === 'es-en') ? 'es' : 'en'}">${e(item.prompt)}</h2>${listening ? `${audioControls(item.answer)}${!answered && !q.assisted?.includes(q.index) ? button('revealListening', 'Ver texto y practicar leyendo', 'outline') : ''}${q.assisted?.includes(q.index) ? `<p lang="en">${e(item.answer)}</p><p class="hint">Lectura asistida: no suma un acierto de escucha.</p>` : ''}` : ''}
    ${item.options ? `<div class="options">${item.options.map((o, i) => `<button class="answer ${answered && matches(o, item.answer) ? 'correct' : answered && matches(o, response) ? 'incorrect' : ''}" lang="${q.mode === 'reading' || direction !== 'en-es' ? 'en' : 'es'}" data-option="${i}" ${answered ? 'disabled' : ''}><span class="option-number" aria-hidden="true">${i + 1}</span><span>${e(o)}</span>${answered && matches(o, item.answer) ? '<span class="option-result">✓ Correcta</span>' : answered && matches(o, response) ? '<span class="option-result">Tu respuesta</span>' : ''}</button>`).join('')}</div>` : typed ? `<form id="answerForm"><label for="answerInput">${inputLabel}</label><input id="answerInput" maxlength="500" autocomplete="off" autocapitalize="off" spellcheck="false" ${answered || needsReading ? 'disabled' : ''} ${needsReading ? 'data-audio-needed' : ''} value="${e(response || '')}" required>${!answered ? `<button id="checkAnswer" class="primary" type="submit" ${needsReading ? 'disabled data-audio-needed' : ''}>Comprobar respuesta</button>` : ''}</form>` : `<p class="hint">Toca una palabra elegida para quitarla. Usa todas las palabras.</p><div class="token-answer" id="tokenAnswer" aria-label="Tu frase"></div><div class="tokens" id="tokens"></div>${!answered ? `<div class="lesson-btns">${button('checkOrder', 'Comprobar orden')}${button('undoToken', 'Deshacer', 'outline')}${button('clearTokens', 'Empezar frase de nuevo', 'outline')}</div>` : ''}`}
    ${!answered ? button('skipQuestion', 'No lo sé · repasar después', 'quiet-link skip-question') : ''}${feedback}${answered ? button('nextQuestion', q.index + 1 === q.questions.length ? 'Ver resultado' : 'Siguiente pregunta →') : ''}</div>`;
  document.querySelectorAll<HTMLButtonElement>('[data-option]').forEach(b => { b.onclick = () => submitAnswer(item.options![Number(b.dataset.option)]); });
  if (typed && !answered) $('answerForm').onsubmit = ev => { ev.preventDefault(); submitAnswer($<HTMLInputElement>('answerInput').value); };
  if (q.mode === 'ordering' && !hard) {
    renderTokens();
    if (!answered) {
      bind('checkOrder', () => { if (selectedTokens.length !== item.tokens!.length) { status('Usa todas las palabras antes de comprobar.'); return; } submitAnswer(selectedTokens.map(i => item.tokens![i]).join(' ')); });
      bind('undoToken', () => { selectedTokens.pop(); renderTokens(); document.querySelector<HTMLElement>('[data-token]:not(:disabled)')?.focus(); });
      bind('clearTokens', () => { selectedTokens = []; renderTokens(); document.querySelector<HTMLElement>('[data-token]')?.focus(); });
    }
  }
  if (listening && !answered && !q.assisted?.includes(q.index)) bind('revealListening', () => { (q.assisted ||= []).push(q.index); save(); renderQuestion(); focusQuestion(); });
  if (!answered) bind('skipQuestion', () => submitAnswer('', true));
  if (answered) bind('nextQuestion', () => {
    if (q.index + 1 >= q.questions.length) { finishQuiz(state, q); save(); }
    else { q.index++; selectedTokens = []; save(); }
    renderQuestion(); focusQuestion();
  });
  updateTimer();
}
function renderTokens(): void {
  const q = state.quiz!; const item = q.questions[q.index]; const answered = q.responses[q.index] !== null;
  $('tokenAnswer').innerHTML = answered ? `<p lang="en">${e(q.responses[q.index] || 'Sin responder')}</p>` : selectedTokens.length ? selectedTokens.map((index, position) => `<button class="token chosen" lang="en" data-remove="${position}" aria-label="Quitar ${e(item.tokens![index])}">${e(item.tokens![index])}</button>`).join('') : '<span class="hint">Tu frase aparecerá aquí.</span>';
  $('tokens').innerHTML = item.tokens!.map((word, i) => `<button class="token" lang="en" data-token="${i}" ${answered || selectedTokens.includes(i) ? 'disabled' : ''}>${e(word)}</button>`).join('');
  for (const id of ['undoToken', 'clearTokens']) { const b = document.getElementById(id) as HTMLButtonElement | null; if (b) b.disabled = selectedTokens.length === 0; }
  document.querySelectorAll<HTMLButtonElement>('[data-token]').forEach(b => { b.onclick = () => { selectedTokens.push(Number(b.dataset.token)); renderTokens(); document.querySelector<HTMLElement>('[data-token]:not(:disabled), #checkOrder')?.focus(); }; });
  document.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(b => { b.onclick = () => { selectedTokens.splice(Number(b.dataset.remove), 1); renderTokens(); document.querySelector<HTMLElement>('[data-token]:not(:disabled)')?.focus(); }; });
}
function submitAnswer(value: string, skip = false): void {
  if ((!value.trim() && !skip) || !state.quiz) return;
  const accepted = answerQuiz(state.quiz, value); if (accepted) save();
  renderQuestion();
  if (accepted && questionCorrect(state.quiz.questions[state.quiz.index], value)) celebrate($('quizArea'));
  document.getElementById('nextQuestion')?.focus();
}

function updateTimer(): void {
  const q = state.quiz;
  if (!q || q.deadline === null || q.finishedAt !== null) return;
  const remaining = Math.max(0, Math.ceil((q.deadline - Date.now()) / 1000));
  const el = document.getElementById('timer'); if (el) el.textContent = `${remaining} s`;
  if (remaining === 0) { finishQuiz(state, q); save(); if (route.section === 'challenge' && route.mode === q.mode && route.week === q.week) renderQuestion(); savedStatus('Tiempo terminado. Resultado guardado.'); }
}

function assessmentStore(): { bucket: Record<string, Assessment>; key: string } {
  const difficulty = state.preferences.difficulty || 'standard';
  const legacy = difficulty === 'standard' && publicContent.tests.some(t => t.category === route.week);
  return { bucket: legacy ? state.assessments : (state.practiceTests ||= {}), key: legacy ? String(route.week) : `${route.week}:${difficulty}` };
}
function renderAssessments(): void {
  const difficulty = state.preferences.difficulty || 'standard';
  const {bucket,key} = assessmentStore();
  const prefix = `assessment-${key}-`;
  const round = state.history.filter(r => r.id.startsWith(prefix)).length;
  const existed = !!bucket[key];
  const a = bucket[key] ||= { ...emptyAssessment(), ...(key.includes(':') ? {questions:practiceTest(route.week,difficulty,round)} : {}) };
  if (!existed) save();
  const items = a.questions || practiceTest(route.week,'standard');
  const title = categories.find(c => c.id === route.week)!.title;
  const submitted = a.submittedAt !== null;
  const missed = items.filter((q,i) => !questionCorrect(q,a.answers[i]));
  const writing = extensionContent.readings.find(r => r.category === route.week)!.writing;
  $('view').innerHTML = panel(`${heading('COMPRUEBA LO QUE RECUERDAS', 'Tests de práctica gratuitos', 'Doce situaciones, tres dificultades. Cada ronda incluye cuatro preguntas; las tareas abiertas se revisan por separado.')}<div class="controls"><label class="field assessment-picker">Elegir test<select id="assessmentWeek">${weekOptions(route.week)}</select></label>${difficultyControl('testDifficulty')}</div>
  <div class="callout"><p>${difficulty === 'gentle' ? 'Elige respuestas con apoyo de opciones.' : difficulty === 'challenge' ? 'Combina estructuras complejas con lectura e inferencias. Usa solo la información del texto.' : 'Completa frases sin opciones y revisa la estructura.'} Tu borrador se conserva por situación y dificultad. Cambiar de dificultad no borra los otros intentos.</p></div>
  ${submitted ? `<div class="result-card"><div class="eyebrow">${storageSaved ? 'TU RESULTADO' : 'RESULTADO DE ESTA SESIÓN'}</div><h2>${assessmentScore(items,a.answers)} / 4</h2><p>${missed.length ? `Revisa ${missed.length} respuestas y sus explicaciones antes de probar otra ronda.` : 'Resolviste esta ronda. Ahora expresa una idea propia sin mirar.'}</p><div class="lesson-btns">${link(`#/cards?week=${route.week}`, 'Repasar esta categoría')}${button('retryAssessment','Iniciar otro intento','outline')}</div></div>` : '<p class="hint">Tu borrador se guarda en este navegador. Puedes volver más tarde.</p>'}
  <form id="assessmentForm"><fieldset ${submitted ? 'disabled' : ''}><legend>Resuelve estas cuatro preguntas</legend>${items.map((q,i) => `<div class="exercise">${q.context ? `<div class="reading-passage" lang="en">${e(q.context)}</div>` : ''}<label for="assessmentAnswer${i}"><span>${i+1}.</span> <span lang="en">${e(q.prompt)}</span></label>${q.options ? `<select id="assessmentAnswer${i}" data-index="${i}" required><option value="">Elige una respuesta</option>${q.options.map(o=>`<option value="${e(o)}" ${a.answers[i] === o ? 'selected' : ''}>${e(o)}</option>`).join('')}</select>` : `<input id="assessmentAnswer${i}" data-index="${i}" value="${e(a.answers[i])}" maxlength="500" autocomplete="off" spellcheck="false" required>`}${submitted ? `<div class="feedback ${questionCorrect(q,a.answers[i]) ? 'is-correct' : 'needs-review'}"><strong>${questionCorrect(q,a.answers[i]) ? '✓ ¡Correcto!' : 'Revisa esta respuesta.'}</strong><p>Respuesta esperada: ${e(q.answer)}</p><p>${e(q.explanation)}</p></div>` : ''}</div>`).join('')}</fieldset>${!submitted ? '<button type="submit" class="primary">Corregir y guardar test</button>' : ''}</form>
  <div class="tile spaced"><h2>Ahora úsalo en una idea propia</h2><p>${difficulty === 'challenge' ? `${e(writing)} Escribe entre 140 y 190 palabras.` : difficulty === 'standard' ? `Escribe entre 60 y 90 palabras sobre ${e(title.toLowerCase())}. Conecta tus ideas con razones y un ejemplo.` : `Escribe dos frases sencillas sobre ${e(title.toLowerCase())}.`}</p><p class="hint">Sin nota automática. Revisa: ¿cumpliste el objetivo?, ¿las ideas se conectan?, ¿los tiempos verbales son coherentes?, ¿puedes expresar una idea de otra manera? Para valorar calidad y naturalidad, contrasta tu texto con un tutor o interlocutor.</p><label for="assessmentNotes">Mis frases y lo que debo revisar</label><textarea id="assessmentNotes" rows="5" maxlength="20000">${e(a.notes)}</textarea>${submitted ? button('saveSelfReview','Guardar mis notas','outline') : '<p class="hint">Tus notas se guardan junto con el borrador.</p>'}</div>
  <div class="lesson-btns">${link(`#/ai?week=${route.week}`,'Practicar conversación con IA')}${link('#/progress','Ver historial')}</div><p class="hint">Estos tests sirven para practicar. No certifican un nivel de inglés ni sustituyen una evaluación oficial.</p>`);
  bindDifficulty('testDifficulty',renderAssessments);
  $('assessmentWeek').onchange = ev => go(`#/assessments?week=${(ev.target as HTMLSelectElement).value}`);
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-index]').forEach(input => { input.oninput = () => { if (!submitted) { a.answers[Number(input.dataset.index)] = input.value; save(); } }; });
  $('assessmentNotes').oninput = ev => { a.notes = (ev.target as HTMLTextAreaElement).value; save(); };
  if (submitted) {
    bind('retryAssessment', () => { bucket[key] = {...emptyAssessment(),...(key.includes(':') ? {questions:practiceTest(route.week,difficulty,round)} : {})}; save(); renderAssessments(); });
    bind('saveSelfReview', () => { const result = state.history.find(r => r.id === `${prefix}${a.submittedAt}`); if (result) result.assessment = structuredClone(a); save(); savedStatus('Tus notas están guardadas. La puntuación del test no cambia.'); });
  }
  $('assessmentForm').onsubmit = ev => {
    ev.preventDefault(); if (a.submittedAt !== null) return; a.submittedAt = Date.now();
    recordEvidence(state,items,a.answers);
    state.history.push({id:`${prefix}${a.submittedAt}`,label:`Test · ${title} · ${difficultyLabels[difficulty]}`,kind:'assessment',at:a.submittedAt,score:assessmentScore(items,a.answers),total:4,selfScore:null,assessment:structuredClone(a)});
    save(true); renderAssessments(); savedStatus('Test guardado. Revisa tus respuestas.');
  };
}

function renderAI(): void {
  const selected = categories.find(c => c.id === route.week)!;
  const dailyWords = new URLSearchParams(location.hash.split('?')[1]).get('daily') === '1' ? state.daily?.items.map(i => words.find(w => w.id === i.wordId)).filter((w): w is Vocabulary => !!w) : undefined;
  const prompt = conversationPrompt(selected.id, dailyWords, state.preferences.difficulty || 'standard');
  $('view').innerHTML = panel(`${heading('LLEVA TU INGLÉS A UNA CONVERSACIÓN', 'Practica con un asistente de IA')}<p>Elige una situación, copia el ejemplo y abre tu asistente. Puedes empezar sin materiales adicionales.</p><label class="field">Situación<select id="aiCategory">${weekOptions(route.week)}</select></label>${difficultyControl('aiDifficulty')}<label for="aiPrompt">Mensaje para el asistente · puedes editarlo</label><textarea id="aiPrompt" rows="7">${e(prompt)}</textarea>${button('copyPrompt', 'Copiar mensaje')}<div class="provider-grid spaced"><article class="tile"><h2>ChatGPT</h2><p>Pega el mensaje y responde por texto o por voz, si tienes esa opción.</p>${link('https://chatgpt.com/', 'Abrir ChatGPT ↗')}</article><article class="tile"><h2>Gemini</h2><p>Pega el mensaje para empezar. Si tu cuenta ofrece conversación por voz, también puedes usarla.</p>${link('https://gemini.google.com/', 'Abrir Gemini ↗')}</article><article class="tile"><h2>Grok</h2><p>Busca la conversación por voz; si no está disponible, practica por texto.</p>${link('https://grok.com/', 'Abrir Grok ↗')}</article></div><div class="callout"><h3>Si no puedes usar la voz</h3><p>Responde por escrito y lee tu respuesta en voz alta. Sin escuchar tu voz, el asistente no puede comprobar tu pronunciación. English 90 no graba audio ni envía tus respuestas a estos servicios. No pegues información sensible; cada proveedor aplica sus propias condiciones y posibles límites o costos.</p></div>${link('/aprender/practicar-con-ia/', 'Cómo aprovechar esta práctica')}`);
  bindDifficulty('aiDifficulty', renderAI);
  $('aiCategory').onchange = ev => go(`#/ai?week=${(ev.target as HTMLSelectElement).value}`);
  document.querySelectorAll<HTMLAnchorElement>('.provider-grid a').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
  bind('copyPrompt', () => { void copyPrompt(); });
}
async function copyPrompt(): Promise<void> {
  const field = $<HTMLTextAreaElement>('aiPrompt');
  try { await navigator.clipboard.writeText(field.value); status('Mensaje copiado. Pégalo en tu asistente.'); }
  catch { field.focus(); field.select(); status('La copia automática no está disponible. El texto está seleccionado: usa Copiar en tu dispositivo.'); }
}

function renderProgress(): void {
  const evidence = independentAccuracy(state);
  const earned = milestones(state);
  const done = Object.values(state.done).filter(Boolean).length;
  const progress = categoryProgress(words, state, state.preferences.direction);
  const ranked = progress.filter(c => c.accuracy !== null).sort((a,b) => b.accuracy! - a.accuracy!);
  $('view').innerHTML = panel(`${heading('TU PRÁCTICA DEJA HUELLA', 'Cada paso cuenta.', `Racha de ${dayLabel(streak(state.activity))} · progreso guardado en este dispositivo`)}${learningMetrics()}<div class="lesson-btns">${link('#/daily', 'Practicar hoy', 'primary')}${button('jumpBackup', 'Guardar o recuperar una copia', 'outline')}</div><p>${Object.keys(state.cards).length} tarjetas repasadas entre las dos direcciones · ${Object.values(state.cards).reduce((n,c) => n+c.reviews,0)} repasos registrados.</p><div class="callout"><p>${ranked.length >= 2 ? `Categoría más recordada: <strong>${e(ranked[0].title)}</strong>. Para reforzar: <strong>${e(ranked.at(-1)!.title)}</strong>.` : 'Repasa al menos cinco palabras en dos categorías para ver qué recuerdas mejor y qué puedes reforzar.'}</p><p class="hint">Comparación de tus repasos en ${state.preferences.direction === 'en-es' ? 'inglés → español' : 'español → inglés'}. Refleja cómo calificaste cada tarjeta, no un nivel oficial de inglés.</p></div><div class="category-grid">${progress.map(c=>`<a class="category-card" href="#/cards?week=${c.id}"><strong>${e(outcomes[c.id])}</strong><span>${e(c.title)}</span><progress value="${c.reviewed}" max="${c.total}" aria-label="Tarjetas estudiadas en ${e(c.title)}"></progress><span>${c.reviewed}/${c.total} estudiadas · ${c.known} recordadas la última vez</span><span>${c.reviewed === c.total ? 'Todas las tarjetas practicadas' : c.reviewed ? 'En práctica' : 'Disponible para empezar'}</span><span>${c.difficult} por reforzar · Primer paso: ${Math.min(c.reviewed, 5)}/5 tarjetas estudiadas</span></a>`).join('')}</div>${done || Object.keys(state.notes).length ? `<details class="spaced"><summary>Archivo de la versión anterior · ${done} días completados</summary><p>Se conservan los días, notas, evaluaciones e intentos anteriores en este dispositivo y en tus respaldos. Aquí puedes consultar lo que guardaste antes.</p><p>Días completados: ${Object.keys(state.done).filter(k=>state.done[k]).map(e).join(', ') || 'ninguno'}</p>${Object.entries(state.notes).map(([n,note])=>`<p><strong>Día ${e(n)}:</strong> ${e(note)}</p>`).join('')}</details>` : ''}<h2 class="spaced">Recuerdo escrito sin ayuda</h2>${evidence.attempts ? `<progress value="${evidence.correct}" max="${evidence.attempts}" aria-label="Respuestas escritas correctas sin ayuda"></progress>` : ''}<p>${evidence.attempts ? `${evidence.correct} de ${evidence.attempts} respuestas correctas (${Math.round(evidence.correct / evidence.attempts * 100)}%).` : 'Completa ejercicios escritos para empezar este registro.'}</p><p class="hint">Un primer intento por expresión y día. Excluye repeticiones inmediatas, opciones y respuestas reveladas. No mide fluidez ni pronunciación.</p>${earned.length ? `<h2>Pequeños logros</h2><ul>${earned.map(label => `<li>${e(label)}</li>`).join('')}</ul>${button('shareAchievement', 'Compartir mi práctica', 'outline')}` : ''}<h2 class="spaced">Resultados guardados</h2><p class="hint">Revisa tus intentos anteriores y las notas que escribiste. Estudiada significa que calificaste la tarjeta; los repasos cuentan cada intento. Recordada significa que elegiste «La conozco» la última vez, no dominio verificado ni competencia conversacional.</p>${state.history.length ? `<div class="history-list">${[...state.history].reverse().map(r => `<details class="history-item"><summary><span>${e(r.label)}<small>${dateText(r.at)}</small></span><strong>${r.score}/${r.total}</strong></summary><p>${r.id.startsWith('daily-') && !r.id.endsWith('-written') ? `${r.score} de ${r.total} tarjetas marcadas como recordadas. Esta es tu autoevaluación, no una nota de examen.` : r.kind === 'assessment' ? `Respuestas correctas: ${r.score}/${r.total}.${r.selfScore === null ? '' : ` Autoevaluación de la versión anterior: ${r.selfScore}/6.`}` : `${r.score}/${r.total} en este intento.`}</p>${r.assessment ? `<p>Respuestas: ${r.assessment.answers.map(e).join(' · ')}</p><p>Escritura: ${e(r.assessment.writing || 'Sin registro')}</p><p>Notas: ${e(r.assessment.notes || 'Sin registro')}</p>` : ''}</details>`).join('')}</div>` : '<div class="empty-state"><p>Aquí verás tus resultados cuando completes una sesión diaria, un juego o un test.</p></div>'}
    <details class="spaced"><summary>Preferencias de práctica</summary><label><input type="checkbox" id="learningAudio" ${state.preferences.learningAudio !== false ? 'checked' : ''}> Activar audio de aprendizaje</label><p class="hint">Usamos voces locales en inglés, sin micrófono. Las animaciones respetan la preferencia de movimiento reducido de tu dispositivo.</p></details><div id="backupTools" class="tile spaced" tabindex="-1"><h2>Tu progreso, a salvo</h2><p>Descarga una copia de tu progreso y guárdala en un lugar seguro. Para cambiar de dispositivo, impórtala en el otro navegador. El respaldo incluye tus notas personales.</p><div class="lesson-btns">${button('export', 'Exportar progreso')}<label class="outline file-label" for="importFile">Importar respaldo<input id="importFile" type="file" accept="application/json,.json"></label></div><div id="importPreview" class="callout" hidden></div><p class="hint">Importar reemplaza el progreso de este navegador después de que revises el archivo. No combina dos historiales.</p></div><details class="spaced"><summary>Restablecer este dispositivo</summary><p>Borra las tarjetas, notas, intentos, preferencias y el archivo de días de la versión anterior. Exporta un respaldo primero.</p>${button('showReset', 'Preparar borrado', 'outline')}<div id="resetConfirm" hidden class="warning"><p>Esta acción no se puede deshacer sin un respaldo.</p>${button('resetProgress', 'Borrar todo mi progreso')}${button('cancelReset', 'Cancelar', 'outline')}</div></details>`);
  if (earned.length) bind('shareAchievement', () => { const text = `Estoy practicando inglés con English 90: ${earned[earned.length - 1].toLowerCase()}.`; void (async () => { try { if (navigator.share) await navigator.share({text}); else { await navigator.clipboard.writeText(text); status('Logro copiado.'); } } catch { status('No se compartió. Puedes copiar: ' + text); } })(); });
  $('learningAudio').onchange = ev => { state.preferences.learningAudio = (ev.target as HTMLInputElement).checked; stopAudio(); save(); };
  bind('export', exportProgress);
  bind('jumpBackup', () => { $('backupTools').scrollIntoView({block: 'start'}); $('backupTools').focus({preventScroll: true}); });
  $('importFile').onchange = ev => { void prepareImport((ev.target as HTMLInputElement).files?.[0]); };
  bind('showReset', () => { $('resetConfirm').hidden = false; $('resetProgress').focus(); });
  bind('cancelReset', () => { $('resetConfirm').hidden = true; $('showReset').focus(); });
  bind('resetProgress', () => {
    state = emptyState(); protectOriginal = false; warning('');
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* save() reports unavailable storage */ }
    save(); renderProgress(); savedStatus('Progreso restablecido en este navegador.');
  });
}
function exportProgress(): void {
  const url = URL.createObjectURL(new Blob([exportBackup(state)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `english90-progreso-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  status('Respaldo preparado para descargar.');
}
async function prepareImport(file?: File): Promise<void> {
  importCandidate = null;
  if (!file) return;
  try {
    if (file.size > 10000000) throw new Error('El archivo supera el límite de 10 MB.');
    importCandidate = importBackup(await file.text(), words);
    if (route.section !== 'progress') return;
    const candidate = importCandidate;
    $('importPreview').hidden = false;
    $('importPreview').innerHTML = `<h3>Revisar respaldo: ${e(file.name)}</h3><p>${Object.values(candidate.done).filter(Boolean).length} días completados · ${Object.keys(candidate.cards).length} tarjetas programadas · ${candidate.history.length} resultados.</p><p>Reemplazará el avance actual. Puedes exportar antes de continuar.</p>${button('confirmImport', 'Reemplazar con este respaldo')}${button('cancelImport', 'Cancelar', 'outline')}`;
    bind('cancelImport', () => { importCandidate = null; $('importPreview').hidden = true; $<HTMLInputElement>('importFile').value = ''; });
    bind('confirmImport', () => { if (!importCandidate) return; state = importCandidate; importCandidate = null; protectOriginal = false; warning(''); save(); renderProgress(); savedStatus('Respaldo importado.'); });
    $('confirmImport').focus();
  } catch (error) { status(error instanceof Error ? error.message : 'No se pudo leer el respaldo.'); if (route.section === 'progress') { $('importPreview').hidden = true; $<HTMLInputElement>('importFile').value = ''; } }
}

function render(write = true): void {
  stopAudio();
  suppressWrite = !write;
  if (timer) clearInterval(timer);
  route = parseRoute(location.hash, state.day);
  ads.setPlacement(route.section === 'home' ? 'home' : null);
  if (route.section !== 'home' && route.section !== 'progress' && route.section !== 'plan' && route.section !== 'daily') state.lastRoute = `#/${route.section}/${route.day}?week=${route.week}&mode=${route.mode}${location.hash.includes('checkpoint=1') ? '&checkpoint=1' : ''}${location.hash.includes('guide=1') ? '&guide=1' : ''}`;
  if (write) save();
  document.title = `English 90 · ${labels[route.section]}${route.section === 'plan' ? ` · Día ${route.day}` : ''}`;
  document.querySelectorAll<HTMLAnchorElement>('[data-section]').forEach(a => {
    const active = a.dataset.section === route.section || (route.section === 'daily' && a.dataset.section === 'home');
    a.classList.toggle('active', active); if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');

    if (a.dataset.section === 'cards') a.href = `#/cards?week=${state.preferences.week}`;
  });
  const renderers = { home: renderHome, daily: renderDaily, plan: renderPlan, cards: renderCards, challenge: renderChallenge, assessments: renderAssessments, ai: renderAI, progress: renderProgress, guide: renderGuide, situations: renderSituations };
  renderers[route.section]();
  suppressWrite = false;
  if (timer) clearInterval(timer);
  if (state.quiz?.deadline && state.quiz.finishedAt === null) timer = setInterval(updateTimer, 250);
}
window.addEventListener('beforeunload', event => { if (dailySaving) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('hashchange', () => { if (location.hash === '#main') return; selectedTokens = []; extraPractice = false;  status(''); render(); $('main').focus({ preventScroll: true }); window.scrollTo({ top: 0 }); });
// A newer write in another tab must not be overwritten by stale in-memory state.
window.addEventListener('storage', ev => {
  if (ev.key !== STORAGE_KEY || ev.newValue === null) return;
  try { state = validateState(JSON.parse(ev.newValue)); protectOriginal = false; render(false); status('Progreso actualizado desde otra pestaña de este navegador.'); }
  catch { warning('Otra pestaña cambió el progreso con datos incompatibles. Exporta tu sesión antes de recargar.'); protectOriginal = true; }
});
document.addEventListener('visibilitychange', updateTimer);
render();
