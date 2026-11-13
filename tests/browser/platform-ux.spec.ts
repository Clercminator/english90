import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {STORAGE_KEY} from '../../Entrenador/core';
import type {State} from '../../Entrenador/core';

test('route discovery starts with three choices and the optional commitment supports focused priorities',async({page},info)=>{
  await page.goto('/#/home');await expect(page.locator('.route-choices .category-card')).toHaveCount(3);
  await page.screenshot({path:`output/platform-ux/home-${info.project.name}.png`,fullPage:true});
  await page.goto('/#/routes');
  await expect(page.locator('#learningCommitment')).not.toHaveAttribute('open');
  await expect(page.locator('.route-choices .category-card')).toHaveCount(3);
  await page.screenshot({path:`output/platform-ux/routes-${info.project.name}.png`,fullPage:true});
  await page.locator('#learningCommitment > summary').click();
  await page.locator('#prioritySearch').fill('academica');
  await expect(page.locator('#priorityOptions [data-priority-option]:visible')).toHaveCount(5);
  await page.locator('#priorityClear').click();
  for(const id of ['work-01','study-01','travel-01'])await page.locator(`[name=priority][value="${id}"]`).check();
  await expect(page.locator('[name=priority][value=work-02]')).toBeDisabled();
  await expect(page.locator('#priorityCount')).toContainText('3 de 3');
  await page.locator('[name=priority][value=work-01]').uncheck();
  await expect(page.locator('[name=priority][value=work-02]')).toBeEnabled();
  await page.locator('#routeObjective').fill('Practicar para un objetivo personal');
  await page.locator('#weeklyEvidence').fill('Una respuesta propia');
  await page.getByRole('button',{name:'Guardar compromiso',exact:true}).click();
  await expect(page.locator('#status')).toContainText('Compromiso guardado');
  await page.reload();
  const state=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!) as State,STORAGE_KEY);
  expect(state.specialization?.commitment?.priorities).toEqual(['study-01','travel-01']);
});

test('review links allow changing difficulty, editing invalidates the old review and saving gives a next step',async({page},info)=>{
  await page.goto('/#/routes?mission=work-01&practice=challenge');
  await page.locator('#routeDifficulty').selectOption('standard');
  await expect(page).toHaveURL(/practice=standard/);
  await expect(page.locator('#routeDifficulty')).toBeFocused();
  await page.locator('#productionText').fill('A personal response.');
  await expect(page.locator('#productionSaved')).toContainText('Borrador guardado');
  for(let i=0;i<3;i++)await page.locator(`#productionReview${i}`).selectOption('independent');
  await page.locator('#freeProduction button[type=submit]').click();
  await expect(page.locator('#productionOutcome')).toBeVisible();
  await expect(page.locator('#productionContinue')).toHaveAttribute('href','#/routes?mission=work-02');
  await page.locator('#productionOutcome').screenshot({path:`output/platform-ux/next-step-${info.project.name}.png`});
  await page.locator('#productionReview0').selectOption('hints');
  await page.locator('#productionText').fill('An edited personal response.');
  for(let i=0;i<3;i++)await expect(page.locator(`#productionReview${i}`)).toHaveValue('');
  await expect(page.locator('#productionOutcome')).toBeHidden();
  for(let i=0;i<3;i++)await page.locator(`#productionReview${i}`).selectOption('again');
  await page.locator('#freeProduction button[type=submit]').click();
  await expect(page.locator('#productionContinue')).toBeHidden();
  await page.locator('#productionRetry').click();await expect(page.locator('#productionText')).toBeFocused();
  await page.reload();await expect(page.locator('#productionText')).toHaveValue('An edited personal response.');
  await expect(page.locator('#guideEvidence')).not.toHaveAttribute('open');
});

test('save feedback stays honest when browser storage refuses writes',async({page})=>{
  await page.addInitScript(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new Error('Blocked for test');return original.call(this,k,v);};},STORAGE_KEY);
  await page.goto('/#/routes?mission=travel-01');
  await page.locator('#productionText').fill('My answer exists in this session.');
  await expect(page.locator('#productionSaved')).toContainText('solo en esta sesión');
  await expect(page.locator('#storageWarning')).toBeVisible();
  await page.getByRole('link',{name:'Guardar una copia de mi progreso',exact:true}).click();
  const downloaded=page.waitForEvent('download');await page.locator('#export').click();
  const file=await downloaded;expect(await file.path()).toBeTruthy();
});

test('mission flow fits narrow screens and both themes with accessible controls',async({page},info)=>{
  test.setTimeout(60000);
  for(const theme of ['light','dark']){
    await page.goto('/#/routes?mission=study-12&practice=standard');
    await page.getByLabel('Tema del sitio').selectOption(theme);
    await page.locator('#productionText').fill('A saved draft for visual verification.');
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`output/platform-ux/mission-${theme}-${info.project.name}.png`,fullPage:true});
  }
});


test('a delayed route download cannot replace the screen after navigating away',async({page})=>{
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let continued!: () => void;
  const handled = new Promise<void>(resolve => { continued = resolve; });
  await page.route('**/specialization-view-*.js',async route=>{await gate;await route.continue();continued();});
  await page.goto('/#/routes?mission=work-01',{waitUntil:'domcontentloaded'});
  try {
    await expect(page.getByRole('status').filter({hasText:'Cargando tus rutas'})).toBeVisible();
    await page.getByRole('link',{name:'Vocabulario',exact:true}).first().click();
    await expect(page.getByRole('heading',{name:'Haz tuyo el vocabulario.'})).toBeVisible();
  } finally { release(); }
  await handled;
  await page.unroute('**/specialization-view-*.js');
  await expect(page.getByRole('heading',{name:'Haz tuyo el vocabulario.'})).toBeVisible();
  await page.goto('/#/routes?mission=work-01');
  await expect(page.locator('#productionText')).toBeVisible();
});
