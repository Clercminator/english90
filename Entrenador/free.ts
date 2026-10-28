import source from './public-content.json' with { type: 'json' };
import { normalize, shuffle } from './core.ts';
import type { Direction, Mode, Question, State, Vocabulary } from './core.ts';

export const publicContent = source;
export const categories = source.categories;
export const publicVocabulary = { weeks: categories.map(c => ({ week: c.id, vocabulary: c.vocabulary })) };
export function sentenceQuestions(category: number, mode: Mode): Question[] {
  return source.sentences.filter(s => s.category === category).map(s => mode === 'ordering'
    ? { id: s.id, prompt: s.es, answer: s.en, explanation: `Frase de práctica: ${s.en}`, tokens: shuffle(s.en.split(/\s+/)) }
    : { id: s.id, prompt: s.prompt, answer: s.answer, explanation: s.explanation });
}
export function categoryProgress(words: Vocabulary[], state: State, direction: Direction) {
  return categories.map(category => {
    const pool = words.filter(w => w.weeks.includes(category.id));
    const cards = pool.map(w => state.cards[`${direction}:${w.id}`]).filter(Boolean);
    const known = cards.filter(c => c.rating === 'known').length;
    return { id: category.id, title: category.title, total: pool.length, reviewed: cards.length, known,
      difficult: cards.filter(c => c.rating !== 'known').length, accuracy: cards.length >= 5 ? known / cards.length : null };
  });
}
export function publicResume(hash: string): string {
  if (hash.startsWith('#/plan')) return '#/progress';
  if (hash.startsWith('#/ai')) return '#/ai';
  return hash;
}
export const uniqueTerms = new Set(categories.flatMap(c => c.vocabulary.map(v => normalize(v.en)))).size;


export const outcomes: Record<number, string> = {
  1: 'Presentarte en inglés', 2: 'Hablar de tu rutina', 3: 'Compartir tus aficiones',
  4: 'Pedir comida y hacer compras', 5: 'Contar lo que hiciste', 6: 'Moverte por una ciudad',
  7: 'Hablar de tus planes', 8: 'Hacer preguntas y pedir ayuda', 9: 'Conversar sobre el trabajo',
  10: 'Contar experiencias y logros', 11: 'Expresar una opinión', 12: 'Mantener una conversación',
};
export function conversationPrompt(categoryId: number, expressions: {en: string; es: string}[] = []): string {
  const category = categories.find(c => c.id === categoryId) || categories[0];
  const vocabulary = (expressions.length ? expressions : category.vocabulary).slice(0, 6);
  return `Simula una conversación realista en inglés sobre ${category.title.toLowerCase()}. Mi objetivo de práctica es: ${outcomes[category.id]}. Soy principiante y hablo español. Usa frases cortas y vocabulario sencillo, incluyendo cuando encaje estas expresiones: ${vocabulary.map(v => `${v.en} (${v.es})`).join('; ')}. Asume el papel de la otra persona y empieza con una sola pregunta. Espera mi respuesta antes de continuar. Anímame a responder en inglés; si me bloqueo, ofrece una pista breve. Después de cada respuesta, corrige como máximo un error con una explicación corta en español y continúa la conversación. Tras cinco intercambios, resume dos expresiones útiles para repasar. Si no puedes escuchar mi voz, no evalúes mi pronunciación. No presentes esta práctica como una certificación de nivel.`;
}
