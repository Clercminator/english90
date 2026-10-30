import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceTest, readingQuestions, extensionContent } from '../Entrenador/levels.ts';
import { emptyState, emptyAssessment, validateState, exportBackup, importBackup, vocabulary, questionCorrect } from '../Entrenador/core.ts';
import { createDaily, addDailyPractice } from '../Entrenador/daily.ts';
import { publicVocabulary, conversationPrompt, sentenceQuestions, challengeSentences } from '../Entrenador/free.ts';
import { recordEvidence } from '../Entrenador/learning.ts';
const words = vocabulary(publicVocabulary);
test('all situations offer three distinct reading and test difficulties with supported answer choices', () => {
  for(let category=1;category<=12;category++) {
    let previousLength=0;
    for(const level of ['gentle','standard','challenge'] as const) {
      const reading=readingQuestions(category,level);
      assert.equal(reading.length,2);
      assert.ok(reading[0].context!.length>previousLength); previousLength=reading[0].context!.length;
      for(const q of reading) {
        assert.equal(q.options!.filter(a=>questionCorrect(q,a)).length,1);
        assert.ok(q.explanation.length>20);
      }
      const items=practiceTest(category,level);
      assert.equal(items.length,4); assert.equal(new Set(items.map(q=>q.id)).size,4);
      if(level==='gentle') assert.ok(items.every(q=>q.options?.includes(q.answer)));
      if(level==='challenge') assert.equal(items.filter(q=>q.context).length,2);
      else for(let round=0;round<3;round++) assert.ok(practiceTest(category,level,round).every(q=>!challengeSentences.has(q.id)));
    }
    assert.equal(sentenceQuestions(category,'ordering').length,8);
  }
  assert.equal(extensionContent.sentences.length,24);
});
test('difficulty-specific test drafts and snapshots survive backup without changing legacy tests', () => {
  const state=emptyState(); state.assessments[1]={...emptyAssessment(),notes:'Keep my old note'};
  state.practiceTests={'1:challenge':{...emptyAssessment(),questions:practiceTest(1,'challenge'),answers:['had','','','']}};
  assert.deepEqual(importBackup(exportBackup(state),words),state);
  assert.throws(()=>validateState({...state,practiceTests:{'99:challenge':state.practiceTests!['1:challenge']}}));
  const bad=structuredClone(state); bad.practiceTests!['1:challenge'].questions![2].options=['wrong','wrong'];
  assert.throws(()=>validateState(bad));
});
test('daily difficulty overrides automatic selection and choice practice never earns written-recall credit', () => {
  for(const difficulty of ['gentle','standard','challenge'] as const) {
    const state=emptyState(); state.preferences.difficulty=difficulty; state.daily=createDaily(state,words); addDailyPractice(state,words);
    const p=state.daily.practice!;
    assert.equal(state.daily.difficulty,difficulty);
    if(difficulty==='gentle') assert.ok(p.questions.every(q=>q.options));
    if(difficulty==='challenge') assert.ok(p.questions.some(q=>q.context));
    recordEvidence(state,p.questions,p.questions.map(q=>q.answer));
    assert.equal(Object.keys(state.learning!).length,difficulty==='gentle'?0:difficulty==='challenge'?2:3);
    assert.deepEqual(validateState(state),state);
  }
});
test('conversation challenge asks for argumentation and reformulation without declaring a proficiency level', () => {
  const easy=conversationPrompt(11,[],'gentle'), hard=conversationPrompt(11,[],'challenge');
  assert.match(easy,/Soy principiante/); assert.doesNotMatch(hard,/Soy principiante/);
  assert.match(hard,/responder a objeciones/); assert.match(hard,/reformular/); assert.match(hard,/No presentes.*certificación/);
});
