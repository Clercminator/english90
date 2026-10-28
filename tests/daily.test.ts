import test from 'node:test';
import assert from 'node:assert/strict';
import { createDaily, rateDaily, completeDaily, hasLearning } from '../Entrenador/daily.ts';
import { vocabulary, emptyState, cardKey, schedule, validateState, exportBackup, importBackup, localDate } from '../Entrenador/core.ts';
import { publicVocabulary, conversationPrompt } from '../Entrenador/free.ts';
const words = vocabulary(publicVocabulary);
const now = new Date(2026, 9, 28, 12).getTime();

test('new visitors get a bounded unique queue without any automatic learning credit', () => {
  const state = emptyState();
  state.activity.push(localDate(new Date(now))); // Legacy visit/copy activity alone is not learning.
  assert.equal(hasLearning(state), false);
  state.daily = createDaily(state, words, now);
  assert.equal(state.daily.items.length, 10);
  assert.equal(new Set(state.daily.items.map(i => i.wordId)).size, 10);
  assert.equal(Object.keys(state.cards).length, 0);
  assert.equal(hasLearning(state), false);
});

test('daily selection prioritizes due cards, then difficult cards, and adds new expressions', () => {
  const state = emptyState();
  words.slice(0, 3).forEach(w => { state.cards[cardKey(w, 'en-es')] = schedule(undefined, 'forgotten', now - 700000); });
  words.slice(3, 5).forEach(w => { state.cards[cardKey(w, 'en-es')] = schedule(undefined, 'difficult', now); });
  const session = createDaily(state, words, now);
  assert.deepEqual(session.items.map(i => i.kind), ['review', 'review', 'review', 'reinforce', 'reinforce', 'new', 'new', 'new', 'new', 'new']);
  assert.ok(session.items.slice(0, 3).every(i => state.cards[`en-es:${i.wordId}`].due <= now));
});

test('grading uses the existing scheduler exactly once and round-trips interrupted sessions', () => {
  const state = emptyState(); state.daily = createDaily(state, words, now);
  const first = state.daily.items[0];
  assert.equal(rateDaily(state, words, state.daily.id, first.wordId, 'difficult', now), true);
  assert.deepEqual(state.cards[`en-es:${first.wordId}`], schedule(undefined, 'difficult', now));
  assert.equal(rateDaily(state, words, state.daily.id, first.wordId, 'known', now), false);
  const restored = importBackup(exportBackup(state), words);
  assert.deepEqual(restored, state);
  assert.equal(hasLearning(restored), true);
  assert.equal(completeDaily(restored, now), false);
  assert.equal(restored.daily!.items.filter(i => i.rating !== null).length, 1);
});

test('completion is idempotent, records a recap, and does not change schedules or earn a new day', () => {
  const state = emptyState(); state.daily = createDaily(state, words, now);
  for (const item of state.daily.items) rateDaily(state, words, state.daily.id, item.wordId, 'known', now);
  const cards = structuredClone(state.cards); const activity = [...state.activity];
  assert.equal(completeDaily(state, now + 86400000), true);
  assert.equal(completeDaily(state, now + 86400000), false);
  assert.equal(state.history.length, 1); assert.equal(state.history[0].score, 10);
  assert.deepEqual(state.cards, cards); assert.deepEqual(state.activity, activity);
});

test('restarting does not repeat committed cards; stale or independently graded cards do not double count', () => {
  const state = emptyState(); state.daily = createDaily(state, words, now);
  const item = state.daily.items[0]; const id = state.daily.id;
  state.cards[`en-es:${item.wordId}`] = schedule(undefined, 'known', now); // A separate vocabulary review.
  assert.equal(rateDaily(state, words, id, item.wordId, 'forgotten', now), true);
  assert.equal(state.cards[`en-es:${item.wordId}`].reviews, 1);
  assert.equal(item.rating, 'known');
  state.daily = createDaily(state, words, now + 1);
  assert.ok(!state.daily.items.some(i => i.wordId === item.wordId));
  state.daily = createDaily(state, words, now + 2);
  assert.ok(!state.daily.items.some(i => i.wordId === item.wordId));
  assert.equal(rateDaily(state, words, id, item.wordId, 'known', now), false);
});

test('exhausted and tiny queues are valid and reverse direction keeps an independent schedule', () => {
  const state = emptyState();
  words.forEach(w => { state.cards[cardKey(w, 'en-es')] = schedule(undefined, 'known', now); });
  state.daily = createDaily(state, words, now);
  assert.equal(state.daily.items.length, 0); assert.equal(completeDaily(state, now), false);
  state.preferences.direction = 'es-en'; state.daily = createDaily(state, words.slice(0, 2), now);
  assert.equal(state.daily.items.length, 2);
  rateDaily(state, words, state.daily.id, state.daily.items[0].wordId, 'forgotten', now);
  assert.equal(state.cards[`en-es:${state.daily.items[0].wordId}`].rating, 'known');
  assert.equal(state.cards[`es-en:${state.daily.items[0].wordId}`].rating, 'forgotten');
});

test('old schema-2 backups remain unchanged and malformed sessions are rejected', () => {
  const old = emptyState(); old.done[30] = true; old.notes[30] = 'My saved note';
  assert.deepEqual(validateState(old), old);
  assert.deepEqual(importBackup(exportBackup(old), words), old);
  const state = structuredClone(old); state.daily = createDaily(state, words, now);
  const bad = structuredClone(state); bad.daily!.items.push(bad.daily!.items[0]);
  assert.throws(() => validateState(bad));
  const badRating = structuredClone(state); (badRating.daily!.items[0] as {rating: unknown}).rating = 'mastered';
  assert.throws(() => validateState(badRating));
  state.daily.completedAt = now; assert.throws(() => validateState(state));
});

test('a new local day can select previously completed cards when they become due again', () => {
  const state = emptyState(); state.daily = createDaily(state, words.slice(0, 2), now);
  for (const i of state.daily.items) rateDaily(state, words, state.daily.id, i.wordId, 'forgotten', now);
  completeDaily(state, now);
  const next = createDaily(state, words.slice(0, 2), now + 86400000);
  assert.equal(next.items.length, 2); assert.equal(next.day, localDate(new Date(now + 86400000)));
  assert.ok(next.items.every(i => i.kind === 'review'));
});

test('conversation prompts are grounded in the selected content and specify a beginner conversation', () => {
  const prompt = conversationPrompt(4);
  assert.match(prompt, /comida y compras/); assert.match(prompt, /water \(agua\)/);
  assert.match(prompt, /una sola pregunta/); assert.match(prompt, /responder en inglés/);
  const contextual = conversationPrompt(1, [{en: 'good morning', es: 'buenos días'}]);
  assert.match(contextual, /good morning \(buenos días\)/);
  assert.doesNotMatch(contextual, /water/);
});
