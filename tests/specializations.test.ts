import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyState, validateState, exportBackup, importBackup, newQuiz, finishQuiz, retryQuiz, parseRoute, questionCorrect } from '../Entrenador/core.ts';
import { missions, nextMission, specialization, specializationQuestions, missionMistakes } from '../Entrenador/specializations.ts';
import { auditPublicBuild } from '../scripts/check-public-build.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('new routes preserve all previous progress through save, restore and route changes', () => {
  const state = emptyState();
  state.done['17'] = true; state.notes['17'] = 'Owner note';
  const before = structuredClone(state);
  const data = specialization(state);
  data.commitment = { primary: 'work', secondary: 'travel', objective: 'Entrevista', referenceDate: '2026-12-01', days: [1,3], time:'18:00', weeklyEvidence:'Una respuesta sin ayuda', followup:'Manual', priorities:['work-01'], reviewDate:'' };
  data.evidence.push({ mission:'work-01', at:Date.now(), completed:true, independent:false, understandable:true, adapted:false, difficult:[], result:'Me presenté', next:'Repasar' });
  assert.equal(nextMission(state,'work').id, 'work-02');
  assert.equal(nextMission(state,'travel').id, 'travel-01');
  data.commitment.primary = 'study';
  data.commitment.secondary = 'work';
  const restored = importBackup(exportBackup(state), []);
  assert.deepEqual(restored.specialization, data);
  assert.deepEqual(restored.done, before.done); assert.deepEqual(restored.notes, before.notes);
  assert.equal(nextMission(restored,'work').id, 'work-02');
  assert.deepEqual(validateState(before), before);
  assert.equal(parseRoute('#/routes?mission=travel-12').section, 'routes');
});

test('all mission exercises are deterministic transformations of approved bilingual expressions', () => {
  const approved = JSON.parse(readFileSync('private/editorial/content/specializations/manifest.json','utf8'));
  for (const m of missions) {
    assert.deepEqual(m.core, approved.missions.find((p: {id:string}) => p.id === m.id).core);
    for (const difficulty of ['gentle','standard','challenge'] as const) for (const mode of ['translation','recall','completion','ordering'] as const) {
      const questions = specializationQuestions(m, mode, difficulty, emptyState());
      assert.equal(questions.length,4);
      for (const q of questions) {
        assert.ok(questionCorrect(q, q.answer));
        assert.ok(!questionCorrect(q, 'an invented response'));
        if (q.options) assert.equal(new Set(q.options).size,4);
        if (q.tokens) assert.deepEqual([...q.tokens].sort(), q.answer.split(/\s+/).sort());
        if (mode === 'completion') assert.ok(m.core.some(p => p.en === q.prompt.split(' (')[0].replace('___',q.answer)));
        else assert.ok(m.core.some(p => p.en === q.answer));
      }
      const state = emptyState();
      state.quiz = {...newQuiz(mode, m.week, 1, questions),missionId:m.id,difficulty,direction:'es-en'};
      assert.deepEqual(validateState(state),state);
    }
  }
});

test('mistake replay keeps mission context and never invents mastery from options or repeated attempts', () => {
  const state = emptyState(), m = missions[0];
  const questions = specializationQuestions(m,'recall','standard',state);
  const q = {...newQuiz('recall',1,1,questions),missionId:m.id};
  q.responses = q.questions.map((p,i) => i ? p.answer : 'wrong');
  finishQuiz(state,q);
  const prior = structuredClone(state.learning);
  assert.equal(missionMistakes(m,state).length,1);
  const retry = retryQuiz(q)!;
  assert.equal(retry.missionId,m.id);
  retry.responses = retry.questions.map(p => p.answer);
  finishQuiz(state,retry);
  assert.deepEqual(state.learning,prior);
  const recognized = {...newQuiz('translation',1,1,specializationQuestions(m,'translation','gentle',state)),missionId:m.id};
  recognized.responses = recognized.questions.map(p => p.answer);
  finishQuiz(state,recognized);
  assert.deepEqual(state.learning,prior);
  assert.ok(state.history[0].label.startsWith('Misión work-01'));
});

test('malformed specialization backups fail before replacing existing progress', () => {
  for (const invalid of [null, {}, {opened:{'work-99':0},evidence:[]}, {opened:{},evidence:[{mission:'work-01'}]},
    {opened:{},evidence:[],commitment:{primary:'work',secondary:'work'}}]) {
    assert.throws(() => validateState({...emptyState(),specialization:invalid}));
  }
});

test('accepted contractions are not replayed as mistakes and recognition errors survive other missions and backups', () => {
  const state = emptyState(), m = missions.find(m => m.id === 'work-03')!;
  const q = {...newQuiz('recall',3,15,specializationQuestions(m,'recall','standard',state)),missionId:m.id};
  q.responses = q.questions.map(p => p.answer.replace("I'm",'I am').replace("We're",'We are').replace("It's",'It is'));
  state.quiz = q; finishQuiz(state,q);
  assert.equal(missionMistakes(m,state).length,0);
  const other = missions.find(m => m.id === 'work-04')!;
  const recognized = {...newQuiz('translation',4,22,specializationQuestions(other,'translation','gentle',state)),missionId:other.id};
  recognized.responses = recognized.questions.map((p,i) => i ? p.answer : 'wrong');
  finishQuiz(state,recognized);
  state.quiz = q;
  const restored = importBackup(exportBackup(state),[]);
  assert.equal(missionMistakes(other,restored).length,1);
  for (const mission of missions) for (const p of specializationQuestions(mission,'recall','standard',restored)) {
    for (const alias of p.acceptedAnswers || []) assert.ok(questionCorrect(p,alias));
  }
  const prefer = specializationQuestions(missions.find(m => m.id === 'travel-09')!,'recall','standard',state).find(q => q.answer.startsWith("I'd"))!;
  assert.ok(questionCorrect(prefer,'I would prefer a room near the center.'));
  assert.ok(!questionCorrect(prefer,'I would not prefer a room near the center.'));
});

test('public boundary rejects new private dialogues and assessment prose inside a renamed bundle', async () => {
  const source = JSON.parse(readFileSync('private/editorial/content/specializations/manifest.json','utf8'));
  const root = await mkdtemp(join(tmpdir(),'e90-specializations-'));
  try {
    await mkdir(join(root,'assets')); await mkdir(join(root,'aprender'));
    await writeFile(join(root,'index.html'),'public'); await writeFile(join(root,'aprender/index.html'),'public');
    for (const text of [source.missions[0].dialogue, source.sections['11'].split(/\n\s*\n/).find((s:string) => s.length>70)]) {
      await writeFile(join(root,'assets/leak.js'), JSON.stringify(text));
      await assert.rejects(auditPublicBuild(root),/Premium prose/);
    }
  } finally { await rm(root,{recursive:true,force:true}); }
});
