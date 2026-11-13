export { specialization, productionDraft, recordSpecializationQuiz, validateSpecialization } from './specialization-state.ts';
export type { Commitment, MissionEvidence, SpecializationState, SelfReview, ProductionDraft } from './specialization-state.ts';
import content from './specialization-content.json' with { type: 'json' };
import practice from './specialization-practice.json' with { type: 'json' };
import { questionCorrect, shuffle } from './core.ts';
import type { Difficulty, Mode, Question, State } from './core.ts';
import { evidenceKey, prioritize } from './learning.ts';

export const specializedRoutes = content.routes;
export const missions = content.missions;
export const publicPractice = practice;
export const missionPractice = (id: string) => practice.missions.find(m => m.id === id)!;
export type Mission = typeof missions[number];
export function nextMission(state: State, route: string): Mission {
  const completed = new Set(state.specialization?.evidence.filter(e => e.completed).map(e => e.mission));
  for (const [id, drafts] of Object.entries(state.specialization?.productions || {})) {
    if (Object.entries(drafts).some(([level,d]) => d?.submittedAt && !d.review.includes('again') && (level !== 'challenge' || d.adaptationReview !== 'again'))) completed.add(id);
  }
  const candidates = missions.filter(m => m.route === route);
  return candidates.find(m => !completed.has(m.id)) || candidates.at(-1)!;
}
export function specializationQuestions(mission: Mission, mode: Mode, difficulty: Difficulty, state: State): Question[] {
  const pool = mission.core.map((pair, index): Question => {
    const expanded = pair.en.replace(/\bI'd (?=like|prefer)/g, 'I would ').replace(/\bLet's\b/g, 'Let us');
    const base = { id: `${mission.id}-${index + 1}`, explanation: `${pair.en} — ${pair.es}` };
    const alternatives = expanded === pair.en ? {} : { acceptedAnswers: [expanded] };
    if (mode === 'completion') {
      const tokens = pair.en.split(/\s+/);
      // Rotate a single, supplied lexical token. Keep ellipses visible, since
      // those patterns are reusable fragments rather than fill-in endpoints.
      const eligible = tokens.flatMap((word, i) => /[a-z]/i.test(word) && !/\.{3}|…/.test(word) ? [i] : []);
      const position = eligible[(mission.week + index) % eligible.length];
      const answer = tokens[position]; tokens[position] = '___';
      return { ...base, prompt: `${tokens.join(' ')} (${pair.es})`, answer };
    }
    if (mode === 'ordering') return { ...base, ...alternatives, prompt: pair.es, answer: pair.en, tokens: shuffle(pair.en.split(/\s+/)) };
    return { ...base, ...alternatives, prompt: pair.es, answer: pair.en,
      ...(mode === 'translation' && difficulty !== 'challenge' ? { options: shuffle(mission.core.map(p => p.en)) } : {}) };
  });
  const ordered = prioritize(pool, state);
  const needsReview = (q: Question) => {
    const index = Number(q.id.split('-').at(-1)) - 1;
    const card = state.cards[`es-en:specialization:${mission.id}:${index}`];
    return card?.rating === 'forgotten' ? 2 : card?.rating === 'difficult' ? 1 : 0;
  };
  return ordered.sort((a, b) => needsReview(b) - needsReview(a));
}
export function missionMistakes(mission: Mission, state: State): Question[] {
  return specializationQuestions(mission, 'recall', 'standard', state).filter(q => (state.learning?.[evidenceKey(q)]?.misses || 0) > 0
    || state.specialization?.mistakes?.[mission.id]?.includes(q.id)
    || state.quiz?.questions.some((item, i) => item.id === q.id && state.quiz!.responses[i] !== null && !questionCorrect(item, state.quiz!.responses[i])));
}
export function publicMissionPrompt(mission: Mission): string {
  return `Soy hispanohablante y estoy practicando inglés con English90.\n\nMi ruta de especialización es: ${specializedRoutes.find(r => r.id === mission.route)!.title}.\n\nEstoy trabajando en la misión: ${mission.code} — ${mission.title}.\n\nQuiero practicar estas expresiones: ${mission.core.map(p => p.en).join(' / ')}\n\nActúa como la otra persona de la situación. Comienza con una pregunta accesible en inglés y espera mi respuesta.\n\nAjusta progresivamente la complejidad a mi desempeño. No asumas un nivel oficial.\n\nNo me entregues las respuestas antes de que intente responder.\n\nSi necesito ayuda, dame primero una pista corta. Si sigo bloqueado, utiliza una explicación breve en español.\n\nAl terminar, identifica dos fortalezas, hasta dos errores prioritarios y una actividad de repaso.\n\nNo inventes información personal, experiencia laboral o resultados académicos.\n\nNo afirmes que evaluaste mi pronunciación si no recibiste audio.\n\nNo asignes certificaciones ni niveles oficiales.\n\nEmpieza con una pregunta.`;
}
