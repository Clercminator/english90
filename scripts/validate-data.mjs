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
