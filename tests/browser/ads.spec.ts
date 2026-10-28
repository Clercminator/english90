import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {siteConfig} from '../../Entrenador/config';
import type {ConsentData,createAds} from '../../Entrenador/ads';

declare global {
  interface Window {
    fixtureAds: ReturnType<typeof createAds>;
    createAdsForTest: typeof createAds;
    fixtureConsent: (data: ConsentData,success:boolean)=>void;
    fixturePushes: number;
    fixturePrivacy: number;
  }
}
const source=ts.transpileModule(readFileSync('Entrenador/ads.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/export /g,'')+'\nwindow.createAdsForTest = createAds;';
const granted: ConsentData={cmpId:123,cmpStatus:'loaded',eventStatus:'useractioncomplete',tcString:'test-only-not-a-real-TC-string',purpose:{consents:{1:true,2:true,7:true,9:true,10:true}},vendor:{consents:{755:true}}};
async function fixture(page:Page,blocked=false){
  const requests:string[]=[];
  await page.route('**/__ad-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><head><title>Isolated ad module test</title></head><body><main><h1>Practice fixture</h1></main><aside id="ads" hidden></aside></body></html>'}));
  await page.route(/fundingchoicesmessages\.google\.com/,route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.route(/googlesyndication\.com/,route=>{
    requests.push(route.request().url());
    return blocked?route.abort():route.fulfill({contentType:'text/javascript',body:'window.fixturePushes=0;window.adsbygoogle.push=function(){window.fixturePushes++};'});
  });
  await page.goto('/__ad-fixture');
  await page.addScriptTag({content:source});
  await page.evaluate(config=>{
    window.__tcfapi=(_command,_version,callback)=>{window.fixtureConsent=callback;};
    window.fixturePrivacy=0;
    window.googlefc={showRevocationMessage:()=>{window.fixturePrivacy++;}};
    window.fixtureAds=window.createAdsForTest(config,document.getElementById('ads')!);
    window.fixtureAds.setPlacement('home');
  },{...siteConfig,ads:{...siteConfig.ads,enabled:true,approved:true,consentConfigured:true,cmpCertifiedConfirmed:true,manualPlacementsConfirmed:true,cmpId:123,cmpScriptUrl:'https://fundingchoicesmessages.google.com/test-only',publisherId:'ca-pub-0000000000000000',slots:{home:'0000000000',article:'0000000001'}}});
  return requests;
}

test('CMP gate waits for consent, revokes, and does not request another impression on navigation',async({page})=>{
  const requests=await fixture(page);
  expect(requests).toEqual([]);
  await page.evaluate(()=>window.fixtureConsent({gdprApplies:false},true));
  expect(requests).toEqual([]);
  await expect(page.locator('#ads')).toBeHidden();
  await page.evaluate(data=>window.fixtureConsent(data,true),granted);
  await expect(page.locator('#ads ins')).toHaveCount(1);
  expect(requests).toHaveLength(1);
  expect(await page.evaluate(()=>window.fixturePushes)).toBe(1);
  expect(await page.evaluate(()=>window.adsbygoogle!.requestNonPersonalizedAds)).toBe(1);
  await page.evaluate(()=>window.fixtureConsent({},true));
  await expect(page.locator('#ads')).toBeHidden();
  await page.evaluate(data=>{window.fixtureConsent(data,true);window.fixtureAds.setPlacement(null);window.fixtureAds.setPlacement('home');},granted);
  await expect(page.locator('#ads')).toBeHidden();
  expect(requests).toHaveLength(1);
  expect(await page.evaluate(()=>window.fixturePushes)).toBe(1);
  expect(await page.evaluate(()=>window.fixtureAds.openPrivacy())).toBe(true);
  expect(await page.evaluate(()=>window.fixturePrivacy)).toBe(1);
});

test('consent received during gameplay never creates an ad unit',async({page})=>{
  const requests=await fixture(page);
  await page.evaluate(data=>{window.fixtureAds.setPlacement(null);window.fixtureConsent(data,true);},granted);
  await expect(page.locator('#ads')).toBeHidden();
  expect(requests).toEqual([]);
});

test('blocked ad scripts leave the region empty and usable',async({page})=>{
  const requests=await fixture(page,true);
  await page.evaluate(data=>window.fixtureConsent(data,true),granted);
  await expect.poll(()=>requests.length).toBe(1);
  await expect(page.locator('#ads')).toBeHidden();
  await expect(page.getByRole('heading')).toBeVisible();
});

test('unfilled ads collapse without retries',async({page})=>{
  const requests=await fixture(page);
  await page.evaluate(data=>window.fixtureConsent(data,true),granted);
  await expect(page.locator('#ads ins')).toHaveCount(1);
  await page.locator('ins').evaluate(el=>el.setAttribute('data-ad-status','unfilled'));
  await expect(page.locator('#ads')).toBeHidden();
  expect(requests).toHaveLength(1);
});
