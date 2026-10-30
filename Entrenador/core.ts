import type { DailySession } from './daily.ts';
import { recordEvidence } from './learning.ts';
import type { Evidence } from './learning.ts';
export type Direction = 'en-es' | 'es-en';
export type Rating = 'known' | 'difficult' | 'forgotten';
export type Mode = 'translation' | 'recall' | 'completion' | 'ordering' | 'timed' | 'listening' | 'reading';
export type Difficulty = 'gentle' | 'standard' | 'challenge';
export type Section = 'home' | 'daily' | 'plan' | 'cards' | 'challenge' | 'assessments' | 'ai' | 'progress' | 'guide' | 'situations';
export interface Word { en: string; es: string }
export interface Exercise { prompt: string; answer: string; acceptedAnswers?: string[] }
export interface Week {
  week: number; title: string; outcome: string; vocabulary: Word[];
  reading: string; reading_questions: { question: string; answer: string }[];
  assessment: Exercise[]; grammar_rules: { name: string; explanation: string }[];
}
export interface Day {
  day: number; week: number; type: 'lesson' | 'assessment' | 'capstone'; title: string;
  goal?: string; anchor_en?: string; anchor_es?: string; question?: string; answer?: string;
  vocab?: [string, string][]; focus?: { name: string; explanation: string; examples: string };
  dialogue?: string[]; practice_prompt?: string; day_goal_evidence?: string; task?: string; evidence?: string;
}
export interface Curriculum { title: string; days: Day[]; weeks: Week[]; quickstart: Word[] }
export interface Vocabulary extends Word { id: string; weeks: number[] }
export interface Card { due: number; interval: number; reviews: number; rating: Rating }
export interface Route { section: Section; day: number; week: number; mode: Mode }
export interface Question { id: string; prompt: string; answer: string; explanation: string; options?: string[]; tokens?: string[]; acceptedAnswers?: string[]; context?: string }
export interface Quiz {
  id: string; mode: Mode; week: number; day: number; questions: Question[];
  responses: (string | null)[]; index: number; startedAt: number; deadline: number | null; finishedAt: number | null;
  difficulty?: Difficulty; direction?: Direction; retry?: boolean;
  assisted?: number[];
  guideDay?: number;
}
export interface Assessment {
  questions?: Question[];
  answers: string[]; reading: string[]; writing: string; notes: string;
  self: { reading: number | null; writing: number | null; speaking: number | null };
  submittedAt: number | null;
}
export interface Result {
  id: string; label: string; kind: 'game' | 'assessment'; at: number; score: number; total: number;
  selfScore: number | null; assessment?: Assessment;
}
export interface State {
  practiceTests?: Record<string, Assessment>;
  learning?: Record<string, Evidence>;
  daily?: DailySession;
  version: 2; day: number; done: Record<string, boolean>; cards: Record<string, Card>;
  activity: string[]; preferences: { direction: Direction; week: number; difficulty?: Difficulty; cardPractice?: 'reveal' | 'recall'; learningAudio?: boolean };
  lastRoute: string; lastCard: string | null; quiz: Quiz | null;
  assessments: Record<string, Assessment>; history: Result[];
  notes: Record<string, string>;
}
export const STORAGE_KEY = 'english90-v2-progress-2';
export const LEGACY_KEY = 'english90-v2-progress-1';
const DAY_MS = 86400000;
export const normalize = (s: string): string => s.normalize('NFKC').replace(/[’‘]/g, "'").trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
export const matches = (given: string, expected: string): boolean => {
  const canonical = (value: string) => normalize(value).replace(/\bmustn't\b/g, 'must not').replace(/\blearnt\b/g, 'learned');
  return canonical(given) === canonical(expected);
};
export const localDate = (date = new Date()): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function vocabulary(data: { weeks: { week: number; vocabulary: Word[] }[] }): Vocabulary[] {
  const words = new Map<string, Vocabulary>();
  for (const week of data.weeks) for (const word of week.vocabulary) {
    const id = `${normalize(word.en)}|${normalize(word.es)}`;
    const existing = words.get(id);
    if (existing) { if (!existing.weeks.includes(week.week)) existing.weeks.push(week.week); }
    else words.set(id, { ...word, id, weeks: [week.week] });
  }
  return [...words.values()];
}
export const cardKey = (word: Vocabulary, direction: Direction): string => `${direction}:${word.id}`;
export function schedule(previous: Card | undefined, rating: Rating, now = Date.now()): Card {
  const interval = rating === 'forgotten' ? 10 / 1440 : rating === 'difficult' ? 1 : Math.min(90, Math.max(3, Math.round((previous?.interval || 0) * 2.3)));
  return { due: now + interval * DAY_MS, interval, reviews: (previous?.reviews || 0) + 1, rating };
}
export function dueWords(words: Vocabulary[], cards: State['cards'], direction: Direction, now = Date.now()): Vocabulary[] {
  return words.filter(w => !cards[cardKey(w, direction)] || cards[cardKey(w, direction)].due <= now)
    .sort((a, b) => (cards[cardKey(a, direction)]?.due ?? now) - (cards[cardKey(b, direction)]?.due ?? now));
}
export function emptyState(): State {
  return { version: 2, day: 1, done: {}, cards: {}, activity: [], preferences: { direction: 'en-es', week: 1 },
    lastRoute: '#/cards?week=1', lastCard: null, quiz: null, assessments: {}, history: [], notes: {} };
}
export function emptyAssessment(): Assessment {
  return { answers: ['', '', '', ''], reading: ['', '', ''], writing: '', notes: '', self: { reading: null, writing: null, speaking: null }, submittedAt: null };
}
export function streak(activity: string[], now = new Date()): number {
  const dates = new Set(activity); const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (!dates.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (dates.has(localDate(cursor))) { count++; cursor.setDate(cursor.getDate() - 1); }
  return count;
}
export function touch(state: State, now = new Date()): void {
  const date = localDate(now);
  if (!state.activity.includes(date)) state.activity.push(date);
}
export function nextDay(done: State['done']): number { return Array.from({ length: 90 }, (_, i) => i + 1).find(d => !done[d]) ?? 90; }
export function dayStatus(day: number, done: State['done']): 'completed' | 'available' | 'future' {
  return done[day] ? 'completed' : day === nextDay(done) ? 'available' : 'future';
}
const sections: Section[] = ['home', 'daily', 'plan', 'cards', 'challenge', 'assessments', 'ai', 'progress', 'guide', 'situations'];
const modes: Mode[] = ['translation', 'recall', 'completion', 'ordering', 'timed', 'listening', 'reading'];
export function parseRoute(hash: string, fallbackDay = 1): Route {
  const [path, search = ''] = hash.replace(/^#\/?/, '').split('?');
  const [section, day] = path.split('/'); const params = new URLSearchParams(search);
  const bounded = (x: number, max: number, fallback: number) => Number.isInteger(x) && x >= 1 && x <= max ? x : fallback;
  const selectedDay = bounded(Number(day), 90, fallbackDay);
  return {
    section: sections.includes(section as Section) ? section as Section : 'home',
    day: selectedDay, week: bounded(Number(params.get('week')), 12, Math.min(12, Math.ceil(selectedDay / 7))),
    mode: modes.includes(params.get('mode') as Mode) ? params.get('mode') as Mode : 'translation',
  };
}
export function shuffle<T>(items: T[], rng = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function translationQuestions(words: Vocabulary[], allWords: Vocabulary[], direction: Direction): Question[] {
  const source = direction === 'en-es' ? 'en' : 'es'; const target = direction === 'en-es' ? 'es' : 'en';
  return words.map(word => {
    // Exclude every alternate translation of this prompt, including senses in other weeks.
    const valid = new Set(allWords.filter(w => normalize(w[source]) === normalize(word[source])).map(w => normalize(w[target])));
    const distractors = [...new Map(words.filter(w => !valid.has(normalize(w[target]))).map(w => [normalize(w[target]), w[target]])).values()];
    return { id: word.id, prompt: word[source], answer: word[target], options: shuffle([word[target], ...shuffle(distractors).slice(0, 3)]), explanation: `${word.en} → ${word.es}.` };
  }).filter(q => (q.options?.length ?? 0) >= 2);
}
export function recallQuestions(words: Vocabulary[], allWords: Vocabulary[], direction: Direction): Question[] {
  const source = direction === 'en-es' ? 'en' : 'es'; const target = direction === 'en-es' ? 'es' : 'en';
  return words.map(word => ({ id: word.id, prompt: word[source], answer: word[target],
    acceptedAnswers: [...new Set(allWords.filter(w => normalize(w[source]) === normalize(word[source]))
      .flatMap(w => {
        const plain = w[target].replace(/\s*\([^)]*\)/g, '').trim();
        return [w[target], plain, ...plain.split('/').map(part => part.trim())];
      }).filter(Boolean))],
    explanation: `${word.en} → ${word.es}.`,
  }));
}
const contractions: Record<string, string> = {
  "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are',
  "it's": 'it is', "he's": 'he is', "she's": 'she is', "that's": 'that is', "there's": 'there is',
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'cannot',
  "couldn't": 'could not', "won't": 'will not', "wouldn't": 'would not', "shouldn't": 'should not',
  "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not',
  "i've": 'i have', "you've": 'you have', "we've": 'we have', "they've": 'they have',
  "i'll": 'i will', "you'll": 'you will', "he'll": 'he will', "she'll": 'she will', "it'll": 'it will', "we'll": 'we will', "they'll": 'they will',
};
export const questionCorrect = (question: Question, answer: string | null): boolean => {
  const written = (text: string) => normalize(text).replace(/\b[\w]+'[\w]+\b/g, word => contractions[word] || word)
    .replace(/[,;:]/g, ' ').replace(/\bcan not\b/g, 'cannot').replace(/\btravelling\b/g, 'traveling').replace(/\btravelled\b/g, 'traveled').replace(/\bcentre\b/g, 'center');
  return answer !== null && [question.answer, ...(question.acceptedAnswers || [])].some(expected => matches(written(answer), written(expected)));
};
export function quizStreak(quiz: Quiz): number {
  let count = 0;
  let i = quiz.responses[quiz.index] === null ? quiz.index - 1 : quiz.index;
  for (; i >= 0 && !quiz.assisted?.includes(i) && questionCorrect(quiz.questions[i], quiz.responses[i]); i--) count++;
  return count;
}
export function retryQuiz(quiz: Quiz, now = Date.now()): Quiz | null {
  if (quiz.finishedAt === null) return null;
  const missed = quiz.questions.filter((q, i) => quiz.assisted?.includes(i) || !questionCorrect(q, quiz.responses[i]));
  if (!missed.length) return null;
  return { ...newQuiz(quiz.mode, quiz.week, quiz.day, missed.map(q => ({ ...q,
    ...(q.options ? { options: shuffle(q.options) } : {}), ...(q.tokens ? { tokens: shuffle(q.tokens) } : {}),
  })), now), difficulty: quiz.difficulty, direction: quiz.direction, guideDay: quiz.guideDay, retry: true };
}
export function lessonQuestions(days: Day[], mode: 'completion' | 'ordering'): Question[] {
  return days.filter(d => d.type === 'lesson').map(d => mode === 'completion' ? {
    id: `day-${d.day}`, prompt: d.question!, answer: d.answer!, explanation: `${d.focus!.name}: ${d.focus!.explanation}`,
  } : {
    id: `day-${d.day}`, prompt: d.anchor_es!, answer: d.anchor_en!, tokens: shuffle(d.anchor_en!.split(/\s+/)),
    explanation: `Frase modelo del día ${d.day}: ${d.anchor_en}`,
  });
}
export function newQuiz(mode: Mode, week: number, day: number, questions: Question[], now = Date.now()): Quiz {
  const selected = shuffle(questions).slice(0, 10);
  return { id: `quiz-${now}-${Math.random().toString(36).slice(2, 8)}`, mode, week, day, questions: selected,
    responses: selected.map(() => null), index: 0, startedAt: now, deadline: mode === 'timed' ? now + 60000 : null, finishedAt: null };
}
export function answerQuiz(quiz: Quiz, answer: string, now = Date.now()): boolean {
  if (quiz.finishedAt !== null || (quiz.deadline !== null && now >= quiz.deadline) || quiz.responses[quiz.index] !== null) return false;
  quiz.responses[quiz.index] = answer.trim(); return true;
}
export function quizScore(quiz: Quiz): number {
  return quiz.questions.filter((q, i) => !quiz.assisted?.includes(i) && questionCorrect(q, quiz.responses[i])).length;
}
export function assessmentScore(exercises: Exercise[], answers: string[]): number {
  return exercises.filter((q, i) => questionCorrect({ ...q, id: 'assessment', explanation: '' }, answers[i] || '')).length;
}
export function finishQuiz(state: State, quiz: Quiz, now = Date.now()): void {
  if (quiz.finishedAt !== null) return;
  quiz.finishedAt = now;
  if (!quiz.retry && (quiz.mode === 'recall' || quiz.mode === 'completion' || quiz.mode === 'listening' || quiz.difficulty === 'challenge')) recordEvidence(state, quiz.questions, quiz.responses, now, quiz.assisted);
  state.history.push({ id: quiz.id, label: `${quiz.retry ? 'Repaso de errores' : 'Práctica'} · categoría ${quiz.week} · ${modeLabel(quiz.mode)}${quiz.difficulty === 'challenge' ? ' · Desafío' : ''}`, kind: 'game', at: now, score: quizScore(quiz), total: quiz.questions.length, selfScore: null });
  touch(state, new Date(now));
}
export const modeLabel = (mode: Mode): string => ({ translation: 'Traducción', recall: 'Escribir de memoria', completion: 'Completar', ordering: 'Ordenar', timed: 'Reto de 60 segundos', listening: 'Escuchar y escribir', reading: 'Leer y comprender' })[mode];

// Backups are untrusted. Reject unsupported versions and malformed nested state before replacing anything.
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 20000): v is string => typeof v === 'string' && v.length <= max;
const num = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number): v is number => num(v, min, max) && Number.isInteger(v);
const strings = (v: unknown, max = 20000): v is string[] => Array.isArray(v) && v.every(x => str(x, max));
function requireValid(condition: unknown): asserts condition { if (!condition) throw new Error('El respaldo no tiene un formato válido o pertenece a una versión incompatible.'); }
function validateAssessment(value: unknown): asserts value is Assessment {
  requireValid(object(value));
  requireValid(strings(value.answers, 500) && value.answers.length === 4 && strings(value.reading, 2000) && value.reading.length === 3);
  requireValid(str(value.writing) && str(value.notes) && (value.submittedAt === null || num(value.submittedAt)) && object(value.self));
  for (const [k, max] of [['reading', 3], ['writing', 1], ['speaking', 2]] as const) requireValid(value.self[k] === null || integer(value.self[k], 0, max));
  if (value.questions !== undefined) {
    requireValid(Array.isArray(value.questions) && value.questions.length === 4);
    value.questions.forEach(validateQuestion);
  }
}
function validateQuestion(q: unknown): void {
  requireValid(object(q) && str(q.id,1000) && str(q.prompt,2000) && str(q.answer,2000) && str(q.explanation,4000));
  requireValid(q.context === undefined || str(q.context,12000));
  requireValid(q.acceptedAnswers === undefined || (strings(q.acceptedAnswers,2000) && q.acceptedAnswers.length <= 100));
  requireValid(q.options === undefined || (strings(q.options,2000) && q.options.length >= 2 && q.options.length <= 4 && q.options.includes(q.answer) && new Set(q.options.map(normalize)).size === q.options.length));
}
export function validateState(value: unknown): State {
  requireValid(object(value) && value.version === 2 && integer(value.day, 1, 90));
  requireValid(object(value.done) && Object.entries(value.done).every(([k, v]) => integer(Number(k), 1, 90) && typeof v === 'boolean'));
  requireValid(object(value.cards) && Object.keys(value.cards).length <= 4000);
  for (const [key, card] of Object.entries(value.cards)) {
    requireValid(str(key, 1000) && /^(en-es|es-en):/.test(key) && object(card));
    requireValid(num(card.due, 0, 8640000000000000) && num(card.interval, 0, 90) && integer(card.reviews, 0, 10000000) && ['known', 'difficult', 'forgotten'].includes(String(card.rating)));
  }
  requireValid(strings(value.activity, 10) && value.activity.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x))));
  requireValid(object(value.preferences) && ['en-es', 'es-en'].includes(String(value.preferences.direction)) && integer(value.preferences.week, 1, 12));
  requireValid(value.preferences.difficulty === undefined || ['gentle', 'standard', 'challenge'].includes(String(value.preferences.difficulty)));
  requireValid(value.preferences.cardPractice === undefined || ['reveal', 'recall'].includes(String(value.preferences.cardPractice)));
  requireValid(value.preferences.learningAudio === undefined || typeof value.preferences.learningAudio === 'boolean');
  requireValid(str(value.lastRoute, 200) && /^#\/(plan|cards|challenge|assessments|ai|progress|home|guide|situations)(\/\d{1,2})?(\?[a-z0-9=&-]+)?$/.test(value.lastRoute));
  requireValid(value.lastCard === null || str(value.lastCard, 1000));
  requireValid(object(value.assessments) && Object.keys(value.assessments).every(k => integer(Number(k), 1, 12)));
  Object.values(value.assessments).forEach(validateAssessment);
  if (value.practiceTests !== undefined) {
    requireValid(object(value.practiceTests) && Object.keys(value.practiceTests).every(k => /^(?:[1-9]|1[0-2]):(?:gentle|standard|challenge)$/.test(k)));
    Object.values(value.practiceTests).forEach(validateAssessment);
  }
  requireValid(Array.isArray(value.history) && value.history.length <= 20000);
  for (const result of value.history) {
    requireValid(object(result) && str(result.id, 150) && str(result.label, 300) && ['game', 'assessment'].includes(String(result.kind)) && num(result.at));
    requireValid(integer(result.total, 1, 100) && integer(result.score, 0, result.total) && (result.selfScore === null || integer(result.selfScore, 0, 6)));
    if (result.assessment !== undefined) validateAssessment(result.assessment);
  }
  requireValid(object(value.notes) && Object.keys(value.notes).length <= 100 && Object.entries(value.notes).every(([k, v]) => /^\d{1,2}$/.test(k) && str(v)));
  if (value.quiz !== null) {
    const q = value.quiz;
    requireValid(object(q) && str(q.id, 150) && modes.includes(q.mode as Mode) && integer(q.week, 1, 12) && integer(q.day, 1, 90));
    requireValid(q.difficulty === undefined || ['gentle', 'standard', 'challenge'].includes(String(q.difficulty)));
    requireValid(q.direction === undefined || ['en-es', 'es-en'].includes(String(q.direction)));
    requireValid(q.retry === undefined || typeof q.retry === 'boolean');
    requireValid(q.assisted === undefined || (Array.isArray(q.assisted) && q.assisted.every(i => integer(i, 0, 9))));
    requireValid(q.guideDay === undefined || integer(q.guideDay, 1, 90));
    requireValid(Array.isArray(q.questions) && q.questions.length > 0 && q.questions.length <= 10 && integer(q.index, 0, q.questions.length - 1));
    requireValid(q.assisted === undefined || (Array.isArray(q.assisted) && q.assisted.length <= q.questions.length && new Set(q.assisted).size === q.assisted.length && q.assisted.every(i => integer(i, 0, (q.questions as unknown[]).length - 1))));
    for (const item of q.questions) {
      validateQuestion(item);
      requireValid(object(item) && str(item.id, 1000) && str(item.prompt, 2000) && str(item.answer, 2000) && str(item.explanation, 4000));
      requireValid(item.prompt.trim() && item.answer.trim());
      if (item.options !== undefined) requireValid(strings(item.options, 1000) && item.options.length <= 4);
      if (item.tokens !== undefined) requireValid(strings(item.tokens, 100) && item.tokens.length <= 100);
      if (item.acceptedAnswers !== undefined) requireValid(strings(item.acceptedAnswers, 2000) && item.acceptedAnswers.length <= 100 && item.acceptedAnswers.every(a => a.trim()));
      if (q.mode === 'ordering') requireValid(strings(item.tokens, 100) && item.tokens.length > 0 && [...item.tokens].sort().join(' ') === item.answer.split(/\s+/).sort().join(' '));
      if ((q.mode === 'translation' || q.mode === 'timed') && q.difficulty !== 'challenge') requireValid(strings(item.options, 1000) && item.options.length >= 2 && item.options.includes(item.answer) && new Set(item.options.map(normalize)).size === item.options.length);
    }
    requireValid(Array.isArray(q.responses) && q.responses.length === q.questions.length && q.responses.every(x => x === null || str(x, 2000)));
    requireValid(num(q.startedAt) && (q.finishedAt === null || num(q.finishedAt)) && (q.deadline === null || num(q.deadline)));
    requireValid((q.mode === 'timed') === (q.deadline !== null));
  }
  if (value.daily !== undefined) {
    const d = value.daily;
    requireValid(object(d) && str(d.id, 150) && d.id.startsWith('daily-') && str(d.day, 10) && /^\d{4}-\d{2}-\d{2}$/.test(d.day) && !Number.isNaN(Date.parse(d.day)));
    requireValid(['en-es', 'es-en'].includes(String(d.direction)) && num(d.startedAt) && (d.completedAt === null || num(d.completedAt)));
    requireValid(d.excluded === undefined || (strings(d.excluded, 1000) && d.excluded.length <= 2000));
    requireValid(Array.isArray(d.items) && d.items.length <= 10);
    requireValid(new Set(d.items.map(i => object(i) ? i.wordId : null)).size === d.items.length);
    for (const i of d.items) {
      requireValid(object(i) && str(i.wordId, 1000) && i.wordId.length > 0 && ['review', 'reinforce', 'new'].includes(String(i.kind)));
      requireValid(i.rating === null || ['known', 'difficult', 'forgotten'].includes(String(i.rating)));
      requireValid(integer(i.reviewsBefore, 0, 10000000));
    }
    requireValid(d.completedAt === null || (d.items.length > 0 && d.items.every(i => object(i) && i.rating !== null)));
    if (d.practice !== undefined) {
      const p = d.practice;
      requireValid(object(p) && Array.isArray(p.questions) && p.questions.length === 3 && Array.isArray(p.responses) && p.responses.length === 3 && p.responses.every(r => r === null || str(r, 2000)) && integer(p.index, 0, 3));
      for (const q of p.questions) requireValid(object(q) && str(q.id, 1000) && str(q.prompt, 2000) && str(q.answer, 2000) && str(q.explanation, 4000));
      p.questions.forEach(validateQuestion);
      requireValid(d.difficulty === undefined || ['gentle','standard','challenge'].includes(String(d.difficulty)));
      for (const q of p.questions as Record<string, unknown>[]) requireValid(q.acceptedAnswers === undefined || (strings(q.acceptedAnswers, 2000) && q.acceptedAnswers.length <= 100));
      requireValid(p.responses.slice(0, p.index).every(r => r !== null));
      requireValid(d.completedAt === null || p.index === 3);
    }
  }
  if (value.learning !== undefined) {
    requireValid(object(value.learning) && Object.keys(value.learning).length <= 4000);
    for (const [key, item] of Object.entries(value.learning)) {
      requireValid(str(key, 3000) && object(item) && integer(item.attempts, 1, 10000000) && integer(item.correct, 0, item.attempts) && integer(item.misses, 0, item.attempts) && num(item.lastAt) && typeof item.lastCorrect === 'boolean' && typeof item.recovered === 'boolean');
    }
  }
  // Strip unknown fields and prototypes by serializing the accepted schema.
  return JSON.parse(JSON.stringify({ version: 2, day: value.day, done: value.done, cards: value.cards, activity: value.activity,
    preferences: value.preferences, lastRoute: value.lastRoute, lastCard: value.lastCard, quiz: value.quiz,
    assessments: value.assessments, history: value.history, notes: value.notes, ...(value.daily === undefined ? {} : { daily: value.daily }), ...(value.learning === undefined ? {} : { learning: value.learning }), ...(value.practiceTests === undefined ? {} : { practiceTests: value.practiceTests }) })) as State;
}
export function migrateLegacy(value: unknown, words: Vocabulary[]): State {
  requireValid(object(value) && (object(value.done) || object(value.cards)));
  const state = emptyState();
  if (value.day !== undefined) { requireValid(integer(value.day, 1, 90)); state.day = value.day; }
  if (value.done !== undefined) { requireValid(object(value.done)); for (const [k, v] of Object.entries(value.done)) { requireValid(integer(Number(k), 1, 90) && typeof v === 'boolean'); state.done[k] = v; } }
  if (value.cards !== undefined) {
    requireValid(object(value.cards));
    for (const [key, card] of Object.entries(value.cards)) {
      requireValid(object(card) && str(card.next, 10) && /^\d{4}-\d{2}-\d{2}$/.test(card.next) && integer(card.reviewed, 0, 10000000));
      const due = new Date(`${card.next}T00:00:00`).getTime(); requireValid(num(due));
      for (const word of words.filter(w => w.en.toLowerCase() === key)) state.cards[cardKey(word, 'en-es')] = { due, reviews: card.reviewed, interval: 1, rating: 'difficult' };
    }
  }
  state.lastRoute = `#/plan/${state.day}`; return state;
}
export function importBackup(raw: string, words: Vocabulary[]): State {
  requireValid(raw.length <= 10000000);
  const value: unknown = JSON.parse(raw); requireValid(object(value));
  if (value.format === 'english90-progress' && value.version === 2) return validateState(value.progress);
  if (value.edition === 'V2' && object(value.progress) && value.progress.version === undefined) return migrateLegacy(value.progress, words);
  throw new Error('Archivo no reconocido. Selecciona un respaldo exportado desde English 90.');
}
export function exportBackup(state: State, now = new Date()): string {
  return JSON.stringify({ format: 'english90-progress', version: 2, exportedAt: now.toISOString(), progress: state }, null, 2);
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function loadState(storage: StorageLike, words: Vocabulary[]): { state: State; warning: string | null } {
  try {
    const current = storage.getItem(STORAGE_KEY);
    if (current !== null) return { state: validateState(JSON.parse(current)), warning: null };
    const legacy = storage.getItem(LEGACY_KEY);
    return { state: legacy ? migrateLegacy(JSON.parse(legacy), words) : emptyState(), warning: null };
  } catch {
    return { state: emptyState(), warning: 'No pudimos leer el progreso local. Conservamos los datos originales sin sobrescribirlos. Exporta esta sesión o importa un respaldo válido para recuperar el guardado.' };
  }
}
export function persist(storage: StorageLike, state: State): boolean {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}
