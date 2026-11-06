import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { validateConfig } from '../Entrenador/config.ts';
import { publicPages, escapeHtml as e } from './public-pages.mjs';
import { auditPublicBuild } from './check-public-build.mjs';

const config = validateConfig(JSON.parse(await readFile('site.config.json','utf8')));
const pages = publicPages(config);
await copyFile('Entrenador/assets/manrope-license.txt','dist/assets/manrope-license.txt');
const content = JSON.parse(await readFile('Entrenador/public-content.json', 'utf8'));
const expressionCount = new Set(content.categories.flatMap(c => c.vocabulary.map(v => v.en.toLowerCase()))).size;
const template = await readFile('dist/info.html','utf8');
const baseCsp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://*.supabase.co; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";
const adCsp = "default-src 'self'; script-src 'self' https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net https://fundingchoicesmessages.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net; frame-src https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";
function meta(html, path, title, description) {
 html=html.replace(/<title>.*?<\/title>/,`<title>${e(title)}</title>`).replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${e(description)}">`);
 const canonical = config.siteUrl ? `<link rel="canonical" href="${e(config.siteUrl+path)}"><meta property="og:url" content="${e(config.siteUrl+path)}"><meta property="og:image" content="${e(config.siteUrl)}/share.png"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="English 90. Tu inglés empieza con la práctica."><meta name="twitter:card" content="summary_large_image">` : '<meta name="robots" content="noindex,follow">';
 const verification=config.ads.verificationEnabled?`<meta name="google-adsense-account" content="${e(config.ads.publisherId)}">`:'';
 return html.replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="${config.ads.enabled?adCsp:baseCsp}"><meta name="referrer" content="no-referrer"><meta property="og:type" content="website"><meta property="og:locale" content="es_CL"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}">${canonical}${verification}`);
}
for(const page of pages){
 const out=`dist${page.path}index.html`; await mkdir(dirname(out),{recursive:true});
 const html=meta(template,page.path,page.title,page.description).replace('<!--PUBLIC_CONTENT-->',`<article class="panel active editorial">${page.body}</article>`).replace('<body>',`<body data-article="${!!page.article}">`);
 await writeFile(out,html);
}
let home=await readFile('dist/index.html','utf8');
home=home.replace('<!--PUBLIC_CONTENT-->',`<section class="hero"><div><p class="eyebrow">PRÁCTICA GRATUITA · SIN CUENTA</p><h1>Practica el inglés que necesitas.</h1><p>${expressionCount} expresiones, juegos de frases y tests gratuitos para hispanohablantes. Repasa a tu ritmo y conserva tu progreso en este dispositivo.</p><a class="primary light" href="/#/daily">Empezar a practicar</a></div></section><section class="panel active"><h2>Vocabulario, juegos y práctica con sentido</h2><p>Elige entre ${content.categories.length} situaciones prácticas. Alterna inglés y español, recuerda antes de mirar y usa lo aprendido en una frase propia. La repetición espaciada programa tus próximos repasos según tus marcas.</p><a href="/aprender/">Leer nuestras guías de práctica</a></section>`);
await writeFile('dist/index.html',meta(home,'/','English 90 · Inglés gratis para hispanohablantes',`Practica gratis ${expressionCount} expresiones en inglés, juegos y tests. Sin registro. Progreso local y repasos a tu ritmo.`));
await writeFile('dist/404.html',meta(template,'/404.html','Página no encontrada · English 90','Vuelve a English 90 para seguir practicando.').replace('<!--PUBLIC_CONTENT-->','<section class="panel active"><h1>Esta página no está disponible.</h1><p>Revisa la dirección o vuelve al inicio para seguir practicando.</p><a class="primary" href="/">Volver al inicio</a></section>'));
await rm('dist/info.html');
const sales = await readFile('dist/sales.html','utf8');
for (const path of ['/comprar/','/premium/','/cuenta/','/pago/']) {
 await mkdir(`dist${path}`,{recursive:true});
 let html=meta(sales,path,path==='/premium/'||path==='/comprar/'?'English90 · Tu plan de inglés de 90 días':'English90 · Tu cuenta y tu compra','Guía de estudio y práctica online a tu ritmo. Pago único de $59.990 CLP.');
 if (path==='/cuenta/'||path==='/pago/') html=html.replace('<head>','<head><meta name="robots" content="noindex,nofollow">');
 await writeFile(`dist${path}index.html`,html.replace('<!--SALES_CONTENT-->','<h1>English90 Premium</h1><p>Una guía de 90 días con práctica online para avanzar a tu ritmo. $59.990 CLP, pago único.</p>'));
}
await rm('dist/sales.html');
await writeFile('dist/robots.txt',config.siteUrl?`User-agent: *\nAllow: /\nSitemap: ${config.siteUrl}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n');
if(config.siteUrl)await writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/',...pages.map(p=>p.path)].map(path=>`<url><loc>${e(config.siteUrl+path)}</loc></url>`).join('')}</urlset>`);
if(config.ads.publisherId&&config.ads.verificationEnabled)await writeFile('dist/ads.txt',`google.com, ${config.ads.publisherId.replace('ca-','')}, DIRECT, f08c47fec0942fa0\n`);
await writeFile('dist/share.svg','<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#142b41"/><text x="90" y="170" fill="#b6d9c9" font-size="30" font-family="sans-serif">ENGLISH 90</text><text x="90" y="300" fill="white" font-size="64" font-family="Georgia,serif">Tu inglés empieza</text><text x="90" y="385" fill="white" font-size="64" font-family="Georgia,serif">con la práctica.</text><text x="90" y="510" fill="#dbe6e8" font-size="28" font-family="sans-serif">Vocabulario · Juegos · Tests · Gratis, sin cuenta</text></svg>');
await copyFile('Entrenador/share.png', 'dist/share.png');
console.log(`Public build validated: ${(await auditPublicBuild()).length} files. Ads ${config.ads.enabled?'configured':'OFF'}; checkout ${config.checkoutConfirmed?'configured':'OFF'}.`);
