import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {missions} from '../../Entrenador/specializations';
import type { State } from '../../Entrenador/core';
import {STORAGE_KEY} from '../../Entrenador/core';

test('all 36 missions complete using each exercise mode and each difficulty without losing progress', async ({page}) => {
  test.setTimeout(180000);
  for (let index=0;index<missions.length;index++) {
    const m=missions[index];
    await page.goto(`/#/routes?mission=${m.id}`);
    await page.locator('#routeDifficulty').selectOption((['gentle','standard','challenge'] as const)[index%3]);
    await page.locator('#routeMode').selectOption((['translation','recall','completion','ordering'] as const)[index%4]);
    await page.locator('#routePractice').click();
    for(let i=0;i<4;i++) {
      const q=await page.evaluate(key => (JSON.parse(localStorage.getItem(key)!) as State).quiz!,STORAGE_KEY);
      const item=q.questions[q.index];
      if(item.options) await page.locator('[data-option]').filter({hasText:item.answer}).click();
      else if(q.mode==='ordering' && q.difficulty!=='challenge') {
        const used=new Set<number>();
        for(const word of item.answer.split(/\s+/)) {
          const pos=item.tokens!.findIndex((token,n)=>token===word&&!used.has(n)); used.add(pos);
          await page.locator(`[data-token="${pos}"]`).click();
        }
        await page.locator('#checkOrder').click();
      } else { await page.locator('#answerInput').fill(item.answer); await page.locator('#checkAnswer').click(); }
      await page.locator('#nextQuestion').click();
    }
    await expect(page.locator('#quizArea')).toContainText('4 de 4');
  }
  const state=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!) as State,STORAGE_KEY);
  expect(state.history.filter(h=>h.label.startsWith('Misión '))).toHaveLength(36);
  await page.reload(); await expect(page.locator('#quizArea')).toContainText('4 de 4');
});

test('guide palette, both themes, route screenshots and contact work on desktop and mobile', async ({browser,baseURL},testInfo) => {
  test.setTimeout(120000);
  for(const width of [1440,390]) {
    const context = await browser.newContext({baseURL,viewport:{width,height:900},reducedMotion:'reduce'});
    const page = await context.newPage();
    try {
    for(const theme of ['light','dark'] as const) {
      await page.goto('/#/routes');
      await page.getByLabel('Tema del sitio').selectOption(theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      const palette=await page.evaluate(()=> {const s=getComputedStyle(document.documentElement); return {accent:s.getPropertyValue('--teal').trim(),bg:s.getPropertyValue('--bg').trim()};});
      expect(palette.accent.toUpperCase()).toBe(theme==='light'?'#6500FF':'#C8ACFF');
      expect(palette.bg.toUpperCase()).toBe(theme==='light'?'#FBF8FF':'#11152D');
      for(const route of ['work','study','travel']) {
        await page.goto(`/#/routes?route=${route}`);
        await expect(page.locator('.category-card')).toHaveCount(12);
        if(await page.locator('details[open]').count()) await page.locator('details[open] > summary').first().click();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
        if(testInfo.project.name==='chromium-desktop') await page.screenshot({path:`output/pdf/dsss-v1/visual/${route}-${theme}-${width}.png`,fullPage:true});
      }
      await page.goto('/#/routes?mission=work-01');
      await expect(page.locator('#view')).toContainText('Explicación posterior · Semana 2 · apoyo opcional');
      await expect(page.locator('#view')).not.toContainText('Prerrequisito y apoyo');
      expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
      await page.locator('#routePractice').focus(); await page.keyboard.press('Enter');
      if(await page.locator('#routeConfirm').isVisible()) await page.locator('#routeConfirm').click();
      await expect(page.locator('#answerInput')).toBeVisible();
      await page.locator('#answerInput').fill('wrong'); await page.locator('#checkAnswer').click();
      expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
      await page.goto('/contacto/'); await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    }
    await page.getByLabel('Tema del sitio').selectOption('system');
    await page.emulateMedia({colorScheme:'dark'}); await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await page.emulateMedia({colorScheme:'light'}); await expect(page.locator('html')).toHaveAttribute('data-theme','light');
    } finally { await context.close(); }
  }
});
