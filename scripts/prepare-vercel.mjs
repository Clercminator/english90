import assert from 'node:assert/strict';
import { readdir, readFile, mkdir, rm, lstat, copyFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPublicBuild } from './check-public-build.mjs';
import siteConfig from '../site.config.json' with { type: 'json' };

export function vercelOutputConfig(files) {
  const pages = files.filter(name => name.endsWith('/index.html')).map(name => '/' + name.slice(0,-10));
  return {
    version: 3,
    routes: [
      { src: '/(.*)', headers: { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }, continue: true },
      ...(siteConfig.commerceSiteUrl && files.includes('landing.html') ? [{src:'/',has:[{type:'host',value:new URL(siteConfig.commerceSiteUrl).hostname}],dest:'/landing.html'}] : []),
      { src: '/', dest: '/index.html' },
      ...pages.flatMap(path => [
        { src: path.slice(0,-1), status: 308, headers: { Location: path } },
        { src: path, dest: path + 'index.html' },
      ]),
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/404.html', status: 404 },
    ],
  };
}
function checkedRoot(directory) {
  const root = resolve(directory);
  const rel = relative(resolve('.'),root).replaceAll('\\','/');
  if (rel !== 'release/vercel' && !/^tmp\/vercel-stage-[\w-]+$/.test(rel)) throw new Error('Vercel staging must be release/vercel or an isolated test directory.');
  return root;
}
async function noSymlink(path) {
  try { if ((await lstat(path)).isSymbolicLink()) throw new Error('Staging symlinks are forbidden.'); }
  catch(error) { if(error.code !== 'ENOENT') throw error; }
}
async function checkEnvelope(root) {
  await noSymlink(dirname(root)); await noSymlink(root); await noSymlink(resolve(root,'.vercel'));
  for(const [path, allowed] of [[root,['vercel.json','.vercel']],[resolve(root,'.vercel'),['output','project.json','README.txt']]]) {
    let entries;
    try { entries=await readdir(path); } catch(error) { if(error.code==='ENOENT') continue; throw error; }
    for(const entry of entries) {
      if(!allowed.includes(entry)) throw new Error(`Unexpected Vercel staging file: ${entry}`);
      await noSymlink(resolve(path,entry));
    }
  }
}
export async function auditPreparedVercel(directory = 'release/vercel') {
  const root=checkedRoot(directory); await checkEnvelope(root);
  const output=resolve(root,'.vercel/output'); await noSymlink(output);
  assert.deepEqual((await readdir(output)).sort(),['config.json','static']);
  await noSymlink(resolve(output,'config.json')); await noSymlink(resolve(output,'static'));
  const files=await auditPublicBuild();
  assert.deepEqual(await auditPublicBuild(resolve(output,'static')),files);
  assert.deepEqual(JSON.parse(await readFile(resolve(root,'vercel.json'),'utf8')),JSON.parse(await readFile('vercel.json','utf8')));
  assert.deepEqual(JSON.parse(await readFile(resolve(output,'config.json'),'utf8')),vercelOutputConfig(files));
  for(const file of files) assert.deepEqual(await readFile(resolve(output,'static',file)),await readFile(resolve('dist',file)),`Staged bytes differ: ${file}`);
  return {root,files};
}
export async function prepareVercel(directory = 'release/vercel') {
  const root=checkedRoot(directory); await checkEnvelope(root);
  const files=await auditPublicBuild();
  const output=resolve(root,'.vercel/output');
  if(!output.startsWith(root+sep)) throw new Error('Invalid staging path.');
  await noSymlink(output);
  // Only this derived build-output directory is replaced; the project link is retained.
  await rm(output,{recursive:true,force:true});
  await mkdir(resolve(output,'static'),{recursive:true});
  for(const file of files) {
    const dest=resolve(output,'static',file); await mkdir(dirname(dest),{recursive:true});
    await copyFile(resolve('dist',file),dest);
  }
  await copyFile('vercel.json',resolve(root,'vercel.json'));
  await writeFile(resolve(output,'config.json'),JSON.stringify(vercelOutputConfig(files),null,2)+'\n');
  return auditPreparedVercel(root);
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await prepareVercel();
  console.log(`Prepared ${result.files.length} audited static files in release/vercel/.vercel/output/static. No upload, project creation, domain change or deployment was performed.`);
}
