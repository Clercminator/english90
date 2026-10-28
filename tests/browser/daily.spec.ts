import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { emptyState, STORAGE_KEY, vocabulary, schedule, cardKey } from '../../Entrenador/core';
import { publicVocabulary } from '../../Entrenador/free';

test('daily practice reveals, grades, resumes, recaps and completes without duplicate progress', async ({page}) => {
  page.on('pageerror', error => { throw error; });
  await page.goto('/');
  await expect(page.getByRole('link', {name: 'Empezar a practicar', exact: true})).toBeVisible();
  await page.getByRole('link', {name: 'Empezar a practicar', exact: true}).click();
  await page.getByRole('button', {name: 'Comenzar sesión', exact: true}).click();
  await expect(page.locator('#dailyRatings')).toBeHidden();
  await page.getByRole('button', {name: 'Mostrar respuesta'}).click();
  expect(await page.evaluate(key => Object.keys(JSON.parse(localStorage.getItem(key)!).cards).length, STORAGE_KEY)).toBe(0);
  await page.getByRole('button', {name: 'La olvidé · 10 minutos'}).click();
  await expect(page.locator('.session-progress')).toContainText('1 de 10');
  const first = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).cards, STORAGE_KEY);
  await page.getByRole('link', {name: 'Salir y continuar después'}).click();
  await expect(page.getByRole('heading', {name: 'Qué bueno verte de nuevo.'})).toBeVisible();
  await page.getByRole('link', {name: 'Practicar hoy', exact: true}).click();
  await page.reload();
  await expect(page.locator('.session-progress')).toContainText('1 de 10');
  for (let i=1; i<10; i++) {
    await page.getByRole('button', {name: 'Mostrar respuesta'}).click();
    await page.getByRole('button', {name: 'La conozco · 3 días'}).click();
  }
  await expect(page.getByRole('heading', {name: 'Un último repaso.'})).toBeVisible();
  await page.getByRole('button', {name: 'Terminar sesión'}).click();
  await expect(page.getByRole('heading', {name: 'Hoy practicaste tu inglés.'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Hoy practicaste tu inglés.'})).toBeVisible();
  const state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(state.history.filter((r: {id: string}) => r.id.startsWith('daily-'))).toHaveLength(1);
  expect(Object.values(state.cards).every(c => (c as {reviews: number}).reviews === 1)).toBe(true);
  expect(state.cards[Object.keys(first)[0]]).toEqual(Object.values(first)[0]);
  await page.getByRole('link', {name: 'Practicar conversación con IA'}).click();
  await expect(page.locator('#aiPrompt')).toContainText('hello (hola)');
  await expect(page.locator('#aiPrompt')).toContainText('una sola pregunta');
});

test('daily restart preserves completed work and an exhausted queue has a useful exit', async ({page}) => {
  await page.goto('/#/daily');
  await page.getByRole('button', {name: 'Comenzar sesión'}).click();
  await page.getByRole('button', {name: 'Mostrar respuesta'}).click();
  await page.getByRole('button', {name: 'Difícil · mañana'}).click();
  await expect(page.locator('.session-progress')).toContainText('1 de 10');
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).cards, STORAGE_KEY);
  await page.getByText('Reorganizar esta sesión', {exact:true}).click();
  await page.getByRole('button', {name: 'Reorganizar pendientes'}).click();
  await expect(page.locator('.session-progress')).toContainText('0 de 10');
  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(after.cards).toEqual(before);
  expect(after.daily.items.some((i: {wordId: string}) => `en-es:${i.wordId}` === Object.keys(before)[0])).toBe(false);
  const full = emptyState();
  vocabulary(publicVocabulary).forEach(w => { full.cards[cardKey(w, 'en-es')] = schedule(undefined, 'known'); });
  await page.evaluate(({key, state}) => localStorage.setItem(key, JSON.stringify(state)), {key: STORAGE_KEY, state: full});
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Tus repasos están al día'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Comenzar sesión'})).toHaveCount(0);
  await expect(page.getByRole('link', {name: 'Elegir un juego'})).toBeVisible();
});

test('daily activity and recap meet automated accessibility checks', async ({page}) => {
  await page.goto('/#/daily');
  await page.getByRole('button', {name:'Comenzar sesión'}).click();
  for (const stage of ['card', 'answer']) {
    if (stage === 'answer') await page.getByRole('button', {name:'Mostrar respuesta'}).click();
    const audit = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
  }
  await expect(page.locator('#dailyForgotten')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#dailyReveal')).toBeFocused();
});

test('concurrent daily grades in two tabs commit a single review', async ({page, context}) => {
  await page.goto('/#/daily');
  await page.getByRole('button', {name:'Comenzar sesión'}).click();
  await expect(page.locator('#dailyReveal')).toBeVisible();
  const other = await context.newPage();
  await other.goto('/#/daily');
  await page.getByRole('button', {name:'Mostrar respuesta'}).click();
  await other.getByRole('button', {name:'Mostrar respuesta'}).click();
  // Queue both writes behind the same browser lock before letting either commit.
  await page.evaluate(() => new Promise<void>(ready => {
    void navigator.locks.request('english90-daily-progress', () => new Promise<void>(release => {
      Object.assign(window, {releaseDailyTestLock: release}); ready();
    }));
  }));
  await page.locator('#dailyKnown').click();
  await other.locator('#dailyDifficult').click();
  await page.evaluate(() => (window as unknown as {releaseDailyTestLock: () => void}).releaseDailyTestLock());
  await expect(page.locator('.session-progress')).toContainText('1 de 10');
  await expect(other.locator('.session-progress')).toContainText('1 de 10');
  await expect(other.locator('#view')).not.toHaveAttribute('aria-busy', 'true');
  const result = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(Object.keys(result.cards)).toHaveLength(1);
  expect(Object.values(result.cards).map(c => (c as {reviews:number}).reviews)).toEqual([1]);
  expect(result.daily.items.filter((i: {rating:string|null}) => i.rating !== null)).toHaveLength(1);
});

test('primary learning screens fit small phones, tablets and desktops', async ({browser, baseURL}) => {
  for (const width of [320, 375, 390, 768, 1280]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    try {
      for (const path of ['/#/home','/#/daily','/#/progress','/premium/']) {
        await page.goto(`${baseURL}${path}`);
        if (path === '/#/daily') {
          await page.getByRole('button', {name:'Comenzar sesión'}).click();
          await page.getByRole('button', {name:'Mostrar respuesta'}).click();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} at ${width}`).toBe(true);
      }
    } finally { await page.close(); }
  }
});
