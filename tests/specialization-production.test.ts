import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {emptyState,validateState,exportBackup,importBackup,questionCorrect} from '../Entrenador/core.ts';
import {missions,publicPractice,missionPractice,specializationQuestions,nextMission,productionDraft} from '../Entrenador/specializations.ts';

test('all 36 public tasks and the common rubric are literal approved copy, with eight complete examples',()=>{
  const raw=readFileSync('private/editorial/content/specializations/public-v1-approved.md','utf8');
  assert.equal(publicPractice.missions.length,36);
  for(const m of missions){
    const p=missionPractice(m.id);
    for(const text of [p.context,p.produce,p.challenge,...p.notes,...p.examples.flatMap(e=>[e.pattern,e.en,e.es])]) assert.ok(raw.includes(text),text);
    assert.equal(p.examples.length,m.id==='work-12'?2:m.id==='study-09'||m.id==='study-11'?1:m.id==='study-12'?4:0);
  }
  for(const text of [...publicPractice.selfReview.questions,...publicPractice.selfReview.options,publicPractice.selfReview.adaptQuestion,...Object.values(publicPractice.difficulty)]) assert.ok(raw.includes(text));
  assert.ok(missionPractice('travel-04').notes.some(n=>n.includes('contaminación cruzada')));
  assert.ok(missionPractice('travel-04').foodClarification?.includes('Does this contain peanuts or tree nuts?'));
});

test('free production and self-review round-trip independently of grades and preserve old state',()=>{
  const state=emptyState();state.done['17']=true;state.notes['17']='Prior note';
  const old=structuredClone(state);
  for(const m of missions) for(const difficulty of ['gentle','standard','challenge'] as const){
    const d=productionDraft(state,m.id,difficulty);
    d.text='My own answer, with a different name and a different time.';
    d.review=['independent','hints','independent'];
    if(difficulty==='challenge'){d.challenge='A new response to the changed situation.';d.adaptationReview='hints';}
    d.submittedAt=d.updatedAt;
  }
  const restored=importBackup(exportBackup(state),[]);
  assert.deepEqual(restored.specialization,state.specialization);
  assert.deepEqual(restored.done,old.done);assert.deepEqual(restored.notes,old.notes);
  assert.deepEqual(restored.history,[]);assert.equal(restored.learning,undefined);
  assert.deepEqual(validateState(old),old);
  assert.equal(nextMission(restored,'work').id,'work-12');
  assert.throws(()=>validateState({...state,specialization:{...state.specialization,productions:{'work-01':{standard:{...productionDraft(state,'work-01','standard'),review:['independent']}}}}}));
  assert.throws(()=>validateState({...state,specialization:{...state.specialization,productions:{'work-01':{challenge:{...productionDraft(state,'work-01','challenge'),challenge:''}}}}}));
});

test('completion rotates supplied words, preserves every source token, keeps patterns visible and accepts its closed answer',()=>{
  const positions=new Set<number>();
  for(const m of missions)for(const q of specializationQuestions(m,'completion','standard',emptyState())){
    const [sentence]=q.prompt.split(' (');
    assert.equal((sentence.match(/___/g)||[]).length,1);
    assert.ok(m.core.some(p=>p.en===sentence.replace('___',q.answer)));
    assert.ok(!/\.{3}|…/.test(q.answer));
    positions.add(sentence.split(/\s+/).indexOf('___'));
    assert.ok(questionCorrect(q,q.answer));
  }
  assert.ok(positions.size>=4);
  assert.ok(missions.find(m=>m.id==='study-06')!.core.some(p=>p.en==='How do I get to the student services office?'));
});


test('lazy route metadata keeps strict mission validation in imported backups',()=>{
  for(const mission of [['work-01'],{id:'work-01'},1,'work-13']) {
    const value={...emptyState(),specialization:{opened:{},evidence:[{mission,at:1,independent:false,completed:false,understandable:false,adapted:false,difficult:[],result:'',next:''}]}};
    assert.throws(()=>validateState(value),/respaldo de rutas/);
  }
});
