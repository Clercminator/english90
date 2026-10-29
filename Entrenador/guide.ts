import mapping from './guide-map.json' with { type: 'json' };
export const guideDays = mapping;
export const guideDay = (day: number) => mapping.find(d => d.day === day)!;

// Short free role practice reuses public expressions; no Premium dialogue is copied.
export const situations = [
  { category: 1, title: 'Tu primer día en un grupo', goal: 'Saluda, preséntate y conoce a otra persona.', steps: [
    { cue: 'Acabas de llegar. Saluda y di cómo te llamas; usa Alex para practicar.', sentence: 'practice-1-1' },
    { cue: 'Otra persona se acerca. Pregúntale si también es nueva aquí.', sentence: 'practice-1-2' },
  ] },
  { category: 4, title: 'Una pausa en el café', goal: 'Pide algo y después solicita la cuenta.', steps: [
    { cue: 'La persona que atiende espera tu pedido. Pide un café y agua.', sentence: 'practice-4-1' },
    { cue: 'Terminaste y quieres pagar. Pide la cuenta con cortesía.', sentence: 'practice-4-4' },
  ] },
  { category: 6, title: 'Llegar a tiempo', goal: 'Pregunta cómo llegar y explica qué boleto necesitas.', steps: [
    { cue: 'Estás en una oficina de información. Pregunta cómo llegar al aeropuerto.', sentence: 'practice-6-1' },
    { cue: 'Ahora estás en la estación. Explica que necesitas un boleto de tren para mañana.', sentence: 'practice-6-2' },
  ] },
];
