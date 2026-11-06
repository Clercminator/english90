import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { siteConfig } from './Entrenador/config.ts';

export default defineConfig({
  root: 'Entrenador',
  base: '/',
  publicDir: false,
  define: { __ADS_ENABLED__: JSON.stringify(siteConfig.ads.enabled), __COMMERCE_LANDING__: JSON.stringify(process.env.VITE_COMMERCE_LANDING === 'true'), __PREMIUM_GUARD__: JSON.stringify(process.env.VITE_PREMIUM_GUARD === 'true') },
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022', sourcemap: false,
    rolldownOptions: { input: { main: resolve('Entrenador/index.html'), info: resolve('Entrenador/info.html'), sales: resolve('Entrenador/sales.html') } } },
  plugins: [{ name: 'private-content-boundary',
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) if (asset.type === 'chunk') for (const module of Object.keys(asset.modules)) {
        if (!siteConfig.ads.enabled && /[/\\]ads\.ts$/.test(module)) throw new Error('Disabled advertising module entered the production runtime.');
        if (/[/\\]private[/\\]|[/\\]archive[/\\]|English_90_V2_|supplement\.ts/i.test(module)) throw new Error(`Private content must never enter the client bundle: ${module}`);
      }
    },
  }],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
