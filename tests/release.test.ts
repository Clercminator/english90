import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyState, vocabulary, validateState, exportBackup, importBackup, questionCorrect, assessmentScore, newQuiz, finishQuiz, quizScore } from '../Entrenador/core.ts';
import type { Curriculum } from '../Entrenador/core.ts';
import { createDaily, addDailyPractice, completeDaily, rateDaily } from '../Entrenador/daily.ts';
import { recordEvidence, prioritize, independentAccuracy, milestones } from '../Entrenador/learning.ts';
import { englishVoice } from '../Entrenador/audio.ts';
import { publicVocabulary, publicContent } from '../Entrenador/free.ts';
import { guideDays, situations } from '../Entrenador/guide.ts';
const words = vocabulary(publicVocabulary);
const now = new Date(2026,9,29,12).getTime();
const questions = [{id:'one', prompt:'Fui', answer:'went', explanation:'Pasado de go.'}, {id:'two', prompt:'Voy', answer:'go', explanation:'Presente.'}];

test('delayed retrieval records mistakes, prioritizes them and never inflates on same-day retries or assistance', () => {
  const state = emptyState();
  recordEvidence(state, questions, ['go','go'], now);
  recordEvidence(state, questions, ['went','go'], now+1000);
  assert.deepEqual(independentAccuracy(state), {attempts:2,correct:1,ready:false});
  assert.equal(prioritize([...questions].reverse(),state)[0].id,'one');
  recordEvidence(state, questions, ['went','go'], now+86400000,[1]);
  assert.deepEqual(independentAccuracy(state), {attempts:3,correct:2,ready:false});
  assert.ok(milestones(state).some(m=>m.includes('otro día')));
  assert.deepEqual(importBackup(exportBackup(state),words),state);
  assert.throws(()=>validateState({...state,learning:{bad:{attempts:1,correct:2}}}));
});
test('new daily sessions combine three distinct prompts, preserve unfinished answers, and finish exactly once', () => {
  const state=emptyState(); state.daily=createDaily(state,words,now); addDailyPractice(state,words);
  const daily=state.daily, practice=daily.practice!;
  assert.equal(new Set(practice.questions.map(q=>q.id)).size,3);
  for(const item of daily.items) rateDaily(state,words,daily.id,item.wordId,'difficult',now);
  assert.equal(completeDaily(state,now),false);
  practice.responses[0]='wrong'; practice.index=1;
  assert.deepEqual(importBackup(exportBackup(state),words),state);
  practice.responses=practice.questions.map(q=>q.answer); practice.index=3;
  assert.equal(completeDaily(state,now),true); assert.equal(completeDaily(state,now),false);
  assert.equal(state.history.length,2); assert.equal(independentAccuracy(state).attempts,3);
  assert.ok(Object.values(state.cards).every(c=>c.reviews===1));
  assert.throws(()=>validateState({...state,daily:{...daily,practice:{...practice,index:0}}}));
});
test('every guide day references actual source metadata and only available free expressions and exercises', async () => {
  const source=JSON.parse(await readFile('private/source/English_90_V2_Programa.json','utf8')) as Curriculum;
  assert.equal(guideDays.length,90);
  for(const mapping of guideDays){
    const day=source.days.find(d=>d.day===mapping.day)!;
    assert.equal(mapping.week,day.week); assert.equal(mapping.topic,day.title);
    for(const id of mapping.vocabulary){
      const word=words.find(w=>w.id===id)!; assert.ok(word);
      assert.ok(day.vocab?.some(([en,es])=>en===word.en && es===word.es));
    }
    for(const id of mapping.sentences) assert.ok(publicContent.sentences.some(s=>s.id===id && s.category===mapping.category));
  }
  assert.equal(guideDays[17].sentences.includes('practice-3-2'),true);
  assert.deepEqual(guideDays[89].sentences,[]);
  assert.equal(source.days.filter(d=>d.type==='lesson').length,72);
  assert.equal(source.days.filter(d=>d.type==='assessment').length,12);
  for(const scene of situations) for(const step of scene.steps) assert.ok(publicContent.sentences.some(s=>s.id===step.sentence));
});
test('English audio never selects a Spanish or remote service voice', () => {
  const voice=(lang:string,localService=true)=>({lang,localService,default:false}) as SpeechSynthesisVoice;
  assert.equal(englishVoice([voice('es-CL'),voice('en-US',false)]),undefined);
  const english=voice('en-GB'); assert.equal(englishVoice([voice('es-CL'),english]),english);
});
test('listening fallback persists and never scores revealed answers as independent listening', () => {
  const state=emptyState(), quiz=newQuiz('listening',1,1,questions,now);
  quiz.responses=quiz.questions.map(q=>q.answer); quiz.assisted=[0]; state.quiz=quiz;
  assert.equal(quizScore(quiz),1); finishQuiz(state,quiz,now);
  assert.equal(independentAccuracy(state).attempts,1);
  assert.deepEqual(importBackup(exportBackup(state),words),state);
  const retry={...quiz,id:'retry',finishedAt:null,retry:true}; finishQuiz(state,retry,now+86400000);
  assert.equal(independentAccuracy(state).attempts,1);
});
test('valid alternatives and regional spellings pass while changed negation and tense fail', () => {
  const q={id:'regional',prompt:'',answer:'She is travelling to the city centre.',explanation:''};
  assert.equal(questionCorrect(q,"She's traveling to the city center."),true);
  assert.equal(questionCorrect(q,'She was traveling to the city center.'),false);
  assert.equal(questionCorrect(q,"She isn't traveling to the city center."),false);
  assert.equal(assessmentScore(publicContent.tests[2].items,['have to','must not','should','repeat']),4);
  assert.equal(assessmentScore(publicContent.tests[2].items,['do not have to','must','should','repeat']),2);
});
