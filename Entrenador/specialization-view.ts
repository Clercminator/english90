import { routeChoices } from './specialization-overview.ts';
import { productionMarkup, bindProduction } from './specialization-production.ts';
import { missions, specializedRoutes, specialization, nextMission, specializationQuestions, missionMistakes, publicMissionPrompt } from './specializations.ts';
import type { Commitment, Mission } from './specializations.ts';
import { cardKey, schedule, newQuiz, localDate } from './core.ts';
import type { State, Difficulty, Mode, Rating } from './core.ts';

interface Context {
  state: State; save: () => boolean; status: (text: string) => void;
  quiz: () => void; difficulty: (id: string) => string;
}
const e = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const href = (m: Mission) => `#/routes?mission=${m.id}`;
export function renderSpecializations(ctx: Context): void {
  const { state, save, status } = ctx;
  const store = specialization(state);
  const params = new URLSearchParams(location.hash.split('?')[1]);
  const requestedDifficulty = params.get('practice');
  if (['gentle','standard','challenge'].includes(requestedDifficulty || '') && state.preferences.difficulty !== requestedDifficulty) { state.preferences.difficulty = requestedDifficulty as Difficulty; save(); }
  const selected = missions.find(m => m.id === params.get('mission'));
  const route = selected?.route || params.get('route') || store.commitment?.primary;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const navLink = (hash:string,label:string,active=false) => `<a class="outline ${active?'is-current':''}" href="${hash}" ${active?'aria-current="location"':''}>${e(label)}</a>`;
  const navigation = `<nav class="lesson-btns route-navigation" aria-label="Rutas de especialización">${navLink('#/routes','Mi ruta',!selected&&!params.has('route')&&!params.has('all')&&!params.has('advances'))}${specializedRoutes.map(r=>navLink(`#/routes?route=${r.id}`,r.title,route===r.id&&!params.has('advances'))).join('')}${navLink('#/routes?all=1','Explorar todas',params.has('all'))}${navLink('#/routes?advances=1','Mis avances',params.has('advances'))}${navLink('#/daily','Práctica fundamental')}</nav>`;
  const draw = (body: string) => { $('view').innerHTML = `<section class="panel active"><div class="section-top"><div><div class="eyebrow">TRABAJO · ESTUDIOS · VIAJES</div><h1>Mis rutas de inglés</h1></div></div>${navigation}${body}</section>`; };
  const redraw = () => renderSpecializations(ctx);
  if (selected) {
    const m = selected;
    if (!store.opened[m.id]) { store.opened[m.id] = Date.now(); save(); }
    const prior = missions.find(p => p.route === m.route && p.week === m.week - 1);
    const last = store.evidence.filter(ev => ev.mission === m.id).at(-1);
    const quiz = state.quiz?.missionId === m.id ? state.quiz : null;
    draw(`<h2>${e(m.code)} — ${e(m.title)}</h2><details id="missionPrerequisites"><summary>Semana ${m.week} · Base y apoyos</summary><p>Semana fundamental ${m.week}. Usa las traducciones como apoyo; si necesitas revisar una estructura, consulta la base y los repasos previos. Las explicaciones posteriores son apoyo opcional; no necesitas haberlas completado.</p><div class="lesson-btns">${m.prerequisites.map(w => `<a class="outline" href="#/guide/${(w - 1) * 7 + 1}">${w === m.week ? 'Base de esta misión' : 'Repaso previo'} · Semana ${w}</a>`).join('')}${m.futureSupport.map(w => `<a class="outline" href="#/guide/${(w - 1) * 7 + 1}">Explicación posterior · Semana ${w} · apoyo opcional</a>`).join('')}</div></details>${ctx.difficulty('routeDifficulty')}${state.preferences.difficulty==='gentle'?'':productionMarkup(state,m)}<p class="hint">Los ejercicios cerrados comprueban la expresión modelo. Las expresiones con puntos suspensivos son fragmentos para recuperar, no frases completas ni tareas de producción libre.</p><h3>CORE — Imprescindible</h3><p>Expresiones seleccionadas por su utilidad para esta misión.</p><div class="recap-list">${m.core.map((p, i) => `<details data-core="${i}"><summary>${e(p.es)}</summary><p lang="en">${e(p.en)}</p><div class="lesson-btns">${(['known', 'difficult', 'forgotten'] as Rating[]).map((r, j) => `<button class="outline" type="button" data-rate="${i}:${r}">${['La conozco', 'Difícil', 'La olvidé'][j]}</button>`).join('')}</div></details>`).join('')}</div><h3>REVIEW — Repaso</h3>${prior ? `<a class="outline" href="${href(prior)}">${e(prior.code)} — ${e(prior.title)}</a>` : '<p>Empieza con las expresiones esenciales de esta misión.</p>'}<div class="lesson-btns"><button class="primary" id="routePractice">Practicar lo esencial</button><button class="outline" id="routeMistakes">Repetir mis errores</button></div><label class="field">Actividad<select id="routeMode"><option value="recall">Recuperar sin opciones</option><option value="translation">Traducción</option><option value="completion">Completar frases</option><option value="ordering">Ordenar oraciones</option></select></label><div id="routeDiscard" class="warning" hidden><p>Hay un intento sin terminar. Puedes continuar con él o descartarlo para empezar esta práctica. Los resultados anteriores se conservan.</p><button class="primary" id="routeConfirm">Descartar intento y comenzar</button><button class="outline" id="routeCancel">Continuar mi intento</button></div><div id="quizArea"></div>${state.preferences.difficulty==='gentle'?productionMarkup(state,m):''}<h3>EXPLORE — Profundización</h3><p>Si dispones de la guía, continúa con la misión ${e(m.code)}: situación, cambio y comprobación. La práctica gratuita sigue disponible sin compra.</p><h3>Conversa</h3><p>Utiliza las expresiones en una conversación. No puntuamos automáticamente tus respuestas libres ni tu pronunciación.</p><label for="routePrompt">Prompt de práctica pública</label><textarea id="routePrompt" rows="6">${e(publicMissionPrompt(m))}</textarea><button class="outline" id="routeCopy">Copiar prompt</button><details id="guideEvidence" class="spaced"><summary>Registrar práctica adicional</summary><p class="hint">Para las actividades que realices con tu guía o fuera de esta página.</p><form id="missionEvidence"><label class="field">¿Qué conseguiste hacer?<textarea id="missionResult" maxlength="2000" required>${e(last?.result || '')}</textarea></label><p><label><input type="checkbox" id="missionCompleted"> Completé la tarea comunicativa</label></p><p><label><input type="checkbox" id="missionIndependent"> Lo intenté sin ayuda</label></p><p><label><input type="checkbox" id="missionUnderstandable"> Utilicé inglés comprensible</label></p><p><label><input type="checkbox" id="missionAdapted"> Respondí al cambio de situación</label></p><fieldset><legend>Expresiones difíciles</legend>${m.core.map((p, i) => `<p><label><input type="checkbox" name="difficult" value="${i}"> ${e(p.es)}</label></p>`).join('')}</fieldset><label class="field">¿Qué practicarás nuevamente?<textarea id="missionNext" maxlength="2000" required>${e(last?.next || '')}</textarea></label><button class="primary" type="submit">Guardar autoevaluación</button></form><p class="hint">Esta evidencia es una autoevaluación comunicativa. No constituye una evaluación verificada ni un nivel oficial.</p></details><a class="outline" href="#/routes?advances=1">Ver mis avances</a>`);
    bindProduction(state,m,save,status);
    $('routeDifficulty').onchange = () => {
      const difficulty=$<HTMLSelectElement>('routeDifficulty').value as Difficulty;
      state.preferences.difficulty=difficulty;
      if(params.has('practice')) { params.set('practice',difficulty);const hash=`#/routes?${params}`;history.replaceState(history.state,'',hash);state.lastRoute=hash; }
      save();redraw();queueMicrotask(()=>document.getElementById('routeDifficulty')?.focus({preventScroll:true}));
    };
    $<HTMLSelectElement>('routeMode').value = state.preferences.difficulty === 'gentle' ? 'translation' : 'recall';
    const pending = state.quiz && state.quiz.finishedAt === null;
    if (quiz) { $<HTMLSelectElement>('routeMode').value = quiz.mode; ctx.quiz(); }
    document.querySelectorAll<HTMLButtonElement>('[data-rate]').forEach(b => { b.onclick = () => {
      const [index, rating] = b.dataset.rate!.split(':');
      const word = { ...m.core[Number(index)], id: `specialization:${m.id}:${index}`, weeks: [m.week] };
      const key = cardKey(word, 'es-en');
      state.cards[key] = schedule(state.cards[key], rating as Rating); save(); status('Repaso de tarjeta registrado. Es una autoevaluación.');
    }; });
    const start = (mistakes: boolean) => {
      const mode = mistakes ? 'recall' : $<HTMLSelectElement>('routeMode').value as Mode;
      const difficulty = state.preferences.difficulty || 'standard';
      const questions = mistakes ? missionMistakes(m, state) : specializationQuestions(m, mode, difficulty, state);
      if (!questions.length) { status('No hay errores registrados para esta misión.'); return; }
      const begin = () => {
        state.quiz = { ...newQuiz(mode, m.week, (m.week - 1) * 7 + 1, questions), missionId: m.id, direction: 'es-en', difficulty, ...(mistakes ? { retry: true } : {}) };
        state.quiz.questions = questions;
        save(); redraw();
      };
      if (pending) { $('routeDiscard').hidden = false; $('routeConfirm').onclick = begin; $('routeCancel').onclick = () => {
        const active = missions.find(x => x.id === state.quiz?.missionId);
        location.hash = active ? href(active) : `#/challenge?week=${state.quiz!.week}&mode=${state.quiz!.mode}`;
      }; $('routeConfirm').focus(); }
      else begin();
    };
    $('routePractice').onclick = () => start(false);
    $('routeMistakes').onclick = () => start(true);
    $('routeCopy').onclick = () => { void navigator.clipboard.writeText($<HTMLTextAreaElement>('routePrompt').value).then(() => status('Prompt copiado.'), () => status('Selecciona y copia el texto del prompt.')); };
    $('missionEvidence').onsubmit = event => {
      event.preventDefault();
      store.evidence.push({ mission: m.id, at: Date.now(), independent: $<HTMLInputElement>('missionIndependent').checked,
        completed: $<HTMLInputElement>('missionCompleted').checked, understandable: $<HTMLInputElement>('missionUnderstandable').checked,
        adapted: $<HTMLInputElement>('missionAdapted').checked,
        difficult: [...document.querySelectorAll<HTMLInputElement>('[name="difficult"]:checked')].map(i => m.core[Number(i.value)].en),
        result: $<HTMLTextAreaElement>('missionResult').value.trim(), next: $<HTMLTextAreaElement>('missionNext').value.trim() });
      save(); status('Autoevaluación registrada. El progreso fundamental se conserva.');
    };
    return;
  }
  if (params.has('advances')) {
    const completed = new Set(store.evidence.filter(e => e.completed).map(e => e.mission));
    const productions = Object.entries(store.productions || {}).flatMap(([id,levels]) => Object.entries(levels).filter(([,d]) => d?.submittedAt).map(([level,draft]) => ({mission:missions.find(m=>m.id===id)!,level,draft:draft!})));
    productions.forEach(p=>completed.add(p.mission.id));
    const history = state.history.filter(h => h.id.startsWith('quiz-') && h.label.startsWith('Misión '));
    draw(`<h2>Mis avances</h2><p>${Object.keys(store.opened).length} actividades abiertas · ${history.length} prácticas completadas · ${completed.size} misiones comunicativas autoevaluadas · ${productions.length} producciones con autoevaluación.</p><p>Las respuestas correctas independientes se registran en Mi progreso. Las tarjetas y actividades con opciones son práctica con ayuda. Las autoevaluaciones no son evaluaciones verificadas.</p><a class="outline" href="#/progress">Respuestas independientes y respaldos</a>${productions.map(({mission:m,level,draft}) => `<article class="tile spaced"><h3>${e(m.code)} — ${e(m.title)}</h3><p>Producción libre · ${e(level === 'gentle' ? 'Paso a paso' : level === 'standard' ? 'Consolidación' : 'Desafío')} · Autoevaluación, sin nota automática</p><p lang="en">${e(draft.text)}</p>${draft.challenge ? `<p lang="en">${e(draft.challenge)}</p>` : ''}<a class="outline" href="${href(m)}&practice=${level}">Revisar mi respuesta</a></article>`).join('')}${store.evidence.length ? store.evidence.slice().reverse().map(ev => { const m = missions.find(m => m.id === ev.mission)!; return `<article class="tile spaced"><h3>${e(m.code)} — ${e(m.title)}</h3><p>${e(localDate(new Date(ev.at)))} · ${ev.independent ? 'Intento sin ayuda' : 'Con ayuda'} · ${ev.completed ? 'Tarea completada por autoevaluación' : 'En práctica'}</p><p>${e(ev.result)}</p><p>Repasar: ${e(ev.difficult.join(' / ') || 'Sin expresiones señaladas')}</p><p>Próxima acción: ${e(ev.next)}</p><a class="outline" href="${href(m)}">Continuar</a></article>`; }).join('') : productions.length ? '' : '<p>Aún no has registrado una evidencia semanal.</p>'}<button class="outline" id="shareRoute">Copiar resumen de seguimiento</button>`);
    $('shareRoute').onclick = () => {
      const production = productions.sort((a,b)=>a.draft.submittedAt!-b.draft.submittedAt!).at(-1);
      const prior = store.evidence.at(-1);
      const ev = production && (!prior || production.draft.submittedAt!>prior.at) ? {mission:production.mission.id,result:production.draft.text,difficult:[],next:store.commitment?.objective || nextMission(state,production.mission.route).title} : prior;
      if (!ev) { status('Registra una evidencia antes de compartir.'); return; }
      const m = missions.find(m => m.id === ev.mission)!;
      const text = `Esta semana practiqué la misión ${m.title}. Pude completar ${ev.result}. Necesito repasar ${ev.difficult.join(', ') || 'lo indicado en mi próxima acción'}. Mi próximo objetivo es ${ev.next}.`;
      void navigator.clipboard.writeText(text).then(() => status('Resumen copiado para compartir manualmente.'), () => { status(text); });
    };
    return;
  }
  const c = store.commitment;
  const recommended = route ? nextMission(state, route) : null;
  const list = missions.filter(m => params.has('all') || !route || m.route === route);
  const options = (selected: string) => specializedRoutes.map(r => `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>${e(r.title)}</option>`).join('');
  draw(`<h2>Elige para qué quieres aprender inglés</h2><p>La base común te enseña a construir y comprender inglés. Tu ruta especializada te ayuda a utilizarlo para alcanzar tu objetivo.</p><p>La especialización añade 15–30 minutos de práctica adicional, dos o tres veces por semana. Puedes dividir una misión entre sesiones.</p>${recommended ? `<div class="callout"><h3>Siguiente misión recomendada</h3><a class="primary" href="${href(recommended)}">${e(recommended.code)} — ${e(recommended.title)}</a><p>Continúa desde lo que ya practicaste; cambiar de ruta conserva tu progreso.</p>${store.evidence.length ? `<p>Última misión completada: ${e(store.evidence.filter(ev => ev.completed).at(-1)?.mission || 'Sin completar todavía')}. Para recuperar el ritmo, practica sus cuatro expresiones CORE y actualiza tu compromiso.</p>` : ''}</div>` : ''}<details id="learningCommitment" class="spaced"><summary>Mi compromiso DSSS <small>Opcional · organiza tu práctica</small></summary><form id="routeContract"><label class="field">Ruta principal<select id="primaryRoute">${options(c?.primary || 'work')}</select></label><label class="field">Ruta secundaria<select id="secondaryRoute"><option value="">Sin ruta secundaria</option>${options(c?.secondary || '')}</select></label><label class="field">Mi objetivo concreto<textarea id="routeObjective" maxlength="2000" required>${e(c?.objective || '')}</textarea></label><label class="field">Fecha de referencia<input type="date" id="referenceDate" value="${e(c?.referenceDate || '')}"></label><fieldset><legend>Días habituales de estudio</legend>${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((d, i) => `<p><label><input type="checkbox" name="studyDay" value="${i}" ${c?.days.includes(i) ? 'checked' : ''}> ${d}</label></p>`).join('')}</fieldset><label class="field">Horario habitual<input id="studyTime" maxlength="100" value="${e(c?.time || '')}"></label><label class="field">Mi evidencia semanal será<input id="weeklyEvidence" maxlength="2000" value="${e(c?.weeklyEvidence || '')}" required></label><label class="field">Preferencia de seguimiento<input id="followup" maxlength="2000" value="${e(c?.followup || '')}"></label><label class="field">Próxima revisión<input type="date" id="reviewDate" value="${e(c?.reviewDate || '')}"></label><fieldset><legend>Hasta tres situaciones prioritarias</legend><p>Da prioridad según frecuencia, urgencia, consecuencia y transferencia.</p><label class="field" for="prioritySearch">Buscar una situación<input id="prioritySearch" type="search" autocomplete="off" aria-describedby="priorityCount"></label><p class="hint" id="priorityCount" role="status" aria-live="polite"></p><button type="button" id="priorityClear" class="outline">Limpiar búsqueda</button><div id="priorityOptions" class="priority-options">${missions.map(m => `<p data-priority-option><label><input type="checkbox" name="priority" value="${m.id}" ${c?.priorities.includes(m.id) ? 'checked' : ''}> ${e(m.code)} — ${e(m.title)}</label></p>`).join('')}</div></fieldset><button class="primary" type="submit">Guardar compromiso</button></form><p class="hint">Se guarda en este navegador y en tus respaldos. Comparte tu progreso manualmente si lo deseas.</p></details>${c?.priorities.length ? `<h3>Situaciones prioritarias</h3><div class="lesson-btns">${c.priorities.map(id => { const m = missions.find(x => x.id === id)!; return `<a class="outline" href="${href(m)}">${e(m.code)} — ${e(m.title)}</a>`; }).join('')}</div>` : ''}<h2>${e(specializedRoutes.find(r => r.id === route)?.title || (params.has('all')?'Explorar todas':'Elige una ruta para empezar'))}</h2>${!route&&!params.has('all')?routeChoices(state):`<div class="category-grid">${list.map(m => `<a class="category-card" href="${href(m)}"><strong>${e(m.code)} — ${e(m.title)}</strong><span>Semana ${m.week}</span><span>${store.evidence.some(ev => ev.mission === m.id && ev.completed) || Object.values(store.productions?.[m.id] || {}).some(d=>d?.submittedAt) ? 'Autoevaluación registrada' : store.opened[m.id] ? 'Abierta · en práctica' : 'Disponible para empezar'}</span></a>`).join('')}</div>`}`);
  const prioritySearch=$<HTMLInputElement>('prioritySearch');
  const fold=(text:string)=>text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  const refreshPriorities=()=>{
    const checkboxes=[...document.querySelectorAll<HTMLInputElement>('#priorityOptions [name="priority"]')];
    const count=checkboxes.filter(i=>i.checked).length;
    let visible=0;
    document.querySelectorAll<HTMLElement>('[data-priority-option]').forEach(row=>{row.hidden=!fold(row.textContent||'').includes(fold(prioritySearch.value.trim()));if(!row.hidden)visible++;});
    checkboxes.forEach(input=>{input.disabled=!input.checked&&count>=3;});
    $('priorityCount').textContent=`${count} de 3 seleccionadas · ${visible} resultados${count===3?' · desmarca una para elegir otra':''}.`;
  };
  prioritySearch.oninput=refreshPriorities;
  document.querySelectorAll<HTMLInputElement>('#priorityOptions [name="priority"]').forEach(input=>{input.onchange=refreshPriorities;});
  $('priorityClear').onclick=()=>{prioritySearch.value='';refreshPriorities();prioritySearch.focus();};
  refreshPriorities();
  $('routeContract').onsubmit = event => {
    event.preventDefault();
    const value = (id: string) => $<HTMLInputElement>(id).value.trim();
    const primary = value('primaryRoute'), secondary = value('secondaryRoute');
    const priorities = [...document.querySelectorAll<HTMLInputElement>('[name="priority"]:checked')].map(i => i.value);
    if (primary === secondary) { status('Elige una ruta secundaria diferente de la principal.'); return; }
    if (priorities.length > 3) { status('Selecciona como máximo tres situaciones prioritarias.'); return; }
    const commitment: Commitment = { primary, secondary, objective: value('routeObjective'), referenceDate: value('referenceDate'),
      days: [...document.querySelectorAll<HTMLInputElement>('[name="studyDay"]:checked')].map(i => Number(i.value)), time: value('studyTime'),
      weeklyEvidence: value('weeklyEvidence'), followup: value('followup'), reviewDate: value('reviewDate'), priorities };
    store.commitment = commitment; save(); redraw(); status('Compromiso guardado.');
  };
}
