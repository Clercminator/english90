import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,rm,rmdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {auditPublicBuild} from '../scripts/check-public-build.mjs';
import {prepareVercel,auditPreparedVercel,vercelOutputConfig} from '../scripts/prepare-vercel.mjs';
import {siteConfig} from '../Entrenador/config.ts';
import {publicPages} from '../scripts/public-pages.mjs';

test('V3.1 public output contains neither advertising runtime nor empty controls',async()=>{
  assert.equal(siteConfig.ads.enabled,false);
  const files=await auditPublicBuild();
  for(const file of files.filter(f=>/\.(js|html)$/.test(f))) {
    const text=await readFile(resolve('dist',file),'utf8');
    assert.doesNotMatch(text,/__tcfapi|requestNonPersonalizedAds|showRevocationMessage|pagead2\.googlesyndication\.com|id="(?:adRegion|privacyChoices)"/);
  }
  for(const path of ['/privacidad/','/cookies/']) {
    const page=publicPages(siteConfig).find(p=>p.path===path)!;
    assert.match(page.body,/sin anuncios|no instala cookies publicitarias/);
    assert.doesNotMatch(page.body,/usa «Opciones de privacidad publicitaria»/i);
    assert.match(page.body,/localStorage/);
  }
});

test('preserved legal templates support future explicit ad activation',()=>{
  const future={...siteConfig,ads:{...siteConfig.ads,enabled:true}};
  assert.match(publicPages(future).find(p=>p.path==='/privacidad/')!.body,/anuncios no personalizados de Google AdSense/);
  assert.match(publicPages(future).find(p=>p.path==='/cookies/')!.body,/Opciones de privacidad publicitaria/);
  assert.doesNotMatch(publicPages(future).find(p=>p.path==='/cookies/')!.body,/publicidad está suspendida indefinidamente/);
});

test('Vercel staging contains only audited public bytes and routes unknown/private paths to 404',async()=>{
  await mkdir('tmp',{recursive:true});
  const root=await mkdtemp(resolve('tmp/vercel-stage-'));
  try {
    const {files}=await prepareVercel(root);
    assert.deepEqual(files,await auditPublicBuild());
    const config=vercelOutputConfig(files);
    function route(path:string,host=new URL(siteConfig.siteUrl).hostname):{status:number;dest?:string} {
      for(const rule of config.routes) {
        if('handle' in rule) {
          if(files.includes(path.slice(1))) return {status:200,dest:path};
          continue;
        }
        if('has' in rule && rule.has.some(condition=>condition.type==='host' && condition.value!==host)) continue;
        if(!new RegExp('^(?:'+rule.src+')$').test(path) || rule.continue) continue;
        return {status:rule.status||200,dest:rule.dest||rule.headers?.Location};
      }
      throw new Error('Missing routing result');
    }
    assert.deepEqual(route('/'),{status:200,dest:'/index.html'});
    const commerceHost=new URL(siteConfig.commerceSiteUrl!).hostname;
    assert.deepEqual(route('/',commerceHost),{status:200,dest:'/landing.html'});
    for(const file of files.filter(f=>f.endsWith('/index.html'))) {
      const path='/'+file.slice(0,-10);
      assert.deepEqual(route(path),{status:200,dest:'/'+file});
      assert.deepEqual(route(path.slice(0,-1)),{status:308,dest:path});
    }
    for(const path of ['/unknown','/private/source/English_90_V2_Guia_Premium.pdf','/English_90_V2_Programa.json','/admin/protect_pdf.py','/assets/main.js.map','/private/']) {
      assert.equal(route(path).status,404);
      assert.equal(route(path,commerceHost).status,404);
    }
    const staticDir=resolve(root,'.vercel/output/static');
    await writeFile(resolve(staticDir,'private.pdf'),'%PDF-1.7');
    await assert.rejects(()=>auditPreparedVercel(root),/Unapproved public file/);
    await rm(resolve(staticDir,'private.pdf'));
    const js=files.find(f=>f.endsWith('.js'))!;
    const original=await readFile(resolve(staticDir,js));
    await writeFile(resolve(staticDir,js),'console.log("unexpected changed deployment")');
    await assert.rejects(()=>auditPreparedVercel(root),/Staged bytes differ/);
    await writeFile(resolve(staticDir,js),original);
    await mkdir(resolve(root,'.vercel/output/functions'));
    await assert.rejects(()=>auditPreparedVercel(root));
    await rmdir(resolve(root,'.vercel/output/functions'));
    await writeFile(resolve(root,'accidental-source.txt'),'private');
    await assert.rejects(()=>prepareVercel(root),/Unexpected Vercel staging file/);
    await rm(resolve(root,'accidental-source.txt'));
    await auditPreparedVercel(root);
    await assert.rejects(()=>prepareVercel('Entrenador'),/Vercel staging must be/);
  } finally { await rm(root,{recursive:true,force:true}); }
});
