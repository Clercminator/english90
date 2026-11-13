"""Extend the preserved 256-page edition using its existing renderer and style."""
import difflib
import json
from pathlib import Path
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'private/editorial/scripts'))
import premium_preproduction as final
import premium_renderer as premium
import pymupdf

SOURCE = ROOT / 'private/editorial/content/specializations'
BASE = final.CANDIDATE / 'English90_Premium_final.md'
OUTPUT = ROOT / 'output/pdf/dsss-v1'


def anchor(key, title, level=1):
    return f'<!-- anchor:{key}|{level}|{title} -->'


def link(key, title):
    return f'<!-- internal-link:{key}|{title} -->'


def assemble():
    data = json.loads((SOURCE / 'manifest.json').read_text(encoding='utf-8'))
    baseline = BASE.read_text(encoding='utf-8')
    expected, *_ = final.assemble()
    assert baseline == expected, 'Baseline differs from the existing final edition'
    assert data['source_sha256'] == premium.sha256_file(SOURCE / 'approved-request.md')
    assert data['editorial_sha256'] == premium.sha256_file(SOURCE / 'editorial-request.md')
    assert data['corrections_sha256'] == premium.sha256_file(SOURCE / 'editorial-corrections.json')
    public = json.loads((ROOT / 'Entrenador/specialization-practice.json').read_text(encoding='utf-8'))
    assert public['sourceSha256'] == data['public_package_sha256'] == premium.sha256_file(SOURCE / 'public-v1-approved.md')
    md = baseline
    sections = data['sections']
    ledger = []

    def change(before, after, reason, count=1):
        nonlocal md
        assert md.count(before) == count, (reason, md.count(before))
        md = md.replace(before, after, count)
        ledger.append({'reason': reason, 'before': before, 'after': after, 'count': count})

    # Final V1.0 corrections: translations and block separation only.
    corrections = [
        ('Task is substantially completed, understandable, and within an appropriate approximate length; minor errors tolerated.',
         'La tarea se cumple en lo esencial, el texto es comprensible y su extensión aproximada es adecuada; se admiten errores menores.'),
        ('Communicates goal with at most occasional help', 'Comunica el objetivo con ayuda ocasional como máximo'),
        ('Communicates some core content but needs repeated prompts', 'Comunica parte del contenido esencial, pero necesita indicaciones repetidas'),
        ('Cannot yet complete task or no observed response', 'Todavía no logra completar la tarea o no se observa una respuesta'),
        ('No validated official English proficiency score or pronunciation assessment without actual audio.',
         'No constituye una calificación oficial validada del dominio del inglés ni una evaluación de pronunciación sin audio real.'),
        ('Teacher note / Instrucción al tutor:', 'Orientación para practicar con un tutor o asistente:'),
    ]
    for before, after in corrections:
        change(before, after, 'V1.0 Spanish production criteria and tutor orientation', count=12 if before.startswith('Teacher note') else 1)
    for match in list(re.finditer(r'^(\*\*[^\n]+\*\*)\n(\*\*Previously in English 90 / Ya estudiaste:)', md, re.M)):
        change(match[0], match[1] + '\n\n' + match[2], 'V1.0 separate review headings')

    intro = '# Elige para qué quieres aprender inglés\n' + anchor('choose-route', 'Elige tu ruta') + '\n\n'
    intro += re.sub(r'^(?:## Título: .*|Ubicación: .*)\n?', '', sections['3'], flags=re.M).strip()
    intro += '\n\n' + link('specialization-index', 'Índice de especializaciones') + '\n\n<!-- pagebreak -->\n\n'
    intro += '# Convierte tu objetivo en habilidades concretas\n' + anchor('dsss-commitment', 'Tu compromiso DSSS') + '\n\n'
    intro += re.sub(r'^## Título: .*?\n', '', sections['4'])
    intro += '\n\n' + sections['5'].split('En la plataforma:')[0].replace('Implementar tanto en la guía como en la plataforma.', '').strip()
    intro += '\n\n' + sections['2'][sections['2'].index('## Etapas'):]
    intro += '\n\n<!-- pagebreak -->\n\n'
    change('# START HERE / Empieza aquí', intro + '# START HERE / Empieza aquí', 'Route orientation and actionable DSSS after initial diagnosis')
    # Fundamental lesson text remains byte-for-byte; only add cross-links before
    # the first lesson of each week, at the end of its existing introduction.
    for week in range(1, 13):
        day = (week - 1) * 7 + 1
        marker = re.search(rf'^<!-- anchor:day-{day:02}\|.*?-->$', md, re.M)[0]
        day_label = re.search(rf'^SEMANA {week:02} / DÍA {day:02} DE 90$', md, re.M)
        assert day_label, (week, day)
        insertion = day_label.start()
        assert insertion > md.index(f'<!-- anchor:week-{week:02}|')
        before = md[insertion:md.index(marker) + len(marker)]
        refs = '## Profundiza según tu objetivo\n\n'
        refs += '\n\n'.join(link(f'{r}-{week:02}', f'{label}: misión {code}{week:02}') for r, label, code in [('work','Trabajo','W'),('study','Estudios','S'),('travel','Viajes','T')])
        change(before, refs + '\n\n' + before, f'Week {week:02} specialization links')

    addon = '# Especializaciones\n' + anchor('specialization-index', 'Índice de especializaciones') + '\n\n'
    for route, title in [('work', 'Trabajo'), ('study', 'Estudios'), ('travel', 'Viajes')]:
        addon += link(f'route-{route}', title) + '\n\n'
    addon += link('specialized-assessments', 'Evaluaciones especializadas') + '\n\n'
    addon += link('specialized-projects', 'Proyectos finales especializados') + '\n\n'
    addon += link('contents', 'Índice principal') + '\n\n<!-- pagebreak -->\n\n'
    template = sections['6']
    prompt = sections['10'].split('**Texto:**', 1)[1].strip()
    for route, title in [('work', 'Trabajo'), ('study', 'Estudios'), ('travel', 'Viajes')]:
        route_missions = [m for m in data['missions'] if m['route'] == route]
        addon += f'# Especialización: {title}\n' + anchor(f'route-{route}', title) + '\n\n'
        for m in route_missions:
            addon += link(m['id'], f"{m['code']} — {m['title']}") + '\n\n'
        addon += link('contents', 'Índice principal') + '\n\n<!-- pagebreak -->\n\n'
        for m in route_missions:
            addon += f"# {m['code']} — {m['title']}\n" + anchor(m['id'], f"{m['code']} — {m['title']}", 2) + '\n\n'
            addon += f"**Semana fundamental:** {m['week']}\n\n"
            addon += '\n\n'.join(link(f'week-{w:02}', f'Base de esta misión: Semana {w:02}' if w == m['week'] else f'Repaso previo: Semana {w:02}') for w in m['prerequisites']) + '\n\n'
            addon += '\n\n'.join(link(f'week-{w:02}', f'Explicación posterior: Semana {w:02} · apoyo opcional, no requisito previo') for w in m['futureSupport']) + '\n\n'
            # Fill the approved A–G template with supplied content, rather than
            # printing implementation instructions or repeating the same material.
            addon += '## A. Aprende\n\n**Objetivo:** ' + m['objective'] + '\n\n**CORE — Imprescindible**\n\n'
            addon += '\n'.join(f"- {p['en']} — {p['es']}" for p in m['core']) + '\n\n'
            practice = next(p for p in public['missions'] if p['id'] == m['id'])
            if practice['examples']:
                addon += '### Ejemplos completos\n\nEstas frases son ejemplos adicionales aprobados. No sustituyen las expresiones CORE existentes.\n\n'
                for example in practice['examples']:
                    addon += f"**{example['pattern']}**\n\n{example['en']}\n\n{example['es']}\n\n"
                addon += '\n\n'.join(practice['notes']) + '\n\n'
            if m['code'] == 'T04':
                addon += '### Aclaración alimentaria\n\n' + practice['foodClarification'] + '\n\n' + '\n\n'.join(practice['notes']) + '\n\n'
            if m['code'] == 'S06': addon += '\n\n'.join(practice['notes']) + '\n\n'
            if m['week'] > 1:
                previous = next(p for p in route_missions if p['week'] == m['week'] - 1)
                addon += '**REVIEW — Repaso**\n\n' + link(previous['id'], f"{previous['code']} — {previous['title']}") + '\n\n'
            addon += '## B. Comprende\n\n' + '\n\n'.join(line.strip() for line in m['dialogue'].splitlines() if line.strip()) + '\n\n'
            questions = template.split('El estudiante responde:',1)[1].split('## C.',1)[0].strip()
            addon += questions + '\n\n## C. Recupera\n\n' + template.split('## C. Recupera',1)[1].split('## D.',1)[0].strip() + '\n\n'
            addon += '## D. Resuelve\n\n' + m['task'] + '\n\n## E. Adáptate\n\n**EXPLORE — Profundización**\n\n' + m['change'] + '\n\n'
            addon += template.split('## E. Adáptate', 1)[1].split('## F.', 1)[0].strip().split('\n\n', 1)[1] + '\n\n'
            addon += '## F. Comprueba\n\n**Evidencia:** ' + m['evidence'] + '\n\n'
            addon += template.split('## F. Comprueba',1)[1].split('## G.',1)[0].strip() + '\n\n'
            # Preserve safety notes, rules and route-specific caveats verbatim.
            tail = m['approved_markdown'].split('**Evidencia:**',1)[1].split('\n',1)
            if len(tail) > 1: addon += tail[1].strip() + '\n\n'
            personalized = prompt
            for variable, value in {'RUTA': title, 'CÓDIGO Y TÍTULO': f"{m['code']} — {m['title']}", 'OBJETIVO': m['objective'], 'CORE': ' / '.join(p['en'] for p in m['core']), 'CAMBIO': m['change']}.items():
                personalized = personalized.replace(f'[{variable}].', value if value.endswith(('.', '?', '!')) else value + '.')
                personalized = personalized.replace(f'[{variable}]', value)
            addon += '## G. Conversa\n\n' + personalized + '\n\n'
            addon += link(f'route-{route}', f'Índice de {title}') + '\n\n' + link('contents', 'Índice principal') + '\n\n'
            addon += '**Práctica pública:**\n\n' + f"https://english90.imrtech.xyz/#/routes?mission={m['id']}" + '\n\n<!-- pagebreak -->\n\n'
    addon += '# Evaluaciones especializadas\n' + anchor('specialized-assessments', 'Evaluaciones especializadas') + '\n\n' + sections['11']
    addon += '\n\n' + link('specialization-index', 'Índice de especializaciones') + '\n\n<!-- pagebreak -->\n\n'
    addon += '# Proyectos finales especializados\n' + anchor('specialized-projects', 'Proyectos finales especializados') + '\n\n' + sections['12']
    addon += '\n\n' + link('specialization-index', 'Índice de especializaciones') + '\n\n<!-- pagebreak -->\n\n'
    change('# AFTER DAY 90 /', addon + '# AFTER DAY 90 /', '36 complementary missions, 9 formative assessments and 3 projects')
    start = md.index('<!-- anchor:contents|')
    end = md.index('<!-- pagebreak -->', start)
    old_toc = md[start:end]
    extra_toc = '\n\n<!-- toc-section:TUS OBJETIVOS Y ESPECIALIZACIONES -->\n\n'
    for a, b in [('choose-route|Elige tu ruta', 'dsss-commitment|Tu compromiso DSSS'), ('route-work|Trabajo', 'route-study|Estudios'), ('route-travel|Viajes', 'specialized-assessments|Evaluaciones especializadas'), ('specialized-projects|Proyectos especializados', 'specialization-index|Índices por objetivo')]:
        extra_toc += f'<!-- toc-row:{a}|{b} -->\n\n'
    change(old_toc, old_toc.rstrip() + extra_toc, 'Preserve fundamental printed contents and add automatic specialization destinations')
    restored = md
    for item in reversed(ledger): restored = restored.replace(item['after'], item['before'], item.get('count', 1))
    assert restored == baseline, 'Original content was modified'
    assert len(re.findall(r'<!-- anchor:day-\d+\|', md)) == 90
    assert md.count('### D · Tu desafío en contexto') == 72
    assert len(re.findall(r'<!-- anchor:(?:work|study|travel)-\d{2}\|', md)) == 36
    return md, baseline, ledger, data


class Renderer(final.FinalRenderer):
    def _keep_with_next(self, blocks, start):
        text = blocks[start].get('text', '')
        # These related units fit on one page. Move the whole unit rather than
        # leaving a short final block alone before an explicit chapter break.
        if text in ('English support phrases / Frases para seguir conversando',
                    'ANSWER KEY / Solucionario — Semana 12'):
            end = start + 1
            while end < len(blocks) and blocks[end]['type'] != 'pagebreak':
                end += 1
            height = sum(self._estimate_block_height(b) for b in blocks[start:end])
            if height <= self.content_bottom - 82:
                self._ensure_space(height)
            return end
        if blocks[start].get('type') == 'heading' and blocks[start].get('text') == 'G. Conversa':
            heading = self.style['headings']['2']
            height = heading['before'] + heading['size'] * self.line_spacing + heading['after']
            end = start + 1
            navigation = False
            while end < len(blocks) and blocks[end]['type'] != 'pagebreak':
                block = blocks[end]; text = block.get('text', '')
                if block['type'] == 'paragraph':
                    if text.startswith('Actúa como '):
                        height += premium.native.NativeLessonRenderer._estimate_block_height(self, {'type':'quote','text':text})
                    else:
                        size = 9 if text.startswith('https://') else self.body_size
                        lines = len(self._wrap_runs(premium.native._inline_runs(text), self.right-self.left, size))
                        height += lines * size * self.line_spacing + (0 if text.startswith('https://') else 2)
                elif block['type'] == 'internal_link' and not navigation:
                    height += self.body_size * self.line_spacing + 4
                    navigation = True
                end += 1
            # Keep a copyable conversation prompt together when it fits a page.
            if height + 4 <= self.content_bottom - 65: self._ensure_space(height + 4)
            return end
        return super()._keep_with_next(blocks, start)

    def _draw_block(self, block):
        text = block.get('text', '')
        if block['type'] == 'heading': self.in_conversation = text == 'G. Conversa'
        if block['type'] == 'pagebreak': self.in_conversation = False
        if block['type'] == 'paragraph' and text == '**Práctica pública:**':
            # Paragraphs do not invoke NativeLessonRenderer._keep_with_next.
            # Reserve the label and link here, before either is drawn.
            self._ensure_space(self.body_size * self.line_spacing + 2 + 9 * self.line_spacing + 4)
            self._draw_rich_paragraph(text, after=2)
            return
        if block['type'] == 'internal_link' and getattr(self, 'in_conversation', False):
            if block['id'].startswith('route-'):
                self.mission_navigation_row = (self.y, block['label'])
                return super()._draw_block(block)
            if block['id'] == 'contents' and getattr(self, 'mission_navigation_row', None):
                top, previous_label = self.mission_navigation_row
                previous_bottom = self.y
                indent = self.fonts['body'].text_length(previous_label, fontsize=self.body_size) + 20
                self.y = top
                self._draw_rich_paragraph(block['label'], indent=indent, color=self.colors['teal'], after=4, justify=False)
                self._queue_link(block['id'], block['label'], pymupdf.Rect(self.left+indent,top-2,self.right,self.y))
                self.y = max(self.y, previous_bottom)
                self.mission_navigation_row = None
                return
        if block['type'] == 'paragraph' and text.startswith('https://english90.imrtech.xyz/#/routes?mission='):
            top, page_number = self.y, self.page_number
            self._draw_rich_paragraph(text, fontsize=9, after=0, justify=False)
            self.external_links.append((page_number, pymupdf.Rect(self.left, top-2, self.right, self.y), text))
            return
        if block['type'] == 'paragraph' and getattr(self, 'in_conversation', False) and not text.startswith('Actúa como '):
            # Compact the consecutive prompt instructions as a coherent unit.
            # Keep type, line spacing and the existing role-play callout intact;
            # reserve enough room for the closing navigation and public CTA.
            self._draw_rich_paragraph(text, after=2)
            return
        return super()._draw_block(block)

    def _build_book_outline(self):
        entries = super()._build_book_outline()
        for item, (key, _) in zip(entries, [(k,p) for k,p in self.anchor_pages.items() if k not in ('day-90-exam','chapter-07')]):
            if re.fullmatch(r'(work|study|travel)-\d{2}', key): item[0] = 2
        return entries


def build():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    md, baseline, ledger, data = assemble()
    (OUTPUT / 'English90_Premium_DSSS.md').write_text(md, encoding='utf-8')
    (OUTPUT / 'changes.json').write_text(json.dumps(ledger, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUTPUT / 'editorial.diff').write_text(''.join(difflib.unified_diff(baseline.splitlines(True), md.splitlines(True))), encoding='utf-8')
    style = premium.native.read_json(premium.STYLE)
    program = premium.native.read_json(premium.native.PROGRAM)
    renderer = Renderer(style, program['days'][0], 1, full_book=True, copy=premium.native.read_json(premium.SOURCES/'manifest.json'))
    pdf = OUTPUT / 'English90_Premium_DSSS_V1_candidata.pdf'
    generated = renderer.render(md, pdf)
    with pymupdf.open(pdf) as doc:
        for entry in renderer.toc_entries:
            doc[entry['page']-1].insert_text((entry['x'],entry['y']), str(generated['internal_anchor_pages'][entry['id']]), fontsize=9,
                fontname=renderer._font_name('bold'), color=renderer.colors['teal'])
        premium.annotate_source_urls(doc, md)
        doc.set_metadata({'title':'English90 Premium — DSSS y rutas especializadas', 'author':'IMR Tech SpA'})
        doc.saveIncr()
    report = final.validate_pdf(pdf, generated, md)
    report.update({'status': 'automated_checks_passed_pending_visual_review', 'pdf_sha256': premium.sha256_file(pdf),
                   'baseline_pdf_sha256': premium.sha256_file(final.CANDIDATE / final.FINAL_NAME),
                   'source_sha256': data['source_sha256'], 'editorial_sha256': data['editorial_sha256'], 'style_sha256': premium.sha256_file(premium.STYLE),
                   'page_count': generated['page_count'], 'original_content_preserved': True,
                   'counts': {'days':90,'fundamental_assessments':12,'fundamental_projects':5,'day90':1,'contextual_challenges':72,
                              'missions':36,'core_pairs':144,'specialized_assessments':9,'specialized_projects':3},
                   'anchors': generated['internal_anchor_pages'],
                   'editorial_gaps': ['No se suministraron alternativas de respuesta cerrada; las expresiones se corrigen contra el modelo aprobado, sin evaluar producción libre.',
                                      'REVIEW reutiliza las expresiones CORE de la misión anterior. No se añadieron nuevos diálogos, explicaciones ni distractores editoriales.',
                                      'Las evaluaciones especializadas son formativas por autoevaluación o tutor; no se presentan como evaluaciones verificadas automáticamente.']})
    visual = OUTPUT / 'visual'; visual.mkdir(exist_ok=True)
    with pymupdf.open(pdf) as doc:
        keys = ['contents', 'choose-route', 'dsss-commitment', 'week-01', 'day-01', 'route-work', 'work-01', 'study-08', 'travel-04', 'specialized-assessments', 'specialized-projects']
        for key in keys:
            page = generated['internal_anchor_pages'][key] - 1
            doc[page].get_pixmap(matrix=pymupdf.Matrix(1.15,1.15), alpha=False).save(visual / f'{key}.png')
        # One contact sheet makes representative visual review manageable.
        from PIL import Image, ImageDraw
        thumbs = []
        for key in keys:
            im = Image.open(visual / f'{key}.png').convert('RGB'); im.thumbnail((298,421))
            tile = Image.new('RGB',(320,455),'#ddd');tile.paste(im,((320-im.width)//2,25));ImageDraw.Draw(tile).text((8,7),key,fill='black');thumbs.append(tile)
        sheet = Image.new('RGB',(320*4,455*3),'white')
        for i, im in enumerate(thumbs): sheet.paste(im,((i%4)*320,(i//4)*455))
        sheet.save(visual/'contact-sheet.png')
    (OUTPUT / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    with zipfile.ZipFile(OUTPUT / 'English90_DSSS_fuentes_privadas.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in [*SOURCE.glob('*'), Path(__file__), ROOT/'scripts/integrate-specializations.py', premium.STYLE]:
            archive.write(path, path.relative_to(ROOT))
        archive.write(BASE, 'baseline/English90_Premium_final.md')
        archive.write(OUTPUT/'English90_Premium_DSSS.md','English90_Premium_DSSS.md')
    print(json.dumps({'pdf':str(pdf),'pages':generated['page_count'],'checks':'passed'},ensure_ascii=False))


if __name__ == '__main__': build()
