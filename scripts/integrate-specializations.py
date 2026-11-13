"""Deterministic import of the approved editorial specification; no generated lessons."""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / 'private/editorial/content/specializations'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def section(text, number):
    return re.search(rf'^# {number}\. .*?\n(.*?)(?=^# \d+\.|\Z)', text, re.M | re.S)[1].strip().removesuffix('---').strip()


def public_package(missions):
    source = PRIVATE / 'public-v1-approved.md'
    raw = source.read_text(encoding='utf-8')
    practice, examples = {}, {}
    for match in re.finditer(r'^### ([WST]\d{2}) — (.*?)\n(.*?)(?=^### |^# [A-Z]\.|\Z)', raw, re.M | re.S):
        code, title, body = match.groups()
        fields = {name: re.search(rf'^\*\*{name}:\*\* (.+)$', body, re.M)[1].strip() for name in ['Contexto', 'Produce', 'Desafío']}
        notes = re.findall(r'^\*\*(?:Nota|Seguridad):\*\* (.+)$', body, re.M)
        practice[code] = {'title': title, 'context': fields['Contexto'], 'produce': fields['Produce'], 'challenge': fields['Desafío'], 'notes': notes}
    example_section = raw.split('# D.', 1)[1].split('# E.', 1)[0]
    for match in re.finditer(r'^## ([WST]\d{2}) — .*?\n(.*?)(?=^## |\Z)', example_section, re.M | re.S):
        pairs = re.findall(r'\*\*Expresión:\*\* (.+)\n\n\*\*Ejemplo:\*\* (.+)\n\n\*\*Traducción:\*\* (.+)', match[2])
        examples[match[1]] = [dict(zip(('pattern','en','es'), item)) for item in pairs]
    assert len(practice) == 36 and sum(map(len, examples.values())) == 8
    assessment = raw.split('# G.', 1)[1].split('# H.', 1)[0]
    questions = re.findall(r'^\d\. (.+)$', assessment, re.M)
    options = re.findall(r'^- (.+)$', assessment, re.M)
    assert len(questions) == 3 and len(options) == 3
    food = raw.split('# F.', 1)[1].split('# G.', 1)[0]
    food = food[food.index('Es útil como pregunta general'):].replace('Agregar como explicación:\n\n','').strip().removesuffix('---').strip()
    terminology = raw.split('**Justificación editorial:**', 1)[1].split('\n\n', 2)[1].strip()
    academic_note = re.search(r'^\*\*Nota:\*\* (La encuesta mencionada.+)$', raw, re.M)[1]
    academic_rule = re.search(r'^(Los ejemplos académicos ficticios.+)$', raw, re.M)[1]
    result = {'schemaVersion': 1, 'audience': 'free-public', 'sourceSha256': digest(source),
              'missions': [], 'selfReview': {'title':'Comprueba tu respuesta', 'questions':questions, 'options':options,
              'adaptQuestion':re.search(r'^\*\*(¿Pude adaptar.+)\*\*$', assessment, re.M)[1]},
              'difficulty': {'gentle':'Reconocer expresiones, completar estructuras básicas y recuperar vocabulario con pistas.',
                             'standard':'Crear una respuesta original al apartado Produce, sin mostrar la frase completa antes del intento.',
                             'challenge':'Resolver la situación, responder a la condición nueva y justificar o aclarar la respuesta cuando corresponda.'}}
    for m in missions:
        item = practice[m['code']]
        assert item.pop('title') == m['title']
        item.update(id=m['id'], examples=examples.get(m['code'], []))
        if m['code'] == 'S06': item['notes'].append(terminology)
        if m['code'] == 'T04': item['foodClarification'] = food
        if m['code'] == 'S11': item['notes'].append(academic_note)
        if m['code'] == 'S12': item['notes'].append(academic_rule)
        result['missions'].append(item)
    (ROOT / 'Entrenador/specialization-practice.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return result


def integrate(source):
    PRIVATE.mkdir(parents=True, exist_ok=True)
    raw = source.read_text(encoding='utf-8')
    target = PRIVATE / 'approved-request.md'
    if target.exists():
        assert target.read_text(encoding='utf-8') == raw, 'Refusing to overwrite a different approved source'
    else:
        target.write_text(raw, encoding='utf-8')
    corrections = PRIVATE / 'editorial-corrections.json'
    if corrections.exists():
        changes = json.loads(corrections.read_text(encoding='utf-8'))
        assert changes['request_sha256'] == digest(PRIVATE / 'closing-request.md')
        for edit in changes['edits']:
            assert raw.count(edit['before']) == edit['count'], edit['before']
            raw = raw.replace(edit['before'], edit['after'])
        raw = re.sub(r'^(\*\*(?:Misión|Cambio):\*\* )([^\n])', lambda m: m[1] + m[2].upper(), raw, flags=re.M)
        raw = re.sub(r'^(\*\*Misión:\*\* )(\w+)', lambda m: m[1] + changes['mission_imperatives'].get(m[2], m[2]), raw, flags=re.M)
        (PRIVATE / 'editorial-request.md').write_text(raw, encoding='utf-8')
    routes = [('work', 'W', 'Trabajo', 7), ('study', 'S', 'Estudios', 8), ('travel', 'T', 'Viajes', 9)]
    missions = []
    for route, prefix, label, number in routes:
        for match in re.finditer(rf'^## ({prefix}(\d{{2}})) — (.*?)\n(.*?)(?=^## {prefix}\d{{2}}|\Z)', section(raw, number), re.M | re.S):
            code, week, title, body = match.groups()
            field = lambda name: re.search(rf'^\*\*{name}:\*\* (.+)$', body, re.M)[1].strip()
            core = [dict(zip(('en', 'es'), x)) for x in re.findall(r'^- (.+?) — (.+)$', body, re.M)]
            assert len(core) == 4, code
            dialog = re.search(r'\*\*Diálogo\*\*\s*\n(.*?)\n\*\*Misión:', body, re.S)[1].strip()
            week = int(week)
            # Early missions deliberately use some later structures. Provide translated
            # models and real prerequisite destinations rather than inventing explanations.
            prerequisites = {week}
            for pair in core:
                en = pair['en'].lower()
                if re.search(r'\b(i work|i help|i need|i have|does|do you|i start|i study|i want)\b', en): prerequisites.add(2)
                if 'could' in en or "i'd" in en: prerequisites.add(4)
                if 'could you help' in en or "can't" in en: prerequisites.add(8)
                if 'going to' in en or "i'll" in en: prerequisites.add(7)
                if 'have already' in en or "i've" in en or "hasn't" in en: prerequisites.add(10)
            missions.append({'id': f'{route}-{week:02}', 'route': route, 'code': code, 'week': week, 'title': title,
                             'objective': field('Objetivo'), 'core': core, 'dialogue': dialog,
                             'task': field('Misión'), 'change': field('Cambio'), 'evidence': field('Evidencia'),
                             'prerequisites': sorted(w for w in prerequisites if w <= week),
                             'futureSupport': sorted(w for w in prerequisites if w > week), 'approved_markdown': body.strip()})
    assert len(missions) == 36 and len({m['id'] for m in missions}) == 36
    for route, *_ in routes:
        assert [m['week'] for m in missions if m['route'] == route] == list(range(1, 13))
    package = public_package(missions)
    evaluations = section(raw, 11)
    assert len(re.findall(r'\*\*Evaluación [WST]\d{2}', evaluations)) == 9
    projects = section(raw, 12)
    assert len(re.findall(r'^## Proyecto ', projects, re.M)) == 3
    data = {'schemaVersion': 1, 'source_sha256': digest(target), 'missions': missions,
            'public_package_sha256': package['sourceSha256'],
            'sections': {str(i): section(raw, i) for i in [2, 3, 4, 5, 6, 10, 11, 12, 13]}}
    if corrections.exists():
        data.update(editorial_sha256=digest(PRIVATE / 'editorial-request.md'), corrections_sha256=digest(corrections))
    (PRIVATE / 'manifest.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    public = {'schemaVersion': 1, 'audience': 'free-public',
              'routes': [{'id': r, 'title': title} for r, _, title, _ in routes],
              'missions': [{k: m[k] for k in ['id', 'route', 'code', 'week', 'title', 'core', 'prerequisites', 'futureSupport']} for m in missions]}
    (ROOT / 'Entrenador/specialization-content.json').write_text(json.dumps(public, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    overview = [{'id': r['id'], 'title': r['title'], 'firstTitle': next(m['title'] for m in public['missions'] if m['route'] == r['id']), 'missions': [m['id'] for m in public['missions'] if m['route'] == r['id']]} for r in public['routes']]
    (ROOT / 'Entrenador/specialization-overview.json').write_text(json.dumps(overview, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Imported 36 missions, 144 bilingual CORE pairs, 9 assessments, 3 projects. Public projection contains no dialogues, tasks, changes or rubrics.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    integrate(parser.parse_args().source)
