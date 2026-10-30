import extra from './extension-content.json' with { type: 'json' };
import base from './public-content.json' with { type: 'json' };
import { shuffle, normalize } from './core.ts';
import { challengeSentences } from './free.ts';
import type { Difficulty, Question } from './core.ts';
export const extensionContent = extra;
export const difficultyLabels: Record<Difficulty, string> = { gentle: 'Paso a paso', standard: 'Consolidación', challenge: 'Desafío' };
export const difficultyDescriptions: Record<Difficulty, string> = {
  gentle: 'Reconocer, usar pistas y practicar textos breves.',
  standard: 'Recordar sin opciones, construir frases y conectar información.',
  challenge: 'Reformular, inferir, argumentar y trabajar con estructuras más complejas.',
};
export function readingQuestions(category: number, difficulty: Difficulty): Question[] {
  const reading = extra.readings.find(r => r.category === category)!;
  const context = difficulty === 'gentle' ? reading.intro : difficulty === 'standard' ? reading.text : `${reading.text}\n\n${reading.extension}`;
  return reading.questions[difficulty].map((q,i) => ({ ...q, id: `${reading.id}-${difficulty}-${i}`, context, options: shuffle(q.options) }));
}
export function practiceTest(category: number, difficulty: Difficulty, round = 0): Question[] {
  if (difficulty === 'challenge') return [
    ...extra.sentences.filter(s => s.category === category).map(s => ({ id:s.id, prompt:round % 2 ? s.es : s.prompt, answer:round % 2 ? s.en : s.answer, explanation:s.explanation })),
    ...readingQuestions(category, difficulty),
  ];
  const original = base.tests.find(t => t.category === category);
  if (difficulty === 'standard' && original) return original.items.map((q,i) => ({ ...q, id:`test-${category}-${i}` }));
  const pool = base.sentences.filter(s => s.category === category && !challengeSentences.has(s.id));
  return Array.from({length:4}, (_, i) => pool[(i + round * 2) % pool.length]).map(s => {
    const choices = [s.answer, ...new Map(pool.map(p => p.answer).filter(a => normalize(a) !== normalize(s.answer)).map(a => [normalize(a),a])).values()].slice(0,3);
    return { id:s.id, prompt:s.prompt, answer:s.answer, explanation:s.explanation, ...(difficulty === 'gentle' ? { options:shuffle(choices) } : {}) };
  });
}
export function speakingTask(category: number, difficulty: Difficulty): string {
  if (difficulty === 'gentle') return 'Escucha y repite el modelo. Cambia un nombre o un detalle y di una frase propia.';
  if (difficulty === 'standard') return 'Responde con tres o cuatro frases propias. Añade una razón y haz una pregunta de seguimiento antes de comparar con el modelo.';
  return `${extra.readings.find(r => r.category === category)!.writing} Habla durante dos minutos, considera una objeción y reformula una idea de otra manera. Revisa después si tu mensaje fue claro; esta práctica no tiene nota automática.`;
}
