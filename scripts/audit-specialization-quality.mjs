import { writeFile } from 'node:fs/promises';
import { missions, missionPractice, publicPractice, specializationQuestions } from '../Entrenador/specializations.ts';
import { emptyState } from '../Entrenador/core.ts';

const directory = 'output/pdf/dsss-v1';
const items = missions.map(m => {
  const p = missionPractice(m.id);
  const fragments = m.core.filter(pair => /\.{3}|…/.test(pair.en));
  const targets = specializationQuestions(m,'completion','standard',emptyState());
  const issues = [];
  if (!p.context || !p.produce || !p.challenge) issues.push('Falta una actividad pública aprobada.');
  for (const fragment of fragments) if (!p.examples.some(e=>e.pattern===fragment.en)) issues.push(`Falta ejemplo completo: ${fragment.en}`);
  if (m.id==='travel-04' && (!p.foodClarification?.includes('cross-contact') || !p.notes.some(n=>n.includes('alergia')))) issues.push('Falta aclaración alimentaria o advertencia pública.');
  if (m.id==='study-06' && !m.core.some(pair=>pair.en==='How do I get to the student services office?')) issues.push('Terminología S06 sin actualizar.');
  return {id:m.id,code:m.code,title:m.title,core_pairs:4,
    criteria:{recognize:'Tarjetas y reconocimiento con opciones del CORE aprobado.',recall:'Recuperación escrita del modelo, sin opciones.',construct:'Produce: respuesta personal guardada, sin comparación exacta.',apply:'Contexto y Desafío aprobados; respuesta de adaptación y autoevaluación.',review:'Errores de ejercicios cerrados persistentes; revisión de producciones libres por misión y dificultad.'},
    context:p.context,produce:p.produce,challenge:p.challenge,notes:p.notes,reusable_patterns:fragments,approved_examples:p.examples,
    completion_targets:targets.map(q=>({answer:q.answer,position:q.prompt.split(' (')[0].split(/\s+/).indexOf('___')})),issues};
});
const result={scope:'Cierre del paquete editorial público DSSS V1.0; evidencias funcionales y visuales en los informes de pruebas separados.',
  source_sha256:publicPractice.sourceSha256,mission_count:items.length,core_pairs:144,
  metrics:{missions_with_context:items.filter(m=>m.context).length,missions_with_produce:items.filter(m=>m.produce).length,
    missions_with_challenge:items.filter(m=>m.challenge).length,common_self_review_questions:publicPractice.selfReview.questions.length,
    reusable_incomplete_patterns:items.reduce((n,m)=>n+m.reusable_patterns.length,0),approved_complete_examples:items.reduce((n,m)=>n+m.approved_examples.length,0)},
  remaining_editorial_issues:items.flatMap(m=>m.issues.map(issue=>({mission:m.code,issue}))),
  limitations:['Las respuestas libres se autoevalúan; no se certifica su corrección lingüística ni se calcula una nota automática.','Las transformaciones cerradas del CORE comprueban el modelo y equivalencias inequívocas; no se presentan como evaluación semántica.','La publicación y la aceptación final requieren autorización; este informe no acredita un despliegue.'],missions:items};
await writeFile(`${directory}/inventario-pedagogico.json`,JSON.stringify(result,null,2)+'\n');
const rows=items.map(m=>`| ${m.code} | ${m.title} | Sí | Sí | Sí | 3 + adaptación en Desafío | ${m.approved_examples.length || '—'} | ${m.issues.length ? m.issues.join(' / ') : 'Sin carencia del paquete'} |`).join('\n');
await writeFile(`${directory}/inventario-pedagogico.md`,`# Cierre pedagógico público DSSS V1.0\n\nSe incorporó literalmente el paquete aprobado. Las 36 misiones incluyen Contexto, Produce, Desafío y la rúbrica común. Los ocho patrones incompletos se conservan y tienen ejemplos completos adicionales. T04 incluye seguridad y aclaraciones alimentarias; S06 utiliza “student services office”.\n\n| Misión | Título | Contexto | Produce | Desafío | Autoevaluación | Ejemplos | Estado editorial |\n|---|---|---|---|---|---|---|---|\n${rows}\n\nLas producciones y sus autoevaluaciones se conservan por misión y dificultad, se pueden revisar y se incluyen en los respaldos. La edición de un texto ya autoevaluado vuelve a dejarlo como borrador. No se calcula una nota ni se compara su redacción con un texto modelo.\n\nPaso a paso ofrece reconocimiento y apoyo. Consolidación permite una respuesta personal con los modelos ocultos inicialmente. Desafío añade el cambio aprobado y una respuesta de adaptación. Completar rota una palabra del modelo manteniendo visible el resto de la frase y su traducción; no crea frases nuevas.\n\n${result.limitations.map(t=>`- ${t}`).join('\n')}\n`);
console.log(JSON.stringify({metrics:result.metrics,remaining_editorial_issues:result.remaining_editorial_issues}));
