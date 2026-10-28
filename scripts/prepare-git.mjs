import { writeFile } from 'node:fs/promises';
import { auditPublicBuild } from './check-public-build.mjs';
import { vercelOutputConfig } from './prepare-vercel.mjs';

// Git deployments serve the same locally audited static output as prebuilt deployments.
const files = await auditPublicBuild();
await writeFile('vercel.json', JSON.stringify({
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: null,
  installCommand: '',
  buildCommand: '',
  outputDirectory: 'dist',
  routes: vercelOutputConfig(files).routes,
}, null, 2) + '\n');
console.log(`Git deployment prepared: ${files.length} audited files in dist; no remote build or install.`);
