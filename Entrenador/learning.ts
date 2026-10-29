import { localDate, questionCorrect } from './core.ts';
import type { Question, State } from './core.ts';

export interface Evidence { attempts: number; correct: number; misses: number; lastAt: number; lastCorrect: boolean; recovered: boolean }
export const evidenceKey = (question: Question) => `${question.id}:${question.answer.toLowerCase()}`;
// One independent retrieval per expression per local day. Immediate retries never raise mastery.
export function recordEvidence(state: State, questions: Question[], responses: (string | null)[], now = Date.now(), assisted: number[] = []): void {
  const records = state.learning ||= {};
  questions.forEach((q, index) => {
    if (assisted.includes(index) || responses[index] === null) return;
    const key = evidenceKey(q), prior = records[key];
    if (prior && localDate(new Date(prior.lastAt)) === localDate(new Date(now))) return;
    const correct = questionCorrect(q, responses[index]);
    records[key] = { attempts: (prior?.attempts || 0) + 1, correct: (prior?.correct || 0) + Number(correct),
      misses: correct ? Math.max(0, (prior?.misses || 0) - 1) : (prior?.misses || 0) + 1,
      lastAt: now, lastCorrect: correct, recovered: !!prior?.recovered || (!!prior && !prior.lastCorrect && correct) };
  });
}
export function prioritize(questions: Question[], state: State): Question[] {
  return [...questions].sort((a, b) => (state.learning?.[evidenceKey(b)]?.misses || 0) - (state.learning?.[evidenceKey(a)]?.misses || 0)
    || (state.learning?.[evidenceKey(a)]?.lastAt || 0) - (state.learning?.[evidenceKey(b)]?.lastAt || 0));
}
export function independentAccuracy(state: State): { attempts: number; correct: number; ready: boolean } {
  const values = Object.values(state.learning || {});
  const attempts = values.reduce((n, e) => n + e.attempts, 0), correct = values.reduce((n, e) => n + e.correct, 0);
  return { attempts, correct, ready: attempts >= 10 && correct / attempts >= 0.8 };
}
export function milestones(state: State): string[] {
  const earned: string[] = [];
  if (state.history.length) earned.push('Primera práctica completada');
  if (Object.values(state.learning || {}).some(e => e.correct > 0)) earned.push('Primer recuerdo escrito sin ayuda');
  if (Object.values(state.learning || {}).some(e => e.recovered)) earned.push('Una expresión difícil recordada otro día');
  if (new Set(state.activity).size >= 7) earned.push('Siete días de práctica acumulados');
  return earned;
}
