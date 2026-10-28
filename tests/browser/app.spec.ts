import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { emptyState, exportBackup, STORAGE_KEY } from '../../Entrenador/core';
import type { State } from '../../Entrenador/core';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
});
async function saved(page: import('@playwright/test').Page): Promise<State> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
}

test('five primary sections and legacy records survive the free transition', async ({ page }) => {
  const old = emptyState(); old.done[30] = true; old.notes[30] = 'I can introduce myself.'; old.lastRoute = '#/plan/30';
  await page.addInitScript(({key, state}) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, {key: STORAGE_KEY, state: old});
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: 'Qué bueno verte de nuevo.', exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Continuar última actividad', exact: true }).click();
  await expect(page).toHaveURL(/#\/progress/);
  await page.getByText('Archivo de la versión anterior', {exact:false}).click();
  await expect(page.getByText('I can introduce myself.', {exact:false})).toBeVisible();
  await page.goto('/#/plan/30');
  await expect(page.getByRole('heading', { name: 'Este enlace pertenece a la versión anterior.' })).toBeVisible();
  await page.reload();
  expect((await saved(page)).done[30]).toBe(true);
  expect((await saved(page)).notes[30]).toBe(old.notes[30]);
});

test('flashcards require reveal and keep separate reverse schedules', async ({ page }) => {
  await page.goto('/#/cards?week=1');
  await expect(page.locator('#ratings')).toBeHidden();
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await expect(page.locator('#flashMeaning')).toHaveText('hola');
  await page.getByRole('button', { name: 'La olvidé · 10 minutos' }).click();
  const initial = await saved(page);
  expect(Object.keys(initial.cards)).toHaveLength(1);
  expect(Object.values(initial.cards)[0].rating).toBe('forgotten');
  await page.getByRole('combobox', { name: 'Dirección', exact: true }).selectOption('es-en');
  await expect(page.locator('.flash-word')).toHaveText('hola');
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: 'La conozco · 3 días' }).click();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Dirección', exact: true })).toHaveValue('es-en');
  expect(Object.keys((await saved(page)).cards)).toHaveLength(2);
});

test('multiple choice completes with one score per question and saved result', async ({ page }) => {
  await page.goto('/#/challenge?week=1&mode=translation');
  await page.getByRole('button', { name: 'Comenzar actividad' }).click();
  for (let i = 0; i < 10; i++) {
    const q = (await saved(page)).quiz!;
    await page.getByRole('button', { name: q.questions[q.index].answer, exact: true }).click();
    await expect(page.locator('.feedback')).toContainText('¡Correcto!');
    if (i === 2) { await page.reload(); await expect(page.locator('.feedback')).toContainText('¡Correcto!'); }
    await page.getByRole('button', { name: i === 9 ? 'Ver resultado' : 'Siguiente pregunta →' }).click();
  }
  await expect(page.getByRole('heading', { name: '10 de 10' })).toBeVisible();
  await page.reload();
  expect((await saved(page)).history).toHaveLength(1);
});

test('completion and ordering use real source answers, allow replay and resume', async ({ page }) => {
  await page.goto('/#/challenge/1?week=1&mode=completion');
  await page.getByRole('button', { name: 'Comenzar actividad' }).click();
  const q = (await saved(page)).quiz!;
  await page.getByLabel('Palabra o expresión que falta').fill(q.questions[0].answer.toUpperCase());
  await page.getByRole('button', { name: 'Comprobar respuesta' }).click();
  await expect(page.locator('.feedback')).toContainText('¡Correcto!');
  await page.getByRole('combobox', { name: 'Actividad', exact: true }).selectOption('ordering');
  await page.getByRole('button', { name: 'Comenzar actividad' }).click();
  await page.getByRole('button', { name: 'Descartar intento y comenzar' }).click();
  const order = (await saved(page)).quiz!.questions[0];
  const remaining = [...order.tokens!];
  for (const word of order.answer.split(/\s+/)) {
    const index = remaining.indexOf(word); remaining[index] = '';
    await page.locator(`[data-token="${index}"]`).click();
  }
  await page.getByRole('button', { name: 'Comprobar orden' }).click();
  await expect(page.locator('.feedback')).toContainText('¡Correcto!');
  await page.reload();
  await expect(page.locator('.feedback')).toContainText('¡Correcto!');
});

test('timed challenge expires while away and cannot reset its deadline on reload', async ({ page }) => {
  await page.clock.install();
  await page.goto('/#/challenge?week=1&mode=timed');
  await page.getByRole('button', { name: 'Comenzar actividad' }).click();
  const deadline = (await saved(page)).quiz!.deadline;
  await page.reload();
  expect((await saved(page)).quiz!.deadline).toBe(deadline);
  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.clock.fastForward(61000);
  expect((await saved(page)).history).toHaveLength(1);
  await page.goto('/#/challenge?week=1&mode=timed');
  await expect(page.getByRole('heading', { name: '0 de 10' })).toBeVisible();
});

test('assessment drafts, objective score, later self-review and history are distinct', async ({ page }) => {
  await page.goto('/#/assessments?week=1');
  await page.locator('#assessmentAnswer0').fill('is');
  await page.reload();
  await expect(page.locator('#assessmentAnswer0')).toHaveValue('is');
  await page.locator('#assessmentAnswer1').fill('ARE');
  await page.locator('#assessmentAnswer2').fill('an');
  await page.locator('#assessmentAnswer3').fill('a');
  await page.getByRole('button', { name: 'Corregir y guardar test' }).click();
  await expect(page.getByRole('heading', { name: '4 / 4' })).toBeVisible();
  expect((await saved(page)).history[0].selfScore).toBeNull();
  await page.locator('#assessmentNotes').fill('I am a learner. Review articles.');
  await page.getByRole('button', { name: 'Guardar mis notas' }).click();
  expect((await saved(page)).history[0].score).toBe(4);
  expect((await saved(page)).history[0].selfScore).toBeNull();
  expect((await saved(page)).history[0].assessment!.notes).toContain('Review articles');
  await page.getByRole('button', { name: 'Iniciar otro intento' }).click();
  await expect(page.locator('#assessmentAnswer0')).toHaveValue('');
  expect((await saved(page)).history).toHaveLength(1);
});

test('backup export/import validates before replacement and escapes imported notes', async ({ page }) => {
  const seed = emptyState(); seed.done[1] = true;
  await page.addInitScript(({key, state}) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, {key: STORAGE_KEY, state: seed});
  await page.goto('/#/progress');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar progreso' }).click();
  const download = await downloadPromise;
  const raw = readFileSync((await download.path())!, 'utf8');
  expect(JSON.parse(raw).progress.done[1]).toBe(true);
  await page.locator('#importFile').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
  await expect(page.locator('#status')).toContainText('Archivo no reconocido');
  expect((await saved(page)).done[1]).toBe(true);
  const incoming = emptyState(); incoming.done[30] = true; incoming.notes[30] = '<img src=x onerror=alert(1)>';
  await page.locator('#importFile').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(exportBackup(incoming)) });
  await expect(page.locator('#importPreview')).toBeVisible();
  expect((await saved(page)).done[1]).toBe(true);
  await page.getByRole('button', { name: 'Reemplazar con este respaldo' }).click();
  expect((await saved(page)).done[1]).toBeUndefined();
  await page.goto('/#/plan/30');
  await expect(page.getByText('Tu nota guardada:', {exact:false})).toContainText(incoming.notes[30]);
  await expect(page.locator('img')).toHaveCount(0);
});

test('legacy storage migrates and corrupt storage is retained instead of overwritten', async ({ page }) => {
  await page.addInitScript(({ key }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ day: 5, done: { 1: true }, cards: { hello: { next: '2026-10-28', reviewed: 3 } } }));
  }, { key: 'english90-v2-progress-1' });
  await page.goto('/');
  expect((await saved(page)).day).toBe(5);
  expect(Object.values((await saved(page)).cards)[0].reviews).toBe(3);
  await page.evaluate(key => localStorage.setItem(key, 'corrupt'), STORAGE_KEY);
  await page.reload();
  await expect(page.locator('#storageWarning')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('corrupt');
});

test('storage refusal still permits flashcard practice and export guidance', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
  await page.goto('/#/cards');
  await expect(page.locator('#storageWarning')).toContainText('No pudimos guardar');
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: 'La conozco · 3 días' }).click();
  await expect(page.locator('#status')).toContainText('solo en esta sesión');
  await expect(page.locator('#status')).not.toContainText('Repaso guardado');
});

test('AI prompts are category-specific, external links are official, copy has a fallback', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } }, configurable: true }); });
  await page.goto('/#/ai/30?checkpoint=1');
  await expect(page.locator('#aiPrompt')).toContainText('experiencias pasadas');
  await page.getByRole('button', { name: 'Copiar mensaje' }).click();
  await expect(page.locator('#status')).toContainText('texto está seleccionado');
  await expect(page.getByRole('link', { name: 'Abrir ChatGPT ↗' })).toHaveAttribute('href', 'https://chatgpt.com/');
  await expect(page.getByRole('link', { name: 'Abrir Gemini ↗' })).toHaveAttribute('rel', 'noopener noreferrer');
  await page.getByRole('combobox', {name:'Situación', exact:true}).selectOption('8');
  await expect(page.locator('#aiPrompt')).toContainText('pedir ayuda');
});

test('archived sales routes and private assets return 404; legal pages remain usable', async ({ page, request, baseURL }) => {
  await page.goto('/');
  await expect(page.locator('a[href*="checkout"]')).toHaveCount(0);
  expect((await request.get('/premium/')).status()).toBe(200);
  for (const path of ['/archive/commercial-v3.1/public-pages.mjs', '/English_90_V2_Guia_Premium.pdf', '/English_90_V2_Programa.json', '/private/source/English_90_V2_Guia_Premium.pdf', '/admin/protect_pdf.py', '/English_90_Trainer_Production.zip']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  // Vercel blocks unauthenticated .map requests before filesystem routing.
  // Maps are absent from both the audited build and the uploaded artifact.
  const sourceMap = await request.get('/assets/main.js.map');
  if (baseURL === 'https://english90.imrtech.xyz') {
    expect(sourceMap.status()).toBe(403);
    expect((await sourceMap.text()).trim()).toBe('');
  } else expect(sourceMap.status()).toBe(404);
  for (const path of ['/privacidad/', '/cookies/', '/terminos/', '/contacto/']) {
    await page.goto(path);
    await expect(page.locator('main h1')).not.toHaveText('');
    await expect(page.locator('main')).not.toContainText('undefined');
  }
});

test('all categories and game modes render; difficulty preference persists', async ({ page }) => {
  await page.goto('/');
  for (let n = 1; n <= 12; n++) {
    await page.goto(`/#/cards?week=${n}`);
    await expect(page.locator('#cardWeek')).toHaveValue(String(n));
    await expect(page.locator('main')).not.toContainText('undefined');
  }
  await page.goto('/#/challenge');
  await page.getByRole('combobox', {name:'Ritmo', exact:true}).selectOption('gentle');
  await page.getByRole('button', {name:'Comenzar actividad'}).click();
  expect((await saved(page)).quiz!.questions).toHaveLength(5);
  await page.reload();
  await expect(page.getByRole('combobox', {name:'Ritmo', exact:true})).toHaveValue('gentle');
});

test('key views meet automated WCAG AA checks and fit the viewport', async ({ page }) => {
  for (const hash of ['/#/home', '/#/daily', '/premium/', '/#/plan/1', '/#/cards', '/#/challenge', '/#/assessments', '/#/ai', '/#/progress', '/aprender/', '/aprender/recordar-vocabulario/', '/privacidad/', '/cookies/', '/terminos/', '/contacto/']) {
    await page.goto(hash);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations, `${hash}: ${JSON.stringify(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })))}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  await page.goto('/');
  await page.screenshot({ path: `test-results/home-${test.info().project.name}.png`, fullPage: true });
  await page.screenshot({ path: `test-results/viewport-${test.info().project.name}.png` });
});

test('sequential activity in two tabs retains both updates without write loops', async ({ page, context }) => {
  await page.goto('/#/cards?week=1');
  const other = await context.newPage();
  await other.goto('/#/cards?week=2');
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: 'La conozco · 3 días' }).click();
  await expect(other.locator('#status')).toContainText('otra pestaña');
  await other.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await other.getByRole('button', { name: 'Difícil · mañana' }).click();
  await expect.poll(async () => Object.keys((await saved(page)).cards).length).toBe(2);
  await page.reload();
  const result = await saved(page);
  expect(Object.keys(result.cards)).toHaveLength(2);
});

test('keyboard-only flashcard flow and confirmed reset are usable', async ({ page }) => {
  await page.goto('/#/cards?week=1');
  await page.locator('#reveal').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#forgotten')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#reveal')).toBeFocused();
  expect(Object.keys((await saved(page)).cards)).toHaveLength(1);
  await page.goto('/#/progress');
  await page.getByText('Restablecer este dispositivo', { exact: true }).click();
  await page.getByRole('button', { name: 'Preparar borrado' }).click();
  expect(Object.keys((await saved(page)).cards)).toHaveLength(1);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(Object.keys((await saved(page)).cards)).toHaveLength(1);
  await page.getByRole('button', { name: 'Preparar borrado' }).click();
  await page.getByRole('button', { name: 'Borrar todo mi progreso' }).click();
  expect(Object.keys((await saved(page)).cards)).toHaveLength(0);
});

test('disabled or blocked ads never interrupt practice or request Google scripts', async ({ page }) => {
  const external: string[] = [];
  page.on('request', request => { if (/google|doubleclick/.test(request.url())) external.push(request.url()); });
  await page.route(/googlesyndication|doubleclick|fundingchoices/, route => route.abort());
  await page.goto('/');
  await expect(page.locator('#adRegion, #privacyChoices, .adsbygoogle, .ad-region')).toHaveCount(0);
  await page.getByRole('link', {name:'Juegos', exact:true}).click();
  await page.getByRole('button', {name:'Comenzar actividad'}).click();
  await expect(page.locator('.question-box')).toBeVisible();
  expect(external).toEqual([]);
  await expect(page.getByRole('button', {name:'Opciones de privacidad publicitaria'})).toHaveCount(0);
});

test('educational pages are readable without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({javaScriptEnabled:false});
  const page = await context.newPage();
  for (const path of ['/', '/aprender/recordar-vocabulario/', '/aprender/frases-para-conversar/', '/aprender/practicar-con-ia/']) {
    await page.goto(`${baseURL}${path}`);
    await expect(page.locator('main h1')).toBeVisible();
    expect((await page.locator('main').innerText()).length).toBeGreaterThan(300);
    const config = JSON.parse(readFileSync('site.config.json', 'utf8'));
    if (config.siteUrl) {
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', config.siteUrl + path);
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    } else await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  }
  await context.close();
});


test('suspended advertising has no controls, placeholders, cookies or provider requests on any public view', async ({page, context, baseURL}) => {
  const requests:string[]=[];
  page.on('request', r=>requests.push(r.url()));
  for(const path of ['/#/home','/#/cards','/#/challenge','/#/assessments','/#/progress','/#/ai','/aprender/','/aprender/recordar-vocabulario/','/aprender/frases-para-conversar/','/aprender/practicar-con-ia/','/privacidad/','/cookies/','/terminos/','/contacto/']) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('#adRegion, #privacyChoices, .ad-region, .adsbygoogle, iframe')).toHaveCount(0);
    await expect(page.locator('script[src*="google"],script[src*="doubleclick"],script[src*="fundingchoices"]')).toHaveCount(0);
    expect(await page.evaluate(()=>typeof window.__tcfapi)).toBe('undefined');
  }
  expect(requests.filter(url=>new URL(url).origin!==new URL(baseURL!).origin)).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  await page.goto('/cookies/');
  await expect(page.locator('main')).toContainText('no instala cookies publicitarias');
  await page.getByText('Detalles del almacenamiento', {exact: true}).click();
  await expect(page.locator('main')).toContainText('english90-v2-progress-2');
});


test('first visit has an honest starting point and a ready public contact channel', async ({ page, request, browser, baseURL }) => {
  await page.goto('/');
  await expect(page.getByRole('link', {name: 'Continuar última actividad', exact: true})).toHaveCount(0);
  await expect(page.getByRole('link', {name: 'Empezar a practicar', exact: true})).toBeVisible();
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://english90.imrtech.xyz/share.png');
  const share = await request.get('/share.png');
  expect(share.headers()['content-type']).toContain('image/png');
  const png = await share.body();
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  for (const path of ['/privacidad/', '/cookies/', '/terminos/', '/contacto/']) {
    await page.goto(path);
    await expect(page.locator('main')).not.toContainText(/pendiente de|debe habilitar|no fue suministrado/);
    await expect(page.locator('main a[href="https://wa.me/message/JDI5GLAII5DCG1"]').first()).toBeVisible();
  }
  await page.goto('/contacto/');
  await expect(page.locator('main')).toContainText('IMR TECH SpA');
  await expect(page.getByRole('link', {name: 'Escribir por WhatsApp ↗'})).toHaveAttribute('rel', 'noopener noreferrer');
  for (const width of [320, 768, 1280]) {
    const sizedPage = await browser.newPage({viewport: {width, height: 900}});
    try {
      await sizedPage.goto(`${baseURL}/contacto/`);
      expect(await sizedPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally { await sizedPage.close(); }
  }
  const links = await page.locator('footer a[href^="/"]').evaluateAll(nodes => nodes.map(node => (node as HTMLAnchorElement).getAttribute('href')!.split('#')[0] || '/'));
  for (const path of new Set(links)) expect((await request.get(path)).status(), path).toBe(200);
});

test('a valid full negative form is accepted and incorrect answers get distinct feedback', async ({ page }) => {
  await page.goto('/#/assessments?week=8');
  for (const [i, answer] of ['must', 'must not', 'should', 'say'].entries()) await page.locator(`#assessmentAnswer${i}`).fill(answer);
  await page.getByRole('button', {name: 'Corregir y guardar test'}).click();
  await expect(page.getByRole('heading', {name: '4 / 4'})).toBeVisible();
  await page.goto('/#/challenge?week=1&mode=translation');
  await page.getByRole('button', {name: 'Comenzar actividad'}).click();
  const quiz = (await saved(page)).quiz!;
  const question = quiz.questions[0];
  await page.getByRole('button', {name: question.options!.find(option => option !== question.answer)!, exact: true}).click();
  await expect(page.locator('.feedback')).toHaveClass(/needs-review/);
  await expect(page.locator('.feedback')).toContainText(question.answer);
});
