import overview from './specialization-overview.json' with { type: 'json' };
import type { State } from './core.ts';
const e = (value: string) => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export function routeChoices(state: State): string {
  return `<div class="category-grid route-choices">${overview.map(route=>{
    const entries=route.missions;
    const reviewed=entries.filter(m=>state.specialization?.evidence.some(ev=>ev.mission===m) || Object.values(state.specialization?.productions?.[m] || {}).some(d=>d?.submittedAt)).length;
    return `<a class="category-card" href="#/routes?route=${route.id}"><strong>${e(route.title)}</strong><span>${entries.length} misiones · ${reviewed} con autoevaluación</span><span>Empezar con: ${e(route.firstTitle)}</span><span>Explorar ${e(route.title)} →</span></a>`;
  }).join('')}</div>`;
}
