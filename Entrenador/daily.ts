import { cardKey, dueWords, localDate, normalize, schedule, touch } from './core.ts';
import type { Direction, Rating, State, Vocabulary } from './core.ts';

export interface DailyItem {
  wordId: string;
  kind: 'review' | 'reinforce' | 'new';
  rating: Rating | null;
  reviewsBefore: number;
}
export interface DailySession {
  id: string;
  day: string;
  direction: Direction;
  startedAt: number;
  items: DailyItem[];
  completedAt: number | null;
  excluded?: string[];
}

export function hasLearning(state: State): boolean {
  return Object.values(state.cards).some(c => c.reviews > 0) || state.history.length > 0 ||
    Object.values(state.done).some(Boolean) || Object.values(state.notes).some(n => n.trim()) ||
    Object.values(state.assessments).some(a => a.answers.some(v => v.trim()) || a.notes.trim()) ||
    !!state.quiz?.responses.some(r => r !== null);
}

// Select a bounded practice queue; scheduling remains exclusively in core.schedule.
export function createDaily(state: State, words: Vocabulary[], now = Date.now()): DailySession {
  const direction = state.preferences.direction;
  const previous = state.daily;
  const excluded = new Set(previous && (previous.completedAt === null || previous.day === localDate(new Date(now))) ? [...(previous.excluded ?? []), ...previous.items.filter(i => i.rating !== null).map(i => i.wordId)] : []);
  const seen = new Set<string>();
  const items: DailyItem[] = [];
  const selected = [...words].sort((a, b) => Number(b.weeks.includes(state.preferences.week)) - Number(a.weeks.includes(state.preferences.week)));
  const getCard = (word: Vocabulary) => state.cards[cardKey(word, direction)];
  function add(pool: Vocabulary[], kind: DailyItem['kind'], count: number) {
    let added = 0;
    for (const word of pool) {
      const prompt = normalize(direction === 'en-es' ? word.en : word.es);
      if (added >= count || items.length >= 10) break;
      if (excluded.has(word.id) || seen.has(prompt)) continue;
      seen.add(prompt);
      items.push({ wordId: word.id, kind, rating: null, reviewsBefore: getCard(word)?.reviews ?? 0 });
      added++;
    }
  }
  const due = dueWords(selected, state.cards, direction, now).filter(w => getCard(w));
  add(due, 'review', 5);
  // Optional reinforcement is clearly identified; an explicit rating uses the same schedule.
  add(selected.filter(w => getCard(w) && getCard(w).rating !== 'known' && getCard(w).due > now), 'reinforce', Math.max(0, 5 - items.length));
  add(selected.filter(w => !getCard(w)), 'new', 5);
  add(due, 'review', 10 - items.length);
  add(selected.filter(w => !getCard(w)), 'new', 10 - items.length);
  return { id: `daily-${now}-${Math.random().toString(36).slice(2, 8)}`, day: localDate(new Date(now)), direction, startedAt: now, items, completedAt: null, excluded: [...excluded] };
}

export function rateDaily(state: State, words: Vocabulary[], sessionId: string, wordId: string, rating: Rating, now = Date.now()): boolean {
  const session = state.daily;
  if (!session || session.id !== sessionId || session.completedAt !== null) return false;
  const item = session.items.find(i => i.rating === null);
  const word = words.find(w => w.id === wordId);
  if (!item || item.wordId !== wordId || !word) return false;
  const key = cardKey(word, session.direction);
  // Another tab or the regular vocabulary screen may already have reviewed this item.
  // Carry that grade into the recap, without scheduling or counting it twice.
  if ((state.cards[key]?.reviews ?? 0) > item.reviewsBefore) item.rating = state.cards[key].rating;
  else {
    state.cards[key] = schedule(state.cards[key], rating, now);
    item.rating = rating;
    touch(state, new Date(now));
  }
  return true;
}

export function completeDaily(state: State, now = Date.now()): boolean {
  const session = state.daily;
  if (!session || session.completedAt !== null || !session.items.length || session.items.some(i => i.rating === null)) return false;
  session.completedAt = now;
  if (!state.history.some(r => r.id === session.id)) state.history.push({
    id: session.id, label: 'Práctica diaria · autoevaluación', kind: 'game', at: now,
    score: session.items.filter(i => i.rating === 'known').length, total: session.items.length, selfScore: null,
  });
  // Reading the recap alone does not earn another day of activity.
  return true;
}
