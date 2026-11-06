import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {STORAGE_KEY} from '../../Entrenador/core';

test('styled menus support pointer, keyboard, search, cancel and disabled controls',async({page},info)=>{
  await page.goto('/#/assessments');
  const select=page.locator('#assessmentWeek');
  if(info.project.name==='webkit-mobile')await select.tap();else await select.click();
  const menu=page.getByRole('listbox');
  await expect(menu).toBeVisible();
  const chosen=menu.getByRole('option',{name:'Opiniones e ideas',exact:true});
  if(info.project.name==='webkit-mobile')await chosen.tap();else await chosen.click();
  await expect(select).toHaveValue('11');
  await expect(page.locator('#assessmentWeek + .select-value')).toHaveText('Opiniones e ideas');
  await select.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');await page.keyboard.press('Escape');
  await expect(select).toHaveValue('11');await expect(menu).toHaveCount(0);
  await page.keyboard.press('Enter');await page.keyboard.press('End');await page.keyboard.press('Enter');
  await expect(select).toHaveValue('12');
  await select.focus();await page.keyboard.type('Rut');await page.keyboard.press('Enter');
  await expect(select).toHaveValue('2');
  await expect(page.locator('#main')).toBeFocused();
  await select.focus();await page.keyboard.press('Enter');await menu.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await expect(select).toHaveValue('3');
  await select.click();await page.getByRole('heading',{name:'Tests de práctica gratuitos'}).click();await expect(menu).toHaveCount(0);
  await page.locator('#themeChoice').click();await page.getByRole('listbox').getByRole('option',{name:'Oscuro',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('#themeChoice + .select-value')).toHaveText('Oscuro');
  await page.goto('/#/challenge?mode=recall');await expect(page.locator('#quizDirection')).toBeDisabled();
  await page.locator('#quizDirection + .select-value').click({force:true});await expect(menu).toHaveCount(0);
});

test('test answer menus wrap long answers, save drafts and remain disabled after submission',async({page})=>{
  await page.goto('/#/assessments?week=11');await page.locator('#testDifficulty').selectOption('challenge');
  for(let i=0;i<4;i++){
    const answer=await page.evaluate(({key,i})=>JSON.parse(localStorage.getItem(key)!).practiceTests['11:challenge'].questions[i].answer,{key:STORAGE_KEY,i});
    if(i<2)await page.locator(`#assessmentAnswer${i}`).fill(answer);
    else{await page.locator(`#assessmentAnswer${i}`).click();await page.getByRole('listbox').getByRole('option',{name:answer,exact:true}).click();}
  }
  await page.reload();await expect(page.locator('#assessmentAnswer2 + .select-value')).toContainText('substantial benefit');
  await page.getByRole('button',{name:'Corregir y guardar test'}).click();
  await expect(page.getByRole('heading',{name:'4 / 4',exact:true})).toBeVisible();
  await expect(page.locator('#assessmentAnswer2')).toBeDisabled();
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

for(const width of [320,1280])test.describe(`select layout at ${width}px`,()=>{
  test.use({viewport:{width,height:850},reducedMotion:'reduce'});
  test('all screens and open menus fit both themes, with aligned test controls',async({page},info)=>{
    test.setTimeout(60000);
    for(const theme of ['light','dark']){
      for(const path of ['/#/home','/#/daily','/#/cards','/#/challenge','/#/assessments?week=11','/#/guide','/#/situations','/#/ai','/#/progress','/premium/','/aprender/','/contacto/']){
        await page.goto(path);if(path!='/premium/')await page.locator('#themeChoice').selectOption(theme);
        await expect(page.locator('main h1')).toBeVisible();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path).toBe(true);
        const controls=await page.locator('.select-control').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width).map(n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right,height:r.height};}));
        for(const rect of controls){expect(rect.left).toBeGreaterThanOrEqual(0);expect(rect.right).toBeLessThanOrEqual(width);expect(rect.height).toBeGreaterThanOrEqual(44);}
        if(path.includes('assessments')){
          await page.locator('#testDifficulty').selectOption('challenge');
          const boxes=await page.locator('.controls .select-control').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
          if(width>600){expect(Math.abs(boxes[0].top-boxes[1].top)).toBeLessThan(2);expect(Math.abs(boxes[0].height-boxes[1].height)).toBeLessThan(2);}
          await page.locator('#assessmentWeek').click();
          const menu=page.getByRole('listbox'),rect=await menu.boundingBox();
          expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.x+rect!.width).toBeLessThanOrEqual(width);expect(rect!.y).toBeGreaterThanOrEqual(0);expect(rect!.y+rect!.height).toBeLessThanOrEqual(850);
          expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
          if(info.project.name==='chromium-desktop')await page.screenshot({path:`tmp/selects-${width}-${theme}.png`,fullPage:false});
          await page.keyboard.press('Escape');
        }
      }
    }
  });
});
