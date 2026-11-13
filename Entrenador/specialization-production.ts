import { productionDraft, missionPractice, publicPractice, nextMission } from './specializations.ts';
import type { Mission, SelfReview } from './specializations.ts';
import type { State } from './core.ts';
import { syncSelect } from './selects.ts';

const e = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const rich = (s: string) => e(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
const paragraphs = (s: string) => s.split(/\n\s*\n/).filter(Boolean).map(p => `<p>${rich(p)}</p>`).join('');
const levels = ['independent','hints','again'] as const;

export function productionMarkup(state: State, mission: Mission): string {
  const difficulty = state.preferences.difficulty || 'standard';
  const data = missionPractice(mission.id), draft = productionDraft(state,mission.id,difficulty);
  const assessment = publicPractice.selfReview;
  const options = (selected: SelfReview) => `<option value="">Selecciona una opción</option>${levels.map((v,i) => `<option value="${v}" ${selected===v?'selected':''}>${e(assessment.options[i])}</option>`).join('')}`;
  return `<section aria-label="Producción de la misión" class="spaced mission-production"><p class="hint">${e(publicPractice.difficulty[difficulty])}</p><h3><span class="mission-step" aria-hidden="true">1</span>Contexto</h3><p class="mission-context" id="productionContext">${e(data.context)}</p><h3><span class="mission-step" aria-hidden="true">2</span>Produce</h3><p id="productionTask">${e(data.produce)}</p>${data.notes.map(n => `<div class="callout">${paragraphs(n)}</div>`).join('')}${data.foodClarification ? `<details id="foodClarification" data-production-support><summary>Aclaración alimentaria</summary>${paragraphs(data.foodClarification)}</details>` : ''}<form id="freeProduction" novalidate><label class="field" for="productionText">Tu respuesta en inglés<textarea id="productionText" lang="en" rows="5" maxlength="8000" aria-describedby="productionTask productionStorage">${e(draft.text)}</textarea></label><div class="production-writing-meta"><span class="hint" id="productionLength" aria-hidden="true">${draft.text.length.toLocaleString('es-CL')}/8.000 caracteres</span></div><p class="hint" id="productionStorage">Tu borrador se conserva con el progreso de este navegador y se incluye en tus respaldos. Esta respuesta libre no recibe una nota automática. <a class="quiet-link" href="#/progress">Guardar una copia de mi progreso</a></p>${difficulty==='challenge' ? `<h3>Desafío</h3><p id="productionChallenge">${e(data.challenge)}</p><label class="field" for="productionAdaptation">Tu respuesta al cambio de situación<textarea id="productionAdaptation" lang="en" rows="4" maxlength="8000" aria-describedby="productionChallenge">${e(draft.challenge)}</textarea></label>` : `<details><summary>Desafío</summary><p>${e(data.challenge)}</p></details>`}${data.examples.length ? `<details id="approvedExamples" data-production-support><summary>Ejemplos completos</summary><p>Estas frases son ejemplos adicionales aprobados. No sustituyen las expresiones CORE existentes.</p>${data.examples.map(p=>`<p><strong lang="en">${e(p.pattern)}</strong></p><p lang="en">${e(p.en)}</p><p>${e(p.es)}</p>`).join('')}</details>` : ''}<fieldset id="productionReview" ${draft.text.trim()?'':'hidden'}><legend><span class="mission-step" aria-hidden="true">3</span>${e(assessment.title)}</legend>${assessment.questions.map((q,i)=>`<label class="field">${e(q)}<select id="productionReview${i}">${options(draft.review[i])}</select></label>`).join('')}${difficulty==='challenge'?`<label class="field">${e(assessment.adaptQuestion)}<select id="productionAdapted">${options(draft.adaptationReview)}</select></label>`:''}</fieldset><p id="productionSaved" class="hint production-status" role="status" aria-live="polite">${draft.submittedAt ? 'Producción y autoevaluación registradas.' : 'Borrador · pendiente de autoevaluación.'}</p><button class="primary" type="submit">Guardar producción y autoevaluación</button></form><div id="productionOutcome" class="production-outcome" hidden><strong>Tu práctica está registrada</strong><p class="hint">Tu autoevaluación orienta el siguiente paso; no es una nota de nivel.</p><div class="lesson-btns"><a id="productionContinue" class="primary"></a><button id="productionRetry" class="outline" type="button" hidden>Revisar mi respuesta</button><a class="outline" href="#/routes?advances=1">Ver mis avances</a></div></div></section>`;
}

export function bindProduction(state: State, mission: Mission, save: () => boolean, status: (text:string) => void): void {
  const difficulty = state.preferences.difficulty || 'standard';
  const draft = productionDraft(state,mission.id,difficulty);
  const $ = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
  const setStatus = (message: string) => { if ($('productionSaved').textContent !== message) $('productionSaved').textContent=message; };
  const updateNext = () => {
    const outcome=$('productionOutcome');
    outcome.hidden=!draft.submittedAt;
    if (!draft.submittedAt) return;
    const again=draft.review.includes('again') || (difficulty==='challenge' && draft.adaptationReview==='again');
    $('productionRetry').hidden=!again;
    const next=$<HTMLAnchorElement>('productionContinue');next.hidden=again;
    const recommended=nextMission(state,mission.route);
    next.href=recommended.id===mission.id?'#/routes?all=1':`#/routes?mission=${recommended.id}`;
    next.textContent=recommended.id===mission.id?'Explorar las misiones':`Continuar con ${recommended.code} · ${recommended.title}`;
  };
  const changed = () => {
    draft.updatedAt=Date.now();draft.submittedAt=null;
    const stored=save();
    setStatus(stored?'Borrador guardado · pendiente de autoevaluación.':'Borrador solo en esta sesión · exporta tu progreso para conservarlo.');
    $('productionLength').textContent=`${draft.text.length.toLocaleString('es-CL')}/8.000 caracteres`;
    updateNext();
  };
  const textChanged = () => {
    if(draft.review.some(Boolean) || draft.adaptationReview) {draft.review=['','',''];draft.adaptationReview=''; for(let i=0;i<3;i++){const select=$<HTMLSelectElement>(`productionReview${i}`);select.value='';syncSelect(select);} const adapted=document.getElementById('productionAdapted') as HTMLSelectElement|null;if(adapted){adapted.value='';syncSelect(adapted);}}
    draft.text=$<HTMLTextAreaElement>('productionText').value;
    draft.challenge=(document.getElementById('productionAdaptation') as HTMLTextAreaElement|null)?.value ?? draft.challenge;
    $('productionReview').hidden=!draft.text.trim(); changed();
  };
  $('productionText').oninput=textChanged;
  const adaptation=document.getElementById('productionAdaptation'); if(adaptation) adaptation.oninput=textChanged;
  for(let i=0;i<3;i++) $(`productionReview${i}`).onchange=()=>{draft.review[i]=$<HTMLSelectElement>(`productionReview${i}`).value as SelfReview;changed();};
  const adapted=document.getElementById('productionAdapted'); if(adapted) adapted.onchange=()=>{draft.adaptationReview=(adapted as HTMLSelectElement).value as SelfReview;changed();};
  document.querySelectorAll<HTMLDetailsElement>('[data-production-support], [data-core]').forEach(details=>{details.ontoggle=()=>{if(details.open) {draft.supportUsed=true;save();}};});
  $('freeProduction').onsubmit=event=>{
    event.preventDefault();
    if(!draft.text.trim()){status('Escribe tu respuesta antes de guardar la autoevaluación.');$('productionText').focus();return;}
    if(difficulty==='challenge'&&!draft.challenge.trim()){status('Responde al cambio de situación.');$('productionAdaptation').focus();return;}
    const missing=draft.review.indexOf('');
    if(missing!==-1){status('Completa las tres preguntas de autoevaluación.');$(`productionReview${missing}`).focus();return;}
    if(difficulty==='challenge'&&!draft.adaptationReview){status('Completa la autoevaluación de adaptación.');$('productionAdapted').focus();return;}
    draft.updatedAt=Date.now();draft.submittedAt=draft.updatedAt;const stored=save();
    setStatus(stored?'Producción y autoevaluación registradas.':'Producción registrada en esta sesión · exporta tu progreso para conservarla.');
    updateNext();
    status('Producción y autoevaluación guardadas. Sin nota lingüística automática.');
  };
  $('productionRetry').onclick=()=>{$('productionText').scrollIntoView({block:'center',behavior:'auto'});$('productionText').focus({preventScroll:true});};
  updateNext();
}
