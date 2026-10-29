import test from 'node:test';
import assert from 'node:assert/strict';
import { vocabulary, recallQuestions, questionCorrect, newQuiz, answerQuiz, finishQuiz, quizScore, quizStreak, retryQuiz, emptyState, validateState, exportBackup, importBackup, parseRoute } from '../Entrenador/core.ts';
import { publicVocabulary, publicContent, wordExamples } from '../Entrenador/free.ts';

const words = vocabulary(publicVocabulary);

test('written answers accept unambiguous contractions and commas without accepting changed meaning', () => {
  const q = { id: 'sentence', prompt: 'Escribe la frase', answer: 'I am organized, and I do not give up.', explanation: 'Modelo' };
  assert.ok(questionCorrect(q, "I'm organized and I don't give up"));
  assert.ok(!questionCorrect(q, "I'm organized and I give up"));
  assert.ok(!questionCorrect(q, "I was organized and I don't give up"));
});

test('written recall accepts catalog alternatives and omits explanatory parentheses without fuzzy scoring', () => {
  const questions = recallQuestions(words, words, 'es-en');
  const repeated = questions.find(q => new Set(q.acceptedAnswers).size > 1)!;
  assert.ok(repeated);
  for (const answer of repeated.acceptedAnswers!) assert.ok(questionCorrect(repeated, answer));
  assert.equal(questionCorrect(repeated, 'not a translation'), false);
  assert.equal(questionCorrect(repeated, null), false);
  const annotated = recallQuestions(words.filter(w => w.en === 'from'), words, 'en-es')[0];
  assert.ok(questionCorrect(annotated, 'de'));
  assert.ok(questionCorrect(annotated, 'de (origen)'));
  assert.equal(questionCorrect(annotated, 'desde otra cosa'), false);
  const ticket = recallQuestions(words.filter(w => w.en === 'ticket'), words, 'en-es')[0];
  assert.ok(questionCorrect(ticket, 'boleto')); assert.ok(questionCorrect(ticket, 'billete'));
});

test('mistake replay includes wrong, skipped and unanswered questions, preserves original history and snapshots', () => {
  const state = emptyState();
  const original = { ...newQuiz('recall', 1, 1, recallQuestions(words.slice(0, 4), words, 'es-en'), 1000), difficulty: 'challenge' as const, direction: 'es-en' as const };
  assert.equal(retryQuiz(original), null);
  answerQuiz(original, original.questions[0].answer, 1100);
  assert.equal(quizStreak(original), 1);
  original.index++; answerQuiz(original, 'incorrect', 1200);
  assert.equal(quizStreak(original), 0);
  original.index++; answerQuiz(original, '', 1300);
  finishQuiz(state, original, 1400);
  const snapshot = structuredClone(original);
  const retry = retryQuiz(original, 1500)!;
  assert.equal(retry.questions.length, 3);
  assert.equal(retry.direction, 'es-en'); assert.equal(retry.difficulty, 'challenge');
  assert.ok(retry.retry); assert.equal(retry.finishedAt, null);
  assert.deepEqual(retry.responses, [null, null, null]);
  assert.notEqual(retry.id, original.id);
  assert.equal(retry.questions.some(q => q.id === original.questions[0].id), false);
  retry.questions.forEach((q, index) => { retry.index = index; answerQuiz(retry, q.answer, 1600); });
  assert.equal(quizStreak(retry), 3); assert.equal(quizScore(retry), 3);
  finishQuiz(state, retry, 1700); finishQuiz(state, retry, 1800);
  assert.equal(retryQuiz(retry), null);
  assert.deepEqual(original, snapshot);
  assert.deepEqual(state.history.map(r => [r.score, r.total]), [[1, 4], [3, 3]]);
  assert.match(state.history[1].label, /Repaso de errores/);
});

test('new practice states survive backup and reject unsupported difficulty or direction', () => {
  for (const mode of ['recall', 'translation', 'timed'] as const) {
    const state = emptyState();
    state.preferences = { direction: 'en-es', week: 1, difficulty: 'challenge', cardPractice: 'recall' };
    state.quiz = { ...newQuiz(mode, 1, 1, recallQuestions(words.slice(0, 5), words, 'es-en')), difficulty: 'challenge', direction: 'es-en' };
    assert.deepEqual(importBackup(exportBackup(state), words), state);
    assert.throws(() => validateState({ ...state, quiz: { ...state.quiz, direction: 'invalid' } }));
    assert.throws(() => validateState({ ...state, quiz: { ...state.quiz, difficulty: 'impossible' } }));
    assert.throws(() => validateState({ ...state, quiz: { ...state.quiz, questions: [{ ...state.quiz!.questions[0], acceptedAnswers: [''] }] } }));
  }
  assert.equal(parseRoute('#/challenge?mode=recall').mode, 'recall');
});

test('context examples match whole expressions and every category has six distinct explained exercises', () => {
  const hello = words.find(w => w.en === 'hello')!;
  assert.ok(wordExamples(hello).some(s => s.en.startsWith('Hello,')));
  const testWord = { ...hello, en: 'hell' };
  assert.equal(wordExamples(testWord).length, 0);
  for (let category = 1; category <= 12; category++) {
    const sentences = publicContent.sentences.filter(s => s.category === category);
    assert.equal(sentences.length, 6);
    assert.equal(new Set(sentences.map(s => s.prompt)).size, 6);
    for (const s of sentences) assert.ok(s.explanation.length > 30);
  }
});
