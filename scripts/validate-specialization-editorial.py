"""Validate the approved closing revision against immutable curriculum and prose."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'private/editorial/content/specializations'
OUTPUT = ROOT / 'output/pdf/dsss-v1'


def validate():
    data = json.loads((SOURCE / 'manifest.json').read_text(encoding='utf-8'))
    md = (OUTPUT / 'English90_Premium_DSSS.md').read_text(encoding='utf-8')
    original = (SOURCE / 'approved-request.md').read_text(encoding='utf-8')
    revised = (SOURCE / 'editorial-request.md').read_text(encoding='utf-8')
    assert hashlib.sha256((SOURCE / 'editorial-request.md').read_bytes()).hexdigest() == data['editorial_sha256']
    baseline = (ROOT / 'private/editions/candidates/premium-final-20261110/English90_Premium_final.md').read_text(encoding='utf-8')
    restored = md
    for item in reversed(json.loads((OUTPUT / 'changes.json').read_text(encoding='utf-8'))):
        assert restored.count(item['after']) == item.get('count', 1)
        restored = restored.replace(item['after'], item['before'], item.get('count', 1))
    assert restored == baseline
    for mission in data['missions']:
        region = re.search(rf"^## {mission['code']} — .*?\n(.*?)(?=^## [WST]\d{{2}}|^# \d+\.|\Z)", original, re.M | re.S)[1]
        expected_core = [dict(zip(('en','es'), pair)) for pair in re.findall(r'^- (.+?) — (.+)$', region, re.M)]
        if mission['code'] == 'S06': expected_core[1] = {'en':'How do I get to the student services office?', 'es':'¿Cómo llego a la oficina de atención estudiantil?'}
        assert expected_core == mission['core']
        assert re.search(r'\*\*Diálogo\*\*\s*\n(.*?)\n\*\*Misión:', region, re.S)[1].strip() == mission['dialogue']
        assert mission['task'][0].isupper() and mission['change'][0].isupper()
        assert all(w <= mission['week'] for w in mission['prerequisites'])
        assert all(w > mission['week'] for w in mission['futureSupport'])
    assert md.count('Tapa las frases en inglés e intenta recordarlas a partir de su traducción. Después, crea dos frases nuevas siguiendo el mismo patrón.') == 36
    assert md.count('Pide aclaraciones, adapta tu respuesta o propón una solución cuando sea necesario.') == 36
    assert md.count('Autoevaluación:\n') == 36
    new_text = md[md.index('# Elige para qué quieres aprender inglés'):md.index('# START HERE /')]
    new_text += md[md.index('# Especializaciones\n'):md.index('# AFTER DAY 90 /')]
    for banned in ['No afirmar que', 'Ocultar las frases', 'Después formar', 'El estudiante', 'Evaluar:', 'Nota editorial:', '**Regla:**', 'Prerrequisito y apoyo:', 'La elección de CORE no debe presentarse']:
        assert banned not in new_text, banned
    assert 'Esta evaluación es orientativa. Utiliza la rúbrica para valorar tu desempeño.' in md
    assert 'Puedes realizar únicamente el proyecto de tu ruta principal.' in md
    report = json.loads((OUTPUT / 'validation.json').read_text(encoding='utf-8'))
    assert report['pdf_sha256'] == hashlib.sha256((OUTPUT / 'English90_Premium_DSSS_V1_candidata.pdf').read_bytes()).hexdigest()
    assert 'Pide comida y comunica una restricción alimentaria.' in md
    assert 'Explica un problema de alojamiento y pide una solución.' in md
    assert 'How do I get to the student office?' not in new_text
    public = json.loads((ROOT / 'Entrenador/specialization-practice.json').read_text(encoding='utf-8'))
    for m in public['missions']:
        for example in m['examples']: assert example['en'] in md and example['es'] in md
    assert 'Is there a risk of cross-contact?' in md
    assert md.count('**Orientación para practicar con un tutor o asistente:**') == 12
    assert 'Teacher note / Instrucción al tutor:' not in md
    assert 'Task is substantially completed' not in md
    assert 'Conversación:** 2 puntos — Comunica el objetivo' in md
    assert '**Introduce yourself / Preséntate**\n\n**Previously in English 90 / Ya estudiaste:' in md
    import pymupdf
    with pymupdf.open(OUTPUT / 'English90_Premium_DSSS_V1_candidata.pdf') as doc:
        pages = [p.get_text() for p in doc]
        assert sum('Orientación para practicar con un tutor o asistente:' in p for p in pages) == 12
        record = next(p for p in pages if 'How to record progress /' in p)
        assert 'English support phrases /' in record
        key = next(p for p in pages if 'ANSWER KEY / Solucionario — Semana 12' in p)
        assert 'Producción (no hay respuesta única)' in key and '110–145 palabras' in key
    result = {'status':'passed', 'v1_final_corrections':True, 'tutor_orientations':12, 'fundamental_markdown_restored_exactly':True,
              'original_core_pairs_unchanged':143,'authorized_s06_correction':1,'original_dialogues_unchanged':36,
              'approved_complete_examples':8,'t04_food_clarification_present':True,
              'student_directed_retrieval_instructions':36,'student_directed_adaptation_instructions':36,
              'self_assessment_headings':36,'editorial_metatext_absent_in_new_student_sections':True,
              'future_explanations_separate_from_prerequisites':True,'page_count':report['page_count']}
    (OUTPUT / 'editorial-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))


if __name__ == '__main__': validate()
