import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {STORAGE_KEY, emptyState, vocabulary} from '../../Entrenador/core';
import {createDaily,addDailyPractice} from '../../Entrenador/daily';
import {publicVocabulary} from '../../Entrenador/free';

test('theme persists on learning and public pages and system choice responds to OS changes',async({page})=>{
  await page.emulateMedia({colorScheme:'light'}); await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.getByLabel('Tema del sitio').selectOption('dark');
  for(const path of ['/#/cards','/#/assessments','/premium/','/privacidad/','/contacto/']){
    await page.goto(path); await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await expect(page.getByLabel('Tema del sitio')).toHaveValue('dark');
    await expect(page.locator('.theme-choice')).toHaveCSS('color','rgb(174, 189, 200)');
  }
  await page.getByLabel('Tema del sitio').selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.emulateMedia({colorScheme:'dark'}); await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByLabel('Tema del sitio').selectOption('light');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.locator('.theme-choice')).toHaveCSS('color','rgb(84, 103, 117)');
});

test('difficulty-specific test drafts are retained and challenge mixes grammar with contextual reading',async({page})=>{
  await page.goto('/#/assessments?week=1');
  await page.locator('#assessmentAnswer0').fill('my draft');
  await page.locator('#assessmentNotes').fill('private note');
  await page.locator('#testDifficulty').selectOption('challenge');
  await expect(page.locator('.reading-passage')).toHaveCount(2);
  for(let i=0;i<4;i++){
    const answer=await page.evaluate(({key,i})=>JSON.parse(localStorage.getItem(key)!).practiceTests['1:challenge'].questions[i].answer,{key:STORAGE_KEY,i});
    const control=page.locator(`#assessmentAnswer${i}`);
    if(i<2) await control.fill(answer); else await control.selectOption(answer);
  }
  await page.getByRole('button',{name:'Corregir y guardar test'}).click();
  await expect(page.getByRole('heading',{name:'4 / 4',exact:true})).toBeVisible();
  await page.locator('#testDifficulty').selectOption('standard');
  await expect(page.locator('#assessmentAnswer0')).toHaveValue('my draft');
  await expect(page.locator('#assessmentNotes')).toHaveValue('private note');
  await page.locator('#testDifficulty').selectOption('gentle');
  await expect(page.locator('select[data-index]')).toHaveCount(4);
  await page.locator('#assessmentAnswer0').selectOption({index:1});
  await page.locator('#assessmentWeek').selectOption('7');
  await expect(page.locator('#assessmentWeek')).toHaveValue('7');
  await page.locator('#assessmentWeek').selectOption('1'); await page.reload();
  await expect(page.locator('#assessmentAnswer0')).not.toHaveValue('');
});

test('reading difficulty changes text complexity and keeps feedback based on the supplied passage',async({page})=>{
  await page.goto('/#/challenge?week=11&mode=reading'); let length=0;
  for(const difficulty of ['gentle','standard','challenge']){
    if(await page.locator('#gameSettings').getAttribute('open')===null) await page.locator('#gameSettings summary').click();
    await page.locator('#difficulty').selectOption(difficulty); await page.locator('#newQuiz').click();
    const text=await page.locator('.reading-passage').innerText(); expect(text.length).toBeGreaterThan(length);length=text.length;
    for(let i=0;i<2;i++){
      const answer=await page.evaluate(key=>{const q=JSON.parse(localStorage.getItem(key)!).quiz;return q.questions[q.index].answer;},STORAGE_KEY);
      await page.getByRole('button',{name:answer,exact:false}).click();
      await expect(page.locator('.feedback')).toContainText('¡Correcto!'); await page.locator('#nextQuestion').click();
    }
    await expect(page.getByRole('heading',{name:'2 de 2',exact:true})).toBeVisible();
  }
  const state=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),STORAGE_KEY);
  expect(state.history).toHaveLength(3); expect(Object.keys(state.learning||{})).toHaveLength(0);
});

test('daily beginner choices remain resumable and do not become written-recall credit',async({page})=>{
  const state=emptyState(),words=vocabulary(publicVocabulary);state.preferences.difficulty='gentle';
  state.daily=createDaily(state,words);addDailyPractice(state,words);state.daily.items.forEach(i=>i.rating='difficult');
  await page.goto('/');await page.evaluate(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:STORAGE_KEY,state});await page.reload();await page.goto('/#/daily');
  for(let i=0;i<3;i++){
    await page.getByRole('button',{name:state.daily.practice!.questions[i].answer,exact:true}).click();
    await expect(page.locator('#nextDailyAnswer')).toBeVisible(); if(i===0) await page.reload();
    await page.locator('#nextDailyAnswer').click();
  }
  await page.locator('#completeDaily').click();await expect(page.getByRole('heading',{name:'Hoy practicaste tu inglés.'})).toBeVisible();
  expect(await page.evaluate(key=>Object.keys(JSON.parse(localStorage.getItem(key)!).learning||{}).length,STORAGE_KEY)).toBe(0);
});

test('vocabulary and conversation controls select genuinely different practice demands',async({page})=>{
  await page.goto('/#/home');await page.locator('#homeDifficulty').selectOption('gentle');
  await page.goto('/#/cards');
  await expect(page.locator('#cardPractice')).toHaveValue('reveal');
  await page.goto('/#/home');await page.locator('#homeDifficulty').selectOption('challenge');
  await page.goto('/#/cards');await expect(page.locator('#cardPractice')).toHaveValue('recall');
  expect((await page.locator('.flash-word').innerText()).split(/\s+/).length).toBeGreaterThan(1);
  await page.goto('/#/ai?week=11');await expect(page.locator('#aiPrompt')).toContainText('responder a objeciones');
  await page.locator('#aiDifficulty').selectOption('gentle');await expect(page.locator('#aiPrompt')).toContainText('Soy principiante');
});

test.describe('dark mobile',()=>{
test.use({viewport:{width:375,height:900},colorScheme:'dark',reducedMotion:'reduce'});
test('dark surfaces, feedback and new reading/tests are accessible and fit the viewport',async({page},testInfo)=>{
  test.setTimeout(60000);
  for(const path of ['/#/home','/#/daily','/#/cards','/#/progress','/#/guide','/#/situations','/#/ai','/#/challenge?mode=reading','/#/assessments?week=11','/premium/','/aprender/','/privacidad/','/cookies/','/terminos/','/contacto/']){
    await page.goto(path);
    if(path.includes('challenge')) {await page.locator('#newQuiz').click();await page.locator('[data-option]').first().click();}
    if(path.includes('assessments')) await page.locator('#testDifficulty').selectOption('challenge');
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(testInfo.project.name==='chromium-desktop' && ['/#/home','/#/challenge?mode=reading','/#/assessments?week=11','/premium/'].includes(path)) await page.screenshot({path:`tmp/dark-${path.includes('challenge')?'reading':path.includes('assessments')?'test':path.includes('premium')?'premium':'home'}.png`,fullPage:true});
  }
});
});
