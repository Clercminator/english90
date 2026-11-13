import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {missions,missionPractice,publicPractice} from '../../Entrenador/specializations';
import {STORAGE_KEY,emptyState} from '../../Entrenador/core';
import type {State} from '../../Entrenador/core';

test('all 36 missions save original production and adaptation in three levels and both themes',async({page})=>{
  test.setTimeout(600000);
  for(const theme of ['light','dark']) {
    await page.goto('/#/routes');await page.getByLabel('Tema del sitio').selectOption(theme);
    for(const m of missions) {
      const approved=missionPractice(m.id);
      await page.goto(`/#/routes?mission=${m.id}`);
      await expect(page.locator('#productionContext')).toHaveText(approved.context);
      await expect(page.locator('#productionTask')).toHaveText(approved.produce);
      for(const level of ['gentle','standard','challenge'] as const) {
        await page.locator('#routeDifficulty').selectOption(level);
        const own=`Local test ${m.code} ${level} ${theme}: a personal response at 7:35 with another name.`;
        await page.locator('#productionText').fill(own);
        if(level==='challenge') {
          await expect(page.locator('#productionChallenge')).toHaveText(approved.challenge);
          await page.locator('#productionAdaptation').fill(`Local adaptation ${m.code}: a different valid choice.`);
        }
        for(let i=0;i<3;i++) await page.locator(`#productionReview${i}`).selectOption('independent');
        if(level==='challenge') await page.locator('#productionAdapted').selectOption('hints');
        await page.getByRole('button',{name:'Guardar producción y autoevaluación',exact:true}).click();
        await expect(page.locator('#productionSaved')).toHaveText('Producción y autoevaluación registradas.');
      }
    }
  }
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!) as State,STORAGE_KEY);
  expect(Object.keys(saved.specialization!.productions!)).toHaveLength(36);
  for(const m of missions)for(const level of ['gentle','standard','challenge'] as const) {
    const p=saved.specialization!.productions![m.id][level]!;
    expect(p.text).toContain('dark');expect(p.submittedAt).not.toBeNull();
    expect(p.review).toEqual(['independent','independent','independent']);
    expect(p).not.toHaveProperty('score');
    if(level==='challenge'){expect(p.challenge).toContain(m.code);expect(p.adaptationReview).toBe('hints');}
  }
  expect(saved.history).toEqual([]);expect(saved.learning).toBeUndefined();
  await page.reload();await expect(page.locator('#productionText')).toHaveValue(saved.specialization!.productions!['travel-12'].challenge!.text);
});

test('draft recovery, route changes, examples, keyboard, self-review and backup keep prior progress',async({page})=>{
  await page.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:STORAGE_KEY,state:{...emptyState(),done:{17:true},notes:{17:'Prior note'}}});
  await page.goto('/#/routes?mission=study-12&practice=challenge');
  await expect(page.locator('#approvedExamples')).not.toHaveAttribute('open');
  await page.locator('#productionText').fill('A personal example that does not match any reference sentence.');
  await page.locator('#productionAdaptation').fill('Temporary adaptation');
  await page.reload();await expect(page.locator('#productionAdaptation')).toHaveValue('Temporary adaptation');
  await page.locator('#productionAdaptation').fill('');await page.reload();await expect(page.locator('#productionAdaptation')).toHaveValue('');
  await page.locator('#productionAdaptation').fill('Another response to the changed condition.');
  for(let i=0;i<3;i++)await page.locator(`#productionReview${i}`).selectOption('hints');
  await page.locator('#productionAdapted').selectOption('again');
  await page.locator('#freeProduction button[type=submit]').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#productionSaved')).toContainText('registradas');
  await page.goto('/#/routes?mission=work-01');
  await page.goto('/#/routes?mission=study-12&practice=challenge');
  await expect(page.locator('#productionText')).toHaveValue('A personal example that does not match any reference sentence.');
  await expect(page.locator('#productionReview0')).toHaveValue('hints');
  await page.locator('#approvedExamples > summary').click();
  for(const example of missionPractice('study-12').examples) await expect(page.locator('#approvedExamples')).toContainText(example.en);
  await page.goto('/#/routes?advances=1');await expect(page.locator('#view')).toContainText('A personal example');
  await page.getByRole('link',{name:'Revisar mi respuesta',exact:true}).click();
  await expect(page.locator('#routeDifficulty')).toHaveValue('challenge');
  await page.goto('/#/progress');
  const download=page.waitForEvent('download');await page.locator('#export').click();const file=await download;
  await page.locator('#importFile').setInputFiles((await file.path())!);await page.locator('#confirmImport').click();
  const restored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!) as State,STORAGE_KEY);
  expect(restored.done['17']).toBe(true);expect(restored.notes['17']).toBe('Prior note');
  expect(restored.specialization!.productions!['study-12'].challenge!.review).toEqual(['hints','hints','hints']);
  expect(restored.history).toEqual([]);
});

test('approved context, safety, examples and form controls remain accessible in both themes',async({page},info)=>{
  test.setTimeout(120000);
  for(const theme of ['light','dark']) {
    await page.goto('/#/routes');await page.getByLabel('Tema del sitio').selectOption(theme);
    for(const id of ['work-12','study-06','study-12','travel-04']) {
      await page.goto(`/#/routes?mission=${id}&practice=standard`);
      await expect(page.locator('#productionText')).toHaveValue(theme==='light'?'':'A response written independently.');
      expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
      if(id==='travel-04') {
        await expect(page.locator('#view')).toContainText(missionPractice(id).notes[0]);
        await page.locator('#foodClarification > summary').click();
        await expect(page.locator('#foodClarification')).toContainText('Does this contain peanuts or tree nuts?');
        await expect(page.locator('#foodClarification')).toContainText('Is there a risk of cross-contact?');
      }
      if(id==='study-06') await expect(page.locator('#view')).toContainText('student services office');
      if(id!=='study-06'&&['chromium-desktop','webkit-mobile'].includes(info.project.name)) await page.screenshot({path:`output/pdf/dsss-v1/visual/${id}-${theme}-${info.project.name}.png`,fullPage:true});
      await page.locator('#productionText').fill('A response written independently.');
      for(let i=0;i<3;i++)await expect(page.locator(`#productionReview${i}`)).toContainText(publicPractice.selfReview.options[2]);
      expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  }
});
