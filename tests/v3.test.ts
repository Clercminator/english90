import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, writeFile, rm, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { auditPublicBuild } from '../scripts/check-public-build.mjs';
import { publicContent, publicVocabulary, sentenceQuestions, categoryProgress, publicResume } from '../Entrenador/free.ts';
import { vocabulary, cardKey, schedule, emptyState, emptyAssessment, exportBackup, importBackup, newQuiz, validateState } from '../Entrenador/core.ts';
import { siteConfig, validateConfig } from '../Entrenador/config.ts';
import { consentAllowsAds } from '../Entrenador/ads.ts';
import type { ConsentData } from '../Entrenador/ads.ts';
import { publicPages } from '../archive/commercial-v3.1/public-pages.mjs';
import { publicPages as freePages } from '../scripts/public-pages.mjs';

const words = vocabulary(publicVocabulary);

test('public content is a strict selected subset and never includes the daily curriculum', async () => {
  assert.deepEqual(Object.keys(publicContent).sort(), ['audience','categories','schemaVersion','sentences','tests']);
  assert.equal(words.length, 791);
  const original = JSON.parse(await readFile('private/source/English_90_V2_Programa.json','utf8'));
  assert.deepEqual(words, vocabulary(original));
  assert.equal(publicContent.sentences.length, 72);
  assert.deepEqual(publicContent.tests.map(t => t.category), [1,4,8,12]);
  assert.equal(JSON.stringify(publicContent).includes('practice_prompt'), false);
  for(const category of publicContent.categories) {
    assert.deepEqual(Object.keys(category).sort(), ['id','tip','title','vocabulary']);
    for(const mode of ['ordering','completion'] as const) {
      const questions = sentenceQuestions(category.id,mode);
      assert.equal(questions.length,6);
      for(const q of questions) {
        if(mode==='ordering') assert.deepEqual(q.tokens!.toSorted(), q.answer.split(/\s+/).sort());
        assert.ok(q.answer && q.explanation);
      }
    }
  }
});

test('V2 progress and active quizzes survive V3 import unchanged, with safe old resume routes', () => {
  const old = emptyState(); old.done[60] = true; old.notes[60] = 'My personal notes';
  old.lastRoute = '#/plan/60'; old.preferences = {direction:'es-en',week:8};
  old.cards[cardKey(words[3], 'es-en')] = schedule(undefined,'known');
  old.assessments[2] = {...emptyAssessment(), writing:'Legacy writing', notes:'Legacy notes'};
  old.quiz = newQuiz('completion', 1, 1, [{id:'old', prompt:'A saved legacy question', answer:'answer', explanation:'Saved locally'}]);
  old.quiz.responses[0]='answer';
  const restored = importBackup(exportBackup(old),words);
  assert.deepEqual(restored,old);
  assert.equal(publicResume(restored.lastRoute),'#/progress');
  assert.equal(publicResume('#/ai/60'),'#/ai');
  assert.equal(publicResume('#/challenge/4?week=1&mode=completion'),'#/challenge/4?week=1&mode=completion');
  restored.preferences.difficulty='gentle'; assert.deepEqual(validateState(restored),restored);
  assert.throws(()=>validateState({...restored,preferences:{...restored.preferences,difficulty:'impossible'}}));
});

test('category comparisons require sufficient actual directional reviews', () => {
  const state=emptyState();
  const pool=words.filter(w=>w.weeks.includes(1)).slice(0,5);
  assert.equal(categoryProgress(words,state,'en-es')[0].accuracy,null);
  pool.forEach((w,i)=>state.cards[cardKey(w,'en-es')]=schedule(undefined,i===0?'difficult':'known'));
  const first=categoryProgress(words,state,'en-es')[0];
  assert.equal(first.known,4);assert.equal(first.difficult,1);assert.equal(first.accuracy,0.8);
  assert.equal(categoryProgress(words,state,'es-en')[0].reviewed,0);
});

test('configuration rejects premature ad activation and unsafe checkout URLs', () => {
  assert.equal(siteConfig.ads.enabled,false);
  assert.equal(siteConfig.checkoutUrl,'');
  assert.throws(()=>validateConfig({...siteConfig,checkoutUrl:'javascript:alert(1)'}));
  assert.throws(()=>validateConfig({...siteConfig,siteUrl:'https://example.com/path'}));
  assert.throws(()=>validateConfig({...siteConfig,ads:{...siteConfig.ads,enabled:true}}));
  assert.throws(()=>validateConfig({...siteConfig,ads:{...siteConfig.ads,verificationEnabled:true}}));
  assert.throws(()=>validateConfig({...siteConfig,ads:{...siteConfig.ads,cmpScriptUrl:'https://untrusted.example/cmp'}}));
  assert.throws(()=>validateConfig({...siteConfig,checkoutConfirmed:true}));
});

test('ad consent needs Google permission, expected CMP and all required NPA purposes', () => {
  const valid: ConsentData = {cmpId:123,cmpStatus:'loaded',eventStatus:'useractioncomplete',tcString:'synthetic-test-signal',purpose:{consents:{1:true,2:true,7:true,9:true,10:true}},vendor:{consents:{755:true}}};
  assert.equal(consentAllowsAds(valid,123),true);
  assert.equal(consentAllowsAds({},123),false);
  assert.equal(consentAllowsAds({...valid,cmpId:456},123),false);
  assert.equal(consentAllowsAds({...valid,tcString:''},123),false);
  assert.equal(consentAllowsAds({...valid,eventStatus:'cmpuishown'},123),false);
  for(const p of [1,2,7,9,10]) {
    const denied=structuredClone(valid);denied.purpose!.consents![p]=false;
    assert.equal(consentAllowsAds(denied,123),false);
  }
  assert.equal(consentAllowsAds({...valid,vendor:{consents:{755:false}}},123),false);
  assert.equal(consentAllowsAds({...valid,gdprApplies:false,purpose:{}},123),false);
  assert.equal(consentAllowsAds({...valid,publisher:{restrictions:{2:{755:0}}}},123),false);
  const li=structuredClone(valid); li.purpose!.consents![2]=false; li.purpose!.legitimateInterests={2:true};li.vendor!.legitimateInterests={755:true};
  assert.equal(consentAllowsAds(li,123),true);
  assert.equal(consentAllowsAds({...li,publisher:{restrictions:{2:{755:1}}}},123),false);
});

test('archived commercial pages never manufacture a checkout; configured checkout is escaped and gated', () => {
  const pending=publicPages(siteConfig).find(p=>p.path==='/premium/')!.body;
  assert.ok(pending.includes('Compra todavía no habilitada'));
  assert.ok(!pending.includes('Ir al pago seguro'));
  const ready={...siteConfig,checkoutConfirmed:true,checkoutUrl:'https://checkout.example/order?a=1&b=2',businessName:'English Test',contactEmail:'operator@example.com',legalReviewed:true};
  const page=publicPages(ready).find(p=>p.path==='/premium/')!.body;
  assert.ok(page.includes('https://checkout.example/order?a=1&amp;b=2'));
  assert.ok(page.includes('49.990'));
});

test('Premium information never enables a checkout from archived settings', () => {
  const pages=freePages({...siteConfig,checkoutConfirmed:true,checkoutUrl:'https://checkout.example/order',businessName:'English Test',contactEmail:'operator@example.com',legalReviewed:true});
  assert.equal(pages.some(p=>p.path==='/premium/'),true);
  assert.match(pages.find(p=>p.path==='/premium/')!.body,/Consultar por el programa/);
  assert.doesNotMatch(JSON.stringify(pages), /49[.,]990|checkout\.example/);
});

test('public build fails on PDFs, full source, maps and private prose even in renamed assets', async () => {
  await mkdir('tmp',{recursive:true});
  const dir=await mkdtemp(resolve('tmp/public-boundary-'));
  try {
    await cp('dist',dir,{recursive:true});
    await auditPublicBuild(dir);
    const original=JSON.parse(await readFile('private/source/English_90_V2_Programa.json','utf8'));
    const cases=[['assets/leak.js',JSON.stringify(original.weeks[0])],['accidental.pdf','%PDF-1.7 private'],['assets/leak.js','%PDF-1.7 private'],['assets/leak.js',JSON.stringify(original)],['assets/leak.js',original.days.find(d=>d.practice_prompt?.length>70).practice_prompt],['assets/leak.js','//# sourceMappingURL=main.js.map'],['assets/private.json','{}'],['assets/leak.js','English 90 Premium 49.990'],['assets/leak.js','https://checkout.example/order']];
    for(const [name,body] of cases){
      const file=resolve(dir,name);await writeFile(file,body);
      await assert.rejects(()=>auditPublicBuild(dir), /Public|Private|Premium|Unapproved|Archived commercial/);
      await rm(file);
    }
    const approved=await auditPublicBuild(dir);
    let compressed=0;
    for(const path of approved.filter(p=>/\.(js|css)$/.test(p))) compressed+=gzipSync(await readFile(resolve(dir,path))).length;
    // V1 adds local audio, guided writing and the day-to-practice index; no runtime dependency.
    assert.ok(compressed<60000,`Script/style transfer budget exceeded: ${compressed}`);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
