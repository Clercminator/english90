import overview from './specialization-overview.json' with { type: 'json' };
import { questionCorrect } from './core.ts';
import type { Difficulty, Quiz, State } from './core.ts';

export type SelfReview = '' | 'independent' | 'hints' | 'again';
export interface ProductionDraft {
  text: string; challenge: string; review: SelfReview[]; adaptationReview: SelfReview;
  supportUsed: boolean; updatedAt: number; submittedAt: number | null;
}
export interface Commitment {
  primary: string; secondary: string; objective: string; referenceDate: string;
  days: number[]; time: string; weeklyEvidence: string; followup: string;
  priorities: string[]; reviewDate: string;
}
export interface MissionEvidence {
  mission: string; at: number; independent: boolean; completed: boolean;
  understandable: boolean; adapted: boolean; difficult: string[]; result: string; next: string;
}
export interface SpecializationState {
  commitment?: Commitment;
  opened: Record<string, number>;
  evidence: MissionEvidence[];
  mistakes?: Record<string, string[]>;
  productions?: Record<string, Partial<Record<Difficulty, ProductionDraft>>>;
}
export function specialization(state: State): SpecializationState {
  return state.specialization ||= { opened: {}, evidence: [] };
}
export function productionDraft(state: State, id: string, difficulty: Difficulty): ProductionDraft {
  const productions = specialization(state).productions ||= {};
  const entries = productions[id] ||= {};
  return entries[difficulty] ||= {text:'',challenge:'',review:['','',''],adaptationReview:'',supportUsed:false,updatedAt:Date.now(),submittedAt:null};
}
export function recordSpecializationQuiz(state: State, quiz: Quiz): void {
  if (!quiz.missionId) return;
  const store = specialization(state), all = store.mistakes ||= {};
  const missed = new Set(all[quiz.missionId] || []);
  quiz.questions.forEach((q, i) => {
    if (!questionCorrect(q, quiz.responses[i]) || quiz.assisted?.includes(i)) missed.add(q.id);
    else if (!q.options) missed.delete(q.id);
  });
  all[quiz.missionId] = [...missed];
}
export function validateSpecialization(value: unknown): asserts value is SpecializationState {
  const fail = () => { throw new Error('El respaldo de rutas no tiene un formato válido.'); };
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const text = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.length <= max;
  const date = (v: unknown) => v === '' || (text(v, 10) && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)));
  const mission = (v: unknown) => typeof v === 'string' && overview.some(r => r.missions.includes(v));
  const timestamp = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 8640000000000000;
  if (!obj(value) || !obj(value.opened) || Object.keys(value.opened).length > 36 || !Object.entries(value.opened).every(([k, v]) => mission(k) && timestamp(v)) || !Array.isArray(value.evidence) || value.evidence.length > 10000) return fail();
  if (value.mistakes !== undefined && (!obj(value.mistakes) || Object.keys(value.mistakes).length > 36 || !Object.entries(value.mistakes).every(([key, ids]) => mission(key) && Array.isArray(ids) && ids.length <= 4 && new Set(ids).size === ids.length && ids.every(id => typeof id === 'string' && [1,2,3,4].some(n => id === `${key}-${n}`))))) return fail();
  if (value.productions !== undefined) {
    const review = (v: unknown) => ['', 'independent', 'hints', 'again'].includes(String(v)) && typeof v === 'string';
    if (!obj(value.productions) || Object.keys(value.productions).length > 36) return fail();
    for (const [id, levels] of Object.entries(value.productions)) {
      if (!mission(id) || !obj(levels) || Object.keys(levels).some(d => !['gentle','standard','challenge'].includes(d))) return fail();
      for (const [level, draft] of Object.entries(levels)) {
        if (!obj(draft) || !text(draft.text,8000) || !text(draft.challenge,8000) || !Array.isArray(draft.review) || draft.review.length !== 3 || !draft.review.every(review) || !review(draft.adaptationReview) || typeof draft.supportUsed !== 'boolean' || !timestamp(draft.updatedAt) || !(draft.submittedAt === null || timestamp(draft.submittedAt))) return fail();
        if (draft.submittedAt !== null && (!draft.text.trim() || draft.review.includes('') || (level === 'challenge' && (!draft.challenge.trim() || !draft.adaptationReview)))) return fail();
      }
    }
  }
  for (const ev of value.evidence) {
    if (!obj(ev) || !mission(ev.mission) || !timestamp(ev.at) || !['independent', 'completed', 'understandable', 'adapted'].every(k => typeof ev[k] === 'boolean') || !text(ev.result) || !text(ev.next) || !Array.isArray(ev.difficult) || ev.difficult.length > 4 || !ev.difficult.every(x => text(x, 500))) return fail();
  }
  if (value.commitment !== undefined) {
    const c = value.commitment;
    if (!obj(c) || !overview.some(r => r.id === c.primary) || !(c.secondary === '' || overview.some(r => r.id === c.secondary && r.id !== c.primary)) || !['objective', 'time', 'weeklyEvidence', 'followup'].every(k => text(c[k])) || !date(c.referenceDate) || !date(c.reviewDate) || !Array.isArray(c.days) || c.days.length > 7 || new Set(c.days).size !== c.days.length || !c.days.every(n => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 6) || !Array.isArray(c.priorities) || c.priorities.length > 3 || new Set(c.priorities).size !== c.priorities.length || !c.priorities.every(mission)) return fail();
  }
}
