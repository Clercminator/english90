import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { STORAGE_KEY } from '../../Entrenador/core';
import type { State } from '../../Entrenador/core';

test('written vocabulary checks answers, animates only success and leaves scheduling to the learner', async ({ page }) => {
  await page.goto('/#/cards?week=1');
  await page.locator('#direction').selectOption('es-en');
  await page.locator('#cardPractice').selectOption('recall');
  await expect(page.locator('#cardAnswer')).toBeFocused();
  await page.locator('#cardAnswer').fill('HELLO');
  await page.getByRole('button', { name: 'Comprobar mi respuesta' }).click();
  await expect(page.locator('#cardFeedback')).toContainText('¡Correcto!');
  await expect(page.locator('#cardFeedback')).toHaveClass('celebrate');
  await expect(page.locator('#cardContext')).toContainText('Hello, my name is Alex.');
  expect(await page.evaluate(key => Object.keys(JSON.parse(localStorage.getItem(key)!).cards).length, STORAGE_KEY)).toBe(0);
  await page.locator('#known').click();
  await expect(page.locator('#cardAnswer')).toBeFocused();
  await page.reload();
  await expect(page.locator('#cardPractice')).toHaveValue('recall');
  await page.locator('#cardAnswer').fill('not a translation');
  await page.getByRole('button', { name: 'Comprobar mi respuesta' }).click();
  await expect(page.locator('#cardFeedback')).not.toHaveClass('celebrate');
  await expect(page.locator('#cardFeedback')).toContainText('Todavía no');
  await page.getByText(/Explorar las .* expresiones/).click();
  await page.locator('#wordSearch').fill('buenos dias');
  await expect(page.locator('#wordLibrary')).toContainText('good morning');
  await page.locator('#wordSearch').fill('zzzzzzz');
  await expect(page.locator('#wordCount')).toContainText('0 expresiones');
});

test('recall round tracks streaks, resumes and replays only mistakes without changing the original result', async ({ page }) => {
  await page.goto('/#/challenge?week=1&mode=recall');
  await page.locator('#difficulty').selectOption('gentle');
  await page.getByRole('button', { name: 'Comenzar actividad' }).click();
  for (let index = 0; index < 5; index++) {
    const q = await page.evaluate(key => (JSON.parse(localStorage.getItem(key)!) as State).quiz!, STORAGE_KEY);
    if (index === 2) await page.locator('#skipQuestion').click();
    else {
      await page.locator('#answerInput').fill(index === 3 ? 'incorrect' : q.questions[q.index].answer);
      await page.locator('#checkAnswer').click();
    }
    if (index === 1) {
      await expect(page.locator('.combo-message')).toContainText('2 aciertos seguidos');
      await expect(page.locator('#quizArea')).toHaveClass('celebrate');
      await page.reload();
      await expect(page.locator('.combo-message')).toContainText('2 aciertos seguidos');
      await expect(page.locator('#quizArea')).not.toHaveClass('celebrate');
    }
    await page.locator('#nextQuestion').click();
  }
  await expect(page.getByRole('heading', { name: '3 de 5' })).toBeVisible();
  await page.locator('#retryMistakes').click();
  await expect(page.locator('.question-box')).toContainText('Repaso de errores');
  for (let index = 0; index < 2; index++) {
    const q = await page.evaluate(key => (JSON.parse(localStorage.getItem(key)!) as State).quiz!, STORAGE_KEY);
    await page.locator('#answerInput').fill(q.questions[q.index].answer);
    await page.locator('#checkAnswer').click(); await page.locator('#nextQuestion').click();
  }
  await expect(page.getByRole('heading', { name: '2 de 2' })).toBeVisible();
  await expect(page.locator('#retryMistakes')).toHaveCount(0);
  await page.reload();
  const history = await page.evaluate(key => (JSON.parse(localStorage.getItem(key)!) as State).history, STORAGE_KEY);
  expect(history.map(r => [r.score, r.total])).toEqual([[3, 5], [2, 2]]);
});

test('challenge removes options, mixes sentence categories and keeps active settings when preferences change', async ({ page }) => {
  await page.goto('/#/challenge?week=9&mode=ordering');
  await page.locator('#difficulty').selectOption('challenge');
  await page.getByRole('button', { name: 'Comenzar actividad' }).click();
  await expect(page.locator('[data-token]')).toHaveCount(0);
  await expect(page.locator('#answerInput')).toBeVisible();
  let q = await page.evaluate(key => (JSON.parse(localStorage.getItem(key)!) as State).quiz!, STORAGE_KEY);
  expect(q.questions).toHaveLength(10);
  expect(q.questions.every(item => /^practice-[789]-/.test(item.id))).toBe(true);
  await page.locator('#gameSettings summary').click();
  await page.locator('#difficulty').selectOption('standard');
  await expect(page.locator('#answerInput')).toBeVisible();
  await page.locator('#answerInput').fill(q.questions[0].answer);
  await page.locator('#checkAnswer').click();
  await expect(page.locator('.feedback')).toContainText('¡Correcto!');
  await page.goto('/#/challenge?week=1&mode=translation');
  await page.locator('#difficulty').selectOption('challenge');
  await page.getByRole('button', { name: 'Comenzar actividad' }).click();
  await page.locator('#confirmRestart').click();
  await expect(page.locator('[data-option]')).toHaveCount(0);
  q = await page.evaluate(key => (JSON.parse(localStorage.getItem(key)!) as State).quiz!, STORAGE_KEY);
  expect(q.direction).toBe('es-en');
  await page.goto('/#/cards'); await page.locator('#direction').selectOption('en-es');
  await page.goto('/#/challenge?week=1&mode=translation');
  await expect(page.getByLabel('Tu traducción en inglés', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Tu traducción en inglés', { exact: true })).toBeVisible();
});

test('timed challenge expires on its initial screen without reload and stops accepting answers', async ({ page }) => {
  await page.clock.install();
  await page.goto('/#/challenge?week=1&mode=timed');
  await page.locator('#difficulty').selectOption('challenge');
  await page.getByRole('button', { name: 'Comenzar actividad' }).click();
  await page.clock.fastForward(61000);
  await expect(page.getByRole('heading', { name: '0 de 10' })).toBeVisible();
  await expect(page.locator('#answerInput')).toHaveCount(0);
  await page.locator('#retryMistakes').click();
  await expect(page.locator('#timer')).toContainText('60 s');
  await page.clock.fastForward(61000);
  expect(await page.evaluate(key => (JSON.parse(localStorage.getItem(key)!) as State).history.length, STORAGE_KEY)).toBe(2);
});

test('ordering supports undo, reset and repeated words', async ({ page }) => {
  await page.goto('/#/challenge?week=1&mode=ordering');
  await page.getByRole('button', { name: 'Comenzar actividad' }).click();
  await page.locator('[data-token="0"]').click();
  await page.locator('[data-token="1"]').click();
  await expect(page.locator('[data-remove]')).toHaveCount(2);
  await page.locator('#undoToken').click();
  await expect(page.locator('[data-remove]')).toHaveCount(1);
  await expect(page.locator('[data-token="1"]')).toBeEnabled();
  await page.locator('#clearTokens').click();
  await expect(page.locator('[data-remove]')).toHaveCount(0);
  await expect(page.locator('#undoToken')).toBeDisabled();
});

test.describe('feedback presentation', () => {
  test.use({ viewport: { width: 375, height: 900 } });
test('success feedback is accessible, fits a narrow phone and respects reduced motion', async ({ page }, testInfo) => {
  await page.goto('/#/challenge?week=1&mode=recall');
  await page.getByRole('button', { name: 'Comenzar actividad' }).click();
  const q = await page.evaluate(key => (JSON.parse(localStorage.getItem(key)!) as State).quiz!, STORAGE_KEY);
  await page.locator('#answerInput').fill(q.questions[0].answer);
  await page.locator('#checkAnswer').click();
  await expect(page.locator('#nextQuestion')).toBeFocused();
  expect(await page.locator('.success-mark svg').evaluate(el => getComputedStyle(el).animationName)).toBe('success-pop');
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#nextQuestion').focus();
  if (testInfo.project.name === 'chromium-desktop') await page.screenshot({ path: 'tmp/practice-mobile.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.success-mark svg').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  if (testInfo.project.name === 'chromium-desktop') await page.setViewportSize({ width: 1280, height: 960 });
  if (testInfo.project.name === 'chromium-desktop') await page.screenshot({ path: 'tmp/practice-desktop.png', fullPage: true });
});

});
