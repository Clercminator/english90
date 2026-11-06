import { readdir, readFile, lstat } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicPages } from './public-pages.mjs';

export async function auditPublicBuild(directory = 'dist') {
  const root = resolve(directory);
  if ((await lstat(root)).isSymbolicLink()) throw new Error('Public build root cannot be a symlink.');
  const config = JSON.parse(await readFile('site.config.json', 'utf8'));
  const allowed = new Set(['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'ads.txt', 'share.svg', 'share.png', 'comprar/index.html', 'cuenta/index.html', 'pago/index.html', ...publicPages(config).map(p => `${p.path.slice(1)}index.html`)]);
  const source = JSON.parse(await readFile('private/source/English_90_V2_Programa.json', 'utf8'));
  const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const privateTexts = [
    ...source.days.flatMap(d => [d.practice_prompt, d.day_goal_evidence, d.task].filter(Boolean)),
    ...source.weeks.map(w => w.reading),
  ].filter(t => t.length > 70).map(normalize);
  const paths = [];
  async function scan(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name); const name = relative(root, full).replaceAll('\\', '/');
      if ((await lstat(full)).isSymbolicLink()) throw new Error(`Public symlink forbidden: ${name}`);
      if (entry.isDirectory()) { await scan(full); continue; }
      if (!allowed.has(name) && !/^assets\/[a-zA-Z0-9_-]+\.(js|css|webp)$/.test(name)) throw new Error(`Unapproved public file: ${name}`);
      if (['.pdf','.json','.map','.zip','.py','.ts'].includes(extname(name))) throw new Error(`Private/source/archive output forbidden: ${name}`);
      const content = await readFile(full); const text = content.toString('utf8');
      if (content.subarray(0,5).toString() === '%PDF-' || /English_90_V2_|practice_prompt|day_goal_evidence|reading_questions|grammar_rules|anchor_en|anchor_es|"new_assessment"|sourceMappingURL|credentials\.dpapi|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-proj-[a-zA-Z0-9_-]{20,}/.test(text)) throw new Error(`Private material or source map found in ${name}`);
      if (!config.ads.enabled) {
        if (name.endsWith('.html') && /id=["'](?:adRegion|privacyChoices)["']|<ins\b[^>]*adsbygoogle/.test(text)) throw new Error(`Disabled advertising UI found in ${name}`);
        if (name.endsWith('.js') && /pagead2\.googlesyndication\.com|requestNonPersonalizedAds|__tcfapi|showRevocationMessage/.test(text)) throw new Error(`Disabled advertising runtime found in ${name}`);
      }
      if (/49[.,]990|purchase-pending|checkout\.example/i.test(text)) throw new Error(`Archived commercial material found in ${name}`);
      const flattened = normalize(text);
      if (privateTexts.some(t => flattened.includes(t))) throw new Error(`Premium prose detected in ${name}`);
      paths.push(name);
    }
  }
  await scan(root);
  if (!paths.includes('index.html') || !paths.includes('aprender/index.html')) throw new Error('Incomplete public build.');
  return paths.sort();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Public boundary passed: ${(await auditPublicBuild(process.argv[2])).length} approved files; no premium PDF, source curriculum, maps or archives.`);
}
