"""Inspect every page for sparse content and keep mission CTAs indivisible."""
import json
from pathlib import Path
import re
import pymupdf
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'output/pdf/dsss-v1'


def inspect():
    report = json.loads((OUTPUT / 'validation.json').read_text(encoding='utf-8'))
    sparse, pairs, orphan = [], [], []
    with pymupdf.open(OUTPUT / 'English90_Premium_DSSS_V1_candidata.pdf') as doc:
        for number, page in enumerate(doc, 1):
            body = page.get_text(clip=pymupdf.Rect(0,44,page.rect.width,785))
            words = body.split()
            for url in re.findall(r'https://english90\.imrtech\.xyz/#/routes\?mission=[a-z‐-]+\d{2}', body):
                record = {'page':number, 'url':url, 'label_on_same_page':'Práctica pública:' in body}
                pairs.append(record)
                if not record['label_on_same_page']: orphan.append(record)
            if number > 1 and len(words) < 35:
                sparse.append({'page':number,'word_count':len(words),'body':body.strip()})
        assert len(pairs) == 36, len(pairs)
        assert not orphan, orphan
        # The only explicitly short index is intentional; other short pages
        # remain visible in the report and require visual disposition.
        for item in sparse:
            item['classification'] = 'intentional_specialization_index' if item['page'] == report['anchors']['specialization-index'] else 'requires_visual_review'
            doc[item['page']-1].get_pixmap(matrix=pymupdf.Matrix(1.15,1.15)).save(OUTPUT/'visual'/f"sparse-{item['page']:03}.png")
        indices = {report['anchors'][key] for key in report['anchors'] if key.startswith(('work-','study-','travel-','route-')) or key in ('specialization-index','specialized-assessments','specialized-projects')}
        pages = sorted({p for i in indices for p in [i-1,i] if p > 0} | {item['page'] for item in sparse})
        thumbs = []
        for page_number in pages:
            image = Image.frombytes('RGB', (doc[page_number-1].get_pixmap().width,doc[page_number-1].get_pixmap().height),doc[page_number-1].get_pixmap().samples)
            image.thumbnail((160,226)); tile=Image.new('RGB',(176,250),'#ddd');tile.paste(image,((176-image.width)//2,20));ImageDraw.Draw(tile).text((8,4),str(page_number),fill='black');thumbs.append(tile)
        # Separate sheets keep every mission boundary readable at inspection.
        for offset in range(0,len(thumbs),24):
            sheet=Image.new('RGB',(176*6,250*4),'white')
            for i,tile in enumerate(thumbs[offset:offset+24]):sheet.paste(tile,((i%6)*176,(i//6)*250))
            sheet.save(OUTPUT/'visual'/f'boundaries-{offset//24+1}.png')
        for key in ['study-12','travel-01','specialized-assessments','specialized-projects']:
            start=report['anchors'][key]
            for number in range(max(1,start-1),min(len(doc),start+3)+1):
                doc[number-1].get_pixmap(matrix=pymupdf.Matrix(1.15,1.15)).save(OUTPUT/'visual'/f'{key}-page-{number:03}.png')
    result={'pages_scanned':report['page_count'],'threshold':'fewer than 35 body words; excludes running header/footer and cover',
            'cta_pairs':pairs,'orphan_urls':orphan,'sparse_pages':sparse,'transition_pages_rendered':pages}
    (OUTPUT/'pagination-inspection.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'pages_scanned':result['pages_scanned'],'cta_pairs':len(pairs),'orphan_urls':orphan,'sparse_pages':sparse},ensure_ascii=False))


if __name__ == '__main__': inspect()
