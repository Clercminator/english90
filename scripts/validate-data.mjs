import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const data = JSON.parse(await readFile('Entrenador/public-content.json', 'utf8'));
const text = v => assert.ok(typeof v === 'string' && v.trim().length > 0);
assert.equal(data.schemaVersion, 1); assert.equal(data.audience, 'free-public');
assert.deepEqual(Object.keys(data).sort(), ['audience','categories','schemaVersion','sentences','tests']);
assert.equal(data.categories.length, 12); assert.equal(data.sentences.length, 72); assert.equal(data.tests.length, 4);
for (const [i,c] of data.categories.entries()) {
 assert.equal(data.sentences.filter(s => s.category === c.id).length, 6);
 assert.equal(c.id,i+1); text(c.title); text(c.tip); assert.ok(c.vocabulary.length > 0);
 assert.deepEqual(Object.keys(c).sort(), ['id','tip','title','vocabulary']);
 c.vocabulary.forEach(v => { text(v.en); text(v.es); assert.deepEqual(Object.keys(v).sort(), ['en','es']); });
}
assert.equal(new Set(data.sentences.map(s => s.id)).size,72);
assert.equal(new Set(data.sentences.map(s => s.en.toLowerCase().replace(/[.,!?]/g, '').trim())).size,72, 'Duplicate sentence practice');
for (const s of data.sentences) {
 assert.deepEqual(Object.keys(s).sort(), ['answer','category','en','es','explanation','id','prompt']);
 ['id','en','es','prompt','answer','explanation'].forEach(k => text(s[k]));
 assert.ok(data.categories.some(c => c.id === s.category)); assert.equal((s.prompt.match(/___/g)||[]).length,1);
}
assert.deepEqual(data.tests.map(t => t.category), [1,4,8,12]);
for (const t of data.tests) {
 assert.deepEqual(Object.keys(t).sort(), ['category','items','title']); text(t.title); assert.equal(t.items.length,4);
 t.items.forEach(q => { assert.deepEqual(Object.keys(q).filter(k => k !== 'acceptedAnswers').sort(), ['answer','explanation','prompt']); text(q.prompt); text(q.answer); text(q.explanation); if(q.acceptedAnswers) { assert.ok(Array.isArray(q.acceptedAnswers)); q.acceptedAnswers.forEach(text); } });
}
const words = data.categories.flatMap(c => c.vocabulary);
assert.equal(new Set(words.map(w => w.en.toLowerCase())).size,782);
assert.equal(new Set(words.map(w => `${w.en.toLowerCase()}|${w.es.toLowerCase()}`)).size,791);
console.log('Public dataset validated: 782 expressions / 791 pairs, 12 categories, 72 sentence practices, 4 tests. No private curriculum fields.');
const extra = JSON.parse(await readFile('Entrenador/extension-content.json', 'utf8'));
assert.deepEqual(Object.keys(extra).sort(), ['readings','sentences']);
assert.equal(extra.sentences.length,24); assert.equal(extra.readings.length,12);
assert.equal(new Set([...data.sentences,...extra.sentences].map(s=>s.en.toLowerCase())).size,96);
for (const c of data.categories) {
  assert.equal(extra.sentences.filter(s=>s.category===c.id).length,2);
  assert.equal(extra.readings.filter(r=>r.category===c.id).length,1);
}
for (const s of extra.sentences) {
  assert.deepEqual(Object.keys(s).sort(), ['answer','category','en','es','explanation','id','prompt']);
  ['id','en','es','prompt','answer','explanation'].forEach(k=>text(s[k]));
  assert.equal((s.prompt.match(/___/g)||[]).length,1);
}
for (const r of extra.readings) {
  assert.deepEqual(Object.keys(r).sort(), ['category','extension','id','intro','questions','text','title','writing']);
  ['id','intro','text','extension','title','writing'].forEach(k=>text(r[k]));
  assert.ok(r.intro.length < r.text.length);
  assert.deepEqual(Object.keys(r.questions).sort(), ['challenge','gentle','standard']);
  for(const questions of Object.values(r.questions)) {
    assert.equal(questions.length,2);
    for(const q of questions) {
      ['prompt','answer','explanation'].forEach(k=>text(q[k]));
      assert.equal(q.options.length,3); assert.ok(q.options.includes(q.answer));
      assert.equal(new Set(q.options.map(o=>o.toLowerCase())).size,3);
    }
  }
}
console.log('Extension validated: 24 original sentence exercises, 12 graded reading sets / 72 comprehension questions.');
const specialized = JSON.parse(await readFile('Entrenador/specialization-content.json', 'utf8'));
assert.deepEqual(Object.keys(specialized).sort(), ['audience', 'missions', 'routes', 'schemaVersion']);
assert.equal(specialized.schemaVersion, 1); assert.equal(specialized.audience, 'free-public');
assert.deepEqual(specialized.routes.map(r => r.id), ['work', 'study', 'travel']);
assert.equal(specialized.missions.length, 36);
assert.equal(new Set(specialized.missions.map(m => m.id)).size, 36);
const approved = JSON.parse(await readFile('private/editorial/content/specializations/manifest.json', 'utf8'));
for (const route of specialized.routes) {
  assert.deepEqual(specialized.missions.filter(m => m.route === route.id).map(m => m.week), Array.from({length: 12}, (_, i) => i + 1));
}
for (const m of specialized.missions) {
  assert.deepEqual(Object.keys(m).sort(), ['code','core','futureSupport','id','prerequisites','route','title','week']);
  assert.equal(m.id, `${m.route}-${String(m.week).padStart(2, '0')}`);
  assert.equal(m.core.length, 4);
  assert.deepEqual(m.core, approved.missions.find(a => a.id === m.id).core);
  assert.equal(new Set(m.core.map(p => p.en.toLowerCase())).size, 4);
  assert.ok(m.prerequisites.includes(m.week));
  for (const w of m.prerequisites) assert.ok(Number.isInteger(w) && w >= 1 && w <= m.week);
  for (const w of m.futureSupport) assert.ok(Number.isInteger(w) && w > m.week && w <= 12);
  for (const pair of m.core) { assert.deepEqual(Object.keys(pair).sort(), ['en','es']); text(pair.en); text(pair.es); }
}
console.log('Specializations validated: 36 missions / 144 approved CORE pairs, public metadata only.');
const practice = JSON.parse(await readFile('Entrenador/specialization-practice.json', 'utf8'));
assert.equal(practice.audience, 'free-public'); assert.equal(practice.schemaVersion, 1);
assert.equal(practice.missions.length, 36); assert.equal(new Set(practice.missions.map(m=>m.id)).size,36);
assert.equal(practice.missions.reduce((n,m)=>n+m.examples.length,0),8);
assert.equal(practice.selfReview.questions.length,3); assert.equal(practice.selfReview.options.length,3);
for(const m of practice.missions) {
  assert.ok(specialized.missions.some(p=>p.id===m.id));
  assert.deepEqual(Object.keys(m).filter(k=>k!=='foodClarification').sort(), ['challenge','context','examples','id','notes','produce']);
  for(const k of ['context','produce','challenge']) text(m[k]);
  for(const n of m.notes) text(n);
  for(const p of m.examples) {text(p.pattern);text(p.en);text(p.es);assert.ok(specialized.missions.find(p=>p.id===m.id).core.some(c=>c.en===p.pattern));}
}
assert.ok(practice.missions.find(m=>m.id==='travel-04').foodClarification.includes('cross-contact'));
assert.ok(specialized.missions.find(m=>m.id==='study-06').core.some(p=>p.en==='How do I get to the student services office?'));
console.log('Approved public practice validated: 36 contexts / productions / challenges, 8 complete examples, common self-review and T04 safety.');

const overview = JSON.parse(await readFile('Entrenador/specialization-overview.json', 'utf8'));
assert.deepEqual(overview, specialized.routes.map(r => ({id:r.id,title:r.title,firstTitle:specialized.missions.find(m=>m.route===r.id).title,missions:specialized.missions.filter(m=>m.route===r.id).map(m=>m.id)})));
