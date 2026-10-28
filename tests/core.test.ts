import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  schedule, dueWords, cardKey, vocabulary, emptyState, emptyAssessment, matches,
  streak, touch, dayStatus, nextDay, parseRoute, shuffle, translationQuestions,
  lessonQuestions, newQuiz, answerQuiz, quizScore, finishQuiz, assessmentScore,
  validateState, migrateLegacy, importBackup, exportBackup, loadState, persist, STORAGE_KEY, LEGACY_KEY,
} from '../Entrenador/core.ts';
import type { Curriculum, State } from '../Entrenador/core.ts';

const data = JSON.parse(readFileSync(new URL('../private/source/English_90_V2_Programa.json', import.meta.url), 'utf8')) as Curriculum;
const words = vocabulary(data);
const now = Date.parse('2026-10-27T12:00:00Z');
function memoryStorage() { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } }; }

test('vocabulary preserves senses and merges identical pairs across weeks', () => {
  assert.equal(words.length, 791);
  assert.equal(new Set(words.map(w => w.en.toLowerCase())).size, 782);
  const repeated = words.find(w => w.weeks.length > 1)!;
  assert.ok(repeated);
  assert.notEqual(cardKey(repeated, 'en-es'), cardKey(repeated, 'es-en'));
});
test('forgotten words return before difficult, difficult before known', () => {
  const forgotten = schedule(undefined, 'forgotten', now);
  const difficult = schedule(undefined, 'difficult', now);
  const known = schedule(undefined, 'known', now);
  assert.equal(forgotten.due, now + 600000);
  assert.equal(difficult.due, now + 86400000);
  assert.equal(known.due, now + 3 * 86400000);
  assert.equal(schedule(known, 'known', now).interval, 7);
  assert.equal(schedule(known, 'forgotten', now).reviews, 2);
  assert.equal(schedule({ ...known, interval: 90 }, 'known', now).interval, 90);
});
test('due queue excludes future reviews and keeps directional schedules independent', () => {
  const cards = { [cardKey(words[0], 'en-es')]: schedule(undefined, 'known', now) };
  assert.equal(dueWords(words.slice(0, 2), cards, 'en-es', now).length, 1);
  assert.equal(dueWords(words.slice(0, 2), cards, 'es-en', now).length, 2);
  assert.equal(dueWords(words.slice(0, 2), cards, 'en-es', now + 3 * 86400000).length, 2);
});
test('review queue prioritizes overdue reviews ahead of unseen vocabulary', () => {
  const cards = { [cardKey(words[1], 'en-es')]: schedule(undefined, 'forgotten', now - 900000) };
  assert.equal(dueWords(words.slice(0, 2), cards, 'en-es', now)[0].id, words[1].id);
});
test('normalization accepts case, whitespace, smart apostrophes and terminal punctuation', () => {
  assert.ok(matches('  ARE. ', 'Are'));
  assert.ok(matches('mustn’t', "mustn't"));
  assert.ok(matches('Good   morning!', 'good morning'));
  assert.ok(matches('must not', "mustn't"));
  assert.ok(matches('learnt', 'learned'));
  assert.ok(!matches('must', "mustn't"));
  assert.ok(!matches('learn', 'learned'));
  assert.ok(!matches('is', 'are'));
  assert.ok(!matches('are not', 'are'));
});
test('translation options are unique and never offer another source-valid translation', () => {
  for (const direction of ['en-es', 'es-en'] as const) for (const week of data.weeks) {
    const pool = words.filter(w => w.weeks.includes(week.week));
    const questions = translationQuestions(pool, words, direction);
    const source = direction === 'en-es' ? 'en' : 'es'; const target = direction === 'en-es' ? 'es' : 'en';
    for (const q of questions) {
      assert.equal(new Set(q.options).size, q.options!.length);
      const valid = words.filter(w => matches(w[source], q.prompt)).map(w => w[target]);
      assert.equal(q.options!.filter(o => valid.some(v => matches(v, o))).length, 1, q.prompt);
      assert.ok(q.options!.includes(q.answer));
    }
  }
});
test('sentence games use source keys and preserve every token including duplicates', () => {
  const completion = lessonQuestions(data.days, 'completion'); const ordering = lessonQuestions(data.days, 'ordering');
  assert.equal(completion.length, 72); assert.equal(ordering.length, 72);
  for (const q of ordering) assert.deepEqual([...q.tokens!].sort(), q.answer.split(/\s+/).sort());
  assert.equal(completion[0].answer, data.days[0].answer);
});
test('shuffle is nonmutating and keeps the complete multiset', () => {
  const source = [1, 1, 2, 3]; const result = shuffle(source, () => 0.3);
  assert.deepEqual(source, [1, 1, 2, 3]); assert.deepEqual(result.sort(), source);
});
test('quiz scores cannot be inflated by double answers or double completion', () => {
  const state = emptyState(); const q = newQuiz('completion', 1, 1, lessonQuestions(data.days.slice(0, 1), 'completion'), now);
  assert.equal(answerQuiz(q, 'IS', now), true);
  assert.equal(answerQuiz(q, 'bad', now), false);
  assert.equal(quizScore(q), 1);
  finishQuiz(state, q, now); finishQuiz(state, q, now);
  assert.equal(state.history.length, 1); assert.equal(state.history[0].score, 1);
  assert.equal(answerQuiz(q, 'is', now), false);
});
test('timed quiz enforces absolute deadline and unanswered questions count zero', () => {
  const q = newQuiz('timed', 1, 1, translationQuestions(words.slice(0, 10), words, 'en-es'), now);
  assert.equal(answerQuiz(q, q.questions[0].answer, now + 60000), false);
  const state = emptyState(); finishQuiz(state, q, now + 60000);
  assert.equal(state.history[0].score, 0); assert.equal(state.history[0].total, 10);
});
test('assessment scoring only evaluates source-key matches, not self-review', () => {
  const a = emptyAssessment(); a.answers = ['is', 'ARE', 'an', 'wrong']; a.self = { reading: 3, writing: 1, speaking: 2 };
  assert.equal(assessmentScore(data.weeks[0].assessment, a.answers), 3);
  assert.equal(assessmentScore(data.weeks[0].assessment, []), 0);
});
test('progress state survives full backup round trip, including drafts and active quiz', () => {
  const state = emptyState(); state.done[2] = true; state.notes[2] = '<script>not executable</script>';
  state.cards[cardKey(words[0], 'en-es')] = schedule(undefined, 'difficult', now);
  state.assessments[1] = emptyAssessment(); state.assessments[1].answers[0] = 'is';
  state.quiz = newQuiz('completion', 1, 1, lessonQuestions(data.days, 'completion'), now);
  assert.deepEqual(importBackup(exportBackup(state), words), state);
});
test('rejects malformed, oversized and newer-version backups without modifying state', () => {
  const original = emptyState(); const snapshot = structuredClone(original);
  const invalid = [null, {}, { ...original, version: 3 }, { ...original, day: 91 }, { ...original, done: { bad: true } }, { ...original, preferences: null }, { ...original, cards: { 'en-es:x': { due: 'tomorrow' } } }, { ...original, history: [{}] }, { ...original, quiz: { index: -1 } }, { ...original, assessments: { 1: {} } }];
  for (const candidate of invalid) assert.throws(() => validateState(candidate));
  assert.throws(() => importBackup('x'.repeat(10000001), words));
  assert.throws(() => importBackup('{broken', words));
  assert.deepEqual(original, snapshot);
});
test('legacy backup migration preserves completion and does not invent reverse-direction reviews', () => {
  const legacy = { day: 7, done: { 1: true, 2: false }, cards: { hello: { next: '2026-10-28', reviewed: 5 } } };
  const state = migrateLegacy(legacy, words);
  assert.equal(state.day, 7); assert.deepEqual(state.done, legacy.done);
  assert.equal(Object.values(state.cards)[0].reviews, 5);
  assert.ok(Object.keys(state.cards).every(k => k.startsWith('en-es:')));
  assert.deepEqual(importBackup(JSON.stringify({ edition: 'V2', progress: legacy }), words), state);
});
test('loads existing progress, migrates legacy storage and reports storage failure', () => {
  const storage = memoryStorage(); const state = emptyState(); state.day = 30;
  assert.equal(persist(storage, state), true);
  assert.equal(loadState(storage, words).state.day, 30);
  storage.setItem(STORAGE_KEY, 'bad JSON');
  assert.ok(loadState(storage, words).warning);
  assert.equal(storage.getItem(STORAGE_KEY), 'bad JSON');
  const old = memoryStorage(); old.setItem(LEGACY_KEY, JSON.stringify({ day: 4, done: { 1: true } }));
  assert.equal(loadState(old, words).state.day, 4);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.equal(persist(blocked, state), false); assert.ok(loadState(blocked, words).warning);
});
test('streak respects local calendar, yesterday grace and unique activity dates', () => {
  const state = emptyState(); const today = new Date(2026, 9, 27, 0, 5);
  touch(state, today); touch(state, today); assert.equal(state.activity.length, 1);
  assert.equal(streak(['2026-10-25', '2026-10-26'], today), 2);
  assert.equal(streak(['2026-10-25'], today), 0);
  assert.equal(streak(['2026-10-26', '2026-10-27'], today), 2);
});
test('journey distinguishes next day, completed and explorable future lessons', () => {
  assert.equal(nextDay({ 1: true, 3: true }), 2);
  assert.equal(dayStatus(1, { 1: true }), 'completed');
  assert.equal(dayStatus(2, { 1: true }), 'available');
  assert.equal(dayStatus(3, { 1: true }), 'future');
  assert.equal(nextDay(Object.fromEntries(data.days.map(d => [d.day, true]))), 90);
});
test('hash navigation supports deep links and bounds invalid day, week and mode', () => {
  assert.deepEqual(parseRoute('#/challenge/30?week=5&mode=ordering'), { section: 'challenge', day: 30, week: 5, mode: 'ordering' });
  assert.equal(parseRoute('#/plan/90').day, 90);
  assert.equal(parseRoute('#/plan/-1', 8).day, 8);
  assert.equal(parseRoute('#/plan/900').day, 1);
  assert.equal(parseRoute('#/bad').section, 'home');
  assert.equal(parseRoute('#/cards?week=99').week, 1);
  assert.equal(parseRoute('#/challenge?mode=oops').mode, 'translation');
});
test('invalid nested quiz and self-review fields cannot enter persistent state', () => {
  const state = emptyState(); state.assessments[1] = emptyAssessment();
  (state.assessments[1].self as Record<string, unknown>).reading = 99;
  assert.throws(() => validateState(state));
  const q = emptyState(); q.quiz = newQuiz('completion', 1, 1, lessonQuestions(data.days, 'completion'), now);
  q.quiz.index = 10; assert.throws(() => validateState(q));
  const malicious = JSON.parse(JSON.stringify(emptyState())) as State;
  malicious.lastRoute = 'javascript:alert(1)'; assert.throws(() => validateState(malicious));
  const ordering = emptyState(); ordering.quiz = newQuiz('ordering', 1, 1, lessonQuestions(data.days, 'ordering'), now);
  delete ordering.quiz.questions[0].tokens; assert.throws(() => validateState(ordering));
  const choice = emptyState(); choice.quiz = newQuiz('translation', 1, 1, translationQuestions(words.slice(0, 10), words, 'en-es'), now);
  delete choice.quiz.questions[0].options; assert.throws(() => validateState(choice));
});
