import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { STORAGE_KEY, emptyState } from '../../Entrenador/core';
import type { State } from '../../Entrenador/core';
import { missions } from '../../Entrenador/specializations';

test('route contract, contextual practice, independent evidence and backups preserve the fundamental journey', async ({ page }) => {
  await page.addInitScript(({key,state}) => { if (!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify(state)); }, {key:STORAGE_KEY,state:{...emptyState(),done:{17:true},notes:{17:'Prior note'}}});
  await page.goto('/#/routes');
  await expect(page.getByRole('heading',{name:'Mis rutas de inglés',exact:true})).toBeVisible();
  await page.locator('#learningCommitment > summary').click();
  await page.locator('#primaryRoute').selectOption('work');
  await page.locator('#secondaryRoute').selectOption('travel');
  await page.locator('#routeObjective').fill('Entrevista de trabajo');
  await page.locator('#weeklyEvidence').fill('Una presentación sin ayuda');
  await page.locator('[name="studyDay"][value="1"]').check();
  await page.locator('[name="priority"][value="work-01"]').check();
  await page.getByRole('button',{name:'Guardar compromiso',exact:true}).click();
  await expect(page.locator('#status')).toContainText('Compromiso guardado');
  await page.goto('/#/routes?mission=work-01');
  await expect(page.getByRole('heading',{name:'W01 — Presentarte profesionalmente',exact:true})).toBeVisible();
  await page.locator('#routeDifficulty').selectOption('standard');
  await page.getByRole('button',{name:'Practicar lo esencial',exact:true}).click();
  await page.locator('#answerInput').fill('wrong');
  await page.locator('#checkAnswer').click();
  await page.locator('#nextQuestion').click();
  // An interrupted specialization uses the same persisted quiz engine.
  await page.reload();
  for (let i=1; i<4; i++) {
    const q = await page.evaluate(key => (JSON.parse(localStorage.getItem(key)!) as State).quiz!,STORAGE_KEY);
    await page.locator('#answerInput').fill(q.questions[q.index].answer);
    await page.locator('#checkAnswer').click(); await page.locator('#nextQuestion').click();
  }
  await expect(page.locator('#quizArea')).toContainText('3 de 4');
  await page.getByRole('button',{name:'Repasar 1 error',exact:true}).click();
  const retry = await page.evaluate(key => (JSON.parse(localStorage.getItem(key)!) as State).quiz!,STORAGE_KEY);
  expect(retry.missionId).toBe('work-01');
  await page.locator('#answerInput').fill(retry.questions[0].answer);
  await page.locator('#checkAnswer').click(); await page.locator('#nextQuestion').click();
  await page.locator('#guideEvidence > summary').click();
  await page.locator('#missionResult').fill('Me presenté ante un compañero');
  await page.locator('#missionNext').fill('Recordar la responsabilidad');
  await page.locator('#missionCompleted').check();
  await page.getByRole('button',{name:'Guardar autoevaluación'}).click();
  await expect(page.locator('#status')).toContainText('Autoevaluación registrada');
  await page.goto('/#/routes');
  await expect(page.locator('.callout').first()).toContainText('W02');
  await page.locator('details summary').first().click();
  await page.locator('#primaryRoute').selectOption('study');
  await page.getByRole('button',{name:'Guardar compromiso',exact:true}).click();
  await page.goto('/#/routes?advances=1');
  await expect(page.locator('#view')).toContainText('1 misiones comunicativas autoevaluadas');
  const state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!) as State,STORAGE_KEY);
  expect(state.done['17']).toBe(true); expect(state.notes['17']).toBe('Prior note');
  expect(state.specialization?.evidence).toHaveLength(1);
  expect(Object.values(state.learning!).reduce((n,e)=>n+e.attempts,0)).toBe(4);
  await page.goto('/#/progress');
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  const backup = await download;
  expect(backup.suggestedFilename()).toMatch(/\.json$/);
  await page.locator('#importFile').setInputFiles((await backup.path())!);
  await page.locator('#confirmImport').click();
  await expect(page.locator('#status')).toContainText('Respaldo importado');
  const imported = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!) as State,STORAGE_KEY);
  expect(imported.specialization).toEqual(state.specialization);
  expect(imported.done['17']).toBe(true);
});

test('every mission has a real deep link, public expressions only, accessible controls and mobile layout', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  for (const m of missions) {
    await page.goto(`/#/routes?mission=${m.id}`);
    await expect(page.getByRole('heading',{name:`${m.code} — ${m.title}`,exact:true})).toBeVisible();
    await expect(page.locator('[data-core]')).toHaveCount(4);
    await expect(page.locator('#view')).not.toContainText('**Diálogo**');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto('/#/routes?mission=travel-04');
  const results = await new AxeBuilder({page}).analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({path:`output/pdf/dsss-v1/visual/platform-${testInfo.project.name}.png`,fullPage:true});
  await page.locator('#routePractice').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#answerInput')).toBeVisible();
});

for (const [mission,difficulty,mode] of [['study-01','gentle','translation'],['travel-01','challenge','ordering']] as const) {
  test(`practice ${mission} at ${difficulty} with the shared exercise engine`, async ({page}) => {
    await page.goto(`/#/routes?mission=${mission}`);
    await page.locator('#routeDifficulty').selectOption(difficulty);
    await page.locator('#routeMode').selectOption(mode);
    await page.locator('#routePractice').click();
    const q = await page.evaluate(key => (JSON.parse(localStorage.getItem(key)!) as State).quiz!,STORAGE_KEY);
    if (difficulty === 'gentle') await page.getByRole('button',{name:q.questions[0].answer,exact:false}).click();
    else { await page.locator('#answerInput').fill(q.questions[0].answer); await page.locator('#checkAnswer').click(); }
    await expect(page.locator('#quizArea')).toContainText('¡Correcto!');
    await page.reload();
    await expect(page.locator('#nextQuestion')).toBeVisible();
  });
}
