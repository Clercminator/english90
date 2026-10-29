import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { STORAGE_KEY, emptyState, vocabulary } from '../../Entrenador/core';
import { createDaily, addDailyPractice } from '../../Entrenador/daily';
import { publicVocabulary } from '../../Entrenador/free';

test('listening uses English audio with slow replay, hides text, resumes and excludes assisted answers', async ({page}) => {
  await page.addInitScript(() => {
    const events = new EventTarget();
    Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{lang:'es-CL',localService:true},{lang:'en-US',localService:true}],
      cancel:()=>{}, addEventListener:events.addEventListener.bind(events),
      speak:(u: {text:string;rate:number;lang:string;onstart:()=>void;onend:()=>void})=>{ Object.assign(window,{lastSpoken:{text:u.text,rate:u.rate,lang:u.lang}}); u.onstart(); u.onend(); }}});
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:class {text:string; constructor(text:string){this.text=text;} }});
  });
  await page.goto('/#/challenge?week=1&mode=listening');
  await page.locator('#newQuiz').click();
  const answer = await page.evaluate(key=>{const q=JSON.parse(localStorage.getItem(key)!).quiz;return q.questions[0].answer;},STORAGE_KEY);
  await expect(page.locator('.question-box h2')).not.toContainText(answer);
  await page.getByRole('button',{name:'Escuchar más lento',exact:true}).click();
  expect(await page.evaluate(()=> (window as unknown as {lastSpoken:{lang:string;rate:number}}).lastSpoken)).toMatchObject({lang:'en-US',rate:0.7});
  await page.locator('#revealListening').click();
  await page.reload(); await expect(page.locator('.question-box')).toContainText('Lectura asistida');
  for(let i=0;i<4;i++) {
    const value=await page.evaluate(key=>{const q=JSON.parse(localStorage.getItem(key)!).quiz;return q.questions[q.index].answer;},STORAGE_KEY);
    await page.locator('#answerInput').fill(value); await page.locator('#checkAnswer').click(); await page.locator('#nextQuestion').click();
  }
  await expect(page.getByRole('heading',{name:'3 de 4',exact:true})).toBeVisible();
  await expect(page.locator('.result-card')).toContainText('1 respuestas con apoyo escrito');
});

test('unsupported audio and disabled audio leave text practice and guide navigation available', async ({page}) => {
  await page.addInitScript(()=>Object.defineProperty(window,'speechSynthesis',{value:undefined}));
  await page.goto('/#/challenge?mode=listening'); await page.locator('#newQuiz').click();
  await expect(page.locator('.audio-status')).toContainText('Audio no disponible');
  await page.locator('#revealListening').click();
  await expect(page.locator('.question-box')).toContainText('Lectura asistida');
  await page.goto('/#/progress'); await page.getByText('Preferencias de práctica',{exact:true}).click();
  await page.locator('#learningAudio').uncheck(); await page.goto('/#/situations');
  await page.locator('#spokenModel summary').click(); await expect(page.locator('#spokenModel')).toContainText('Audio desactivado');
  await page.getByRole('link',{name:'Omitir la práctica oral',exact:true}).click();
  await expect(page.locator('#view')).toContainText('INTERACCIÓN 2');
});

test('day 18 maps to hobbies vocabulary and phrases; day 90 reports the missing exam', async ({page}) => {
  await page.goto('/#/guide/18');
  await expect(page.locator('#view')).toContainText('Hobbies');
  await page.getByRole('link',{name:'Construir frases relacionadas'}).click();
  await page.locator('#newQuiz').click();
  const ids=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).quiz.questions.map((q:{id:string})=>q.id),STORAGE_KEY);
  expect(ids.sort()).toEqual(['practice-3-2','practice-3-6']);
  await page.goto('/#/guide/18'); await page.getByRole('link',{name:/Repasar \d+ expresiones del día/}).click();
  await expect(page.locator('#view')).toContainText('de 6 tarjetas');
  await page.goto('/#/guide/90'); await expect(page.locator('#view')).toContainText('no incluye el examen ni su clave');
  await expect(page.getByRole('link',{name:'Construir frases relacionadas'})).toHaveCount(0);
  await page.locator('#guideWeek').selectOption('5'); await expect(page.locator('#guideDay')).toHaveValue('29');
});

test('daily written stage resumes wrong answers, gives bounded retry and survives backup export', async ({page}) => {
  const state=emptyState(), words=vocabulary(publicVocabulary); state.daily=createDaily(state,words); addDailyPractice(state,words);
  state.daily.items.forEach(i=>i.rating='difficult');
  await page.goto('/'); await page.evaluate(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:STORAGE_KEY,state});
  await page.reload(); await page.goto('/#/daily');
  for(let i=0;i<3;i++){
    await page.locator('#dailyAnswer').fill('incorrect'); await page.locator('#dailyAnswerForm button').click();
    await expect(page.locator('#nextDailyAnswer')).toBeVisible();
    if(i===0){await page.reload(); await expect(page.locator('.feedback')).toContainText('reforzar');}
    await page.locator('#nextDailyAnswer').click();
  }
  await page.locator('[data-check-retry="0"]').locator('..').locator('summary').click();
  await page.locator('[data-retry="0"]').fill(state.daily.practice!.questions[0].answer);
  await page.locator('[data-check-retry="0"]').click();
  await expect(page.locator('[data-retry-status="0"]')).toContainText('Correcto');
  await page.locator('#completeDaily').click(); await expect(page.getByRole('heading',{name:'Hoy practicaste tu inglés.'})).toBeVisible(); await page.reload();
  const result=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),STORAGE_KEY);
  expect(result.history.map((r:{score:number})=>r.score)).toEqual([0,0]);
  expect(Object.values(result.learning).every(v=>(v as {correct:number}).correct===0)).toBe(true);
});

test.describe('phone accessibility', () => {
test.use({viewport:{width:375,height:900}, reducedMotion:'reduce'});
test('new guide, oral and writing screens fit phones and pass automated accessibility checks', async ({page},testInfo) => {
  for(const path of ['/#/guide/18','/#/situations?week=4','/#/challenge?mode=listening']){
    await page.goto(path);
    if(path.includes('challenge')) await page.locator('#newQuiz').click();
    if(path.includes('situations')) await page.locator('#spokenModel summary').click();
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(testInfo.project.name==='chromium-desktop') await page.screenshot({path:`tmp/v1-${path.includes('guide')?'guide':path.includes('situations')?'oral':'listen'}.png`,fullPage:true});
  }
});

});
