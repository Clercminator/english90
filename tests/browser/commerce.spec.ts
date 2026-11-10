import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('commercial landing keeps one price, minimal valid consent form, three benefits and responsive layout', async ({page}, info) => {
  const checkout: object[]=[];
  await page.route('**/api/commerce?*', async route => {
    const action=new URL(route.request().url()).searchParams.get('action');
    if(action==='checkout') { checkout.push(route.request().postDataJSON()); await route.fulfill({status:503,json:{error:'sales_disabled'}}); }
    else await route.fulfill({json:{enabled:true,price:59990,currency:'CLP',environment:'sandbox',supabaseUrl:'',supabaseKey:''}});
  });
  await page.goto('/comprar/');
  await expect(page.getByRole('heading',{level:1})).toContainText('Deja de estudiar inglés sin rumbo');
  await expect(page.locator('.sales-benefits li')).toHaveCount(3);
  await expect(page.locator('.sales-form input')).toHaveCount(2);
  await expect(page.getByLabel('Acepto los')).not.toBeChecked();
  await page.getByRole('button',{name:'Quiero English90'}).click();
  expect(checkout).toHaveLength(0);
  await page.getByLabel('Tu correo electrónico',{exact:true}).fill('invalid');
  await page.getByRole('button',{name:'Quiero English90'}).click();
  expect(checkout).toHaveLength(0);
  await page.getByLabel('Tu correo electrónico',{exact:true}).fill('buyer@example.com');
  await page.getByRole('button',{name:'Quiero English90'}).click();
  expect(checkout).toHaveLength(0);
  await page.getByLabel('Acepto los').check();
  await page.getByRole('button',{name:'Quiero English90'}).click();
  await expect(page.getByRole('group',{name:'Confirma tu correo'})).toContainText('buyer@example.com');
  expect(checkout).toHaveLength(0);
  await page.getByRole('button',{name:'Confirmar correo e ir a Mercado Pago'}).click();
  await expect(page.getByRole('status')).toContainText('todavía no están habilitadas');
  expect(checkout).toHaveLength(1);
  expect(checkout[0]).toMatchObject({email:'buyer@example.com',consent:true});
  expect(checkout[0]).not.toHaveProperty('amount');
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>e.tagName+'.'+e.className)}));
  expect(size.scroll,JSON.stringify(size)).toBeLessThanOrEqual(size.width);
  const result=await new AxeBuilder({page}).analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({path:`tmp/english90-sales-${info.project.name}.png`,fullPage:true});
});

test('forged success URL cannot grant purchase and account recovery stays available',async({page})=>{
  await page.route('**/api/commerce?*',route=>route.fulfill({json:{enabled:false,price:59990,environment:'sandbox',supabaseUrl:'',supabaseKey:''}}));
  await page.goto('/pago/?status=approved&order=forged');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Consulta tu compra desde tu cuenta');
  await page.getByRole('link',{name:'Ingresar a mi cuenta'}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveText('Ingresa con tu correo');
  await expect(page.getByLabel('Correo electrónico',{exact:true})).toBeVisible();
});

test('payment return renders backend status rather than provider URL parameters',async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('english90-order',JSON.stringify({order:'fixture',token:'fixture-token'})));
  await page.route('**/api/commerce?*',route=>route.fulfill({json:{status:'pending',delivery:'pending'}}));
  await page.goto('/pago/?order=fixture&status=approved');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Tu pago sigue en proceso.');
  await page.route('**/api/commerce?*',route=>route.fulfill({json:{status:'paid',delivery:'processing'}}));
  await page.getByRole('button',{name:'Comprobar de nuevo'}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveText('¡Gracias por elegir English90!');
  await expect(page.locator('.account-panel')).toContainText('Tu pago está confirmado.');
  await expect(page.locator('.account-panel')).toContainText('En preparación');
});

test('legacy practice preserves access and does not load the Auth SDK',async({page})=>{
  const requests:string[]=[]; page.on('request',request=>requests.push(request.url()));
  await page.goto('/#/home');
  await expect(page.locator('.tabs')).toBeVisible();
  await page.getByRole('link',{name:'Vocabulario',exact:true}).first().click();
  await expect(page.getByRole('heading',{name:'Haz tuyo el vocabulario.'})).toBeVisible();
  expect(requests.some(url=>url.includes('supabase.co'))).toBe(false);
  const transfer=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/\.(js|css)$/.test(r.name)).reduce((n,r)=>n+(r as PerformanceResourceTiming).encodedBodySize,0));
  expect(transfer).toBeLessThan(300000);
});

test('readiness capture uses the actual disabled landing and working legal links',async({page,request},info)=>{
  await page.goto('/comprar/');
  const whatsapp = page.getByRole('link', {name:'Resolver dudas por WhatsApp (abre una nueva pestaña)', exact:true});
  await expect(whatsapp).toHaveCount(1);
  await expect(whatsapp).toHaveAttribute('href','https://wa.me/message/JDI5GLAII5DCG1');
  await expect(whatsapp).toHaveAttribute('target','_blank');
  await expect(whatsapp).toHaveAttribute('rel','noopener noreferrer');
  await expect(page.locator('.sales-footer .sales-whatsapp svg')).toBeVisible();
  await expect(page.locator('.sales-hero a[href*="wa.me"],.sales-purchase a[href*="wa.me"]')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Venta en preparación');
  await expect(page.locator('.sales-price')).toHaveText('$59.990 CLP');
  await expect(page.locator('.sales-copy h1')).toHaveCSS('font-family',/system-ui/);
  await expect(page.locator('.sales-offer h2')).toHaveCSS('font-family',/system-ui/);
  await expect(page.locator('.sales-product figcaption')).toHaveCount(0);
  await expect(page.locator('.book-wrap img')).toHaveAttribute('alt','Portada de la guía English90 Premium');
  await expect(page.locator('.sales-inclusions')).toContainText('Plataforma gratuita de práctica y tests');
  await expect(page.locator('.sales-benefits')).toContainText('plataforma de práctica y tests online');
  await expect(page.locator('.book-wrap img')).toBeVisible();
  await expect(page.locator('.laptop-mockup img')).toBeVisible();
  await expect(page.locator('.sales-page del,.sales-page s')).toHaveCount(0);
  await expect(page.getByLabel('Acepto los')).not.toBeChecked();
  await expect(page.getByLabel('Tu correo electrónico',{exact:true})).toHaveValue('');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const path of ['/terminos/','/privacidad/','/entrega-y-reembolsos/']) expect((await request.get(path)).status()).toBe(200);
  await page.screenshot({path:`tmp/readiness-sales-${info.project.name}.png`,fullPage:true});
});

test.describe('email correction on a phone',()=>{
test.use({viewport:{width:320,height:740}});
test('buyer can correct the delivery email before any checkout is created',async({page})=>{
  const checkout: object[]=[];
  await page.route('**/api/commerce?*',route=>{
    if(new URL(route.request().url()).searchParams.get('action')==='checkout') {
      checkout.push(route.request().postDataJSON());
      return route.fulfill({status:503,json:{error:'sales_disabled'}});
    }
    return route.fulfill({json:{enabled:true,environment:'sandbox',supabaseUrl:'',supabaseKey:''}});
  });
  await page.goto('/comprar/');
  await page.getByLabel('Tu correo electrónico',{exact:true}).fill('typo@example.com');
  await page.getByLabel('Acepto los').check();
  await page.getByRole('button',{name:'Quiero English90 por'}).click();
  await expect(page.locator('#confirmedEmail')).toHaveText('typo@example.com');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  expect(checkout).toHaveLength(0);
  await page.getByRole('button',{name:'Corregir correo'}).click();
  await expect(page.getByLabel('Tu correo electrónico',{exact:true})).toBeFocused();
  await page.getByLabel('Tu correo electrónico',{exact:true}).fill('correct@example.com');
  await page.getByRole('button',{name:'Quiero English90 por'}).click();
  await expect(page.locator('#confirmedEmail')).toHaveText('correct@example.com');
  await page.getByRole('button',{name:'Confirmar correo e ir a Mercado Pago'}).click();
  await expect(page.getByRole('status')).toContainText('todavía no están habilitadas');
  expect(checkout).toHaveLength(1);
  expect(checkout[0]).toMatchObject({email:'correct@example.com'});
});
});

test('payment waiting updates automatically and celebrates only verified payment once',async({page})=>{
  await page.clock.install();
  await page.addInitScript(()=>{
    sessionStorage.setItem('english90-order',JSON.stringify({order:'fixture',token:'fixture-token'}));
    (window as Window & {verified:number}).verified=0;
    window.addEventListener('english90:analytics',ev=>{if((ev as CustomEvent).detail.name==='verified_purchase')(window as Window & {verified:number}).verified++;});
  });
  let calls=0;
  await page.route('**/api/commerce?*',route=>{
    calls++;
    return route.fulfill({json:calls===1?{status:'pending',delivery:'pending'}:{status:'paid',delivery:calls===2?'queued':'sent'}});
  });
  await page.goto('/pago/?order=fixture&status=approved');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Tu pago sigue en proceso.');
  await expect(page.locator('.account-panel')).toContainText('No vuelvas a pagar');
  await page.clock.runFor(5000);
  await expect(page.getByRole('heading',{level:1})).toHaveText('¡Gracias por elegir English90!');
  await expect(page.locator('.account-panel')).toContainText('Estamos preparando tu guía');
  await page.clock.runFor(5000);
  await expect(page.locator('.account-panel')).toContainText('Hemos enviado un correo');
  await expect(page.locator('.account-panel')).toContainText('Spam o Promociones');
  await page.clock.runFor(15000);
  expect(calls).toBe(3);
  expect(await page.evaluate(()=>(window as Window & {verified:number}).verified)).toBe(1);
});

test('failed delivery preserves paid confirmation and offers account and support recovery',async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('english90-order',JSON.stringify({order:'fixture',token:'fixture-token'})));
  await page.route('**/api/commerce?*',route=>route.fulfill({json:{status:'paid',delivery:'bounced'}}));
  await page.goto('/pago/?order=fixture');
  await expect(page.locator('.account-panel')).toContainText('No necesitas volver a pagar');
  await expect(page.getByRole('link',{name:'Acceder a mi guía y contraseña'})).toHaveAttribute('href','/cuenta/');
  await expect(page.getByRole('link',{name:'Contactar con soporte',exact:true})).toHaveAttribute('href','mailto:soporte@imrtech.xyz');
  await expect(page.locator('.account-panel')).not.toContainText('Hemos enviado un correo');
  await expect(page.getByRole('heading',{name:'¿Pagaste y no recibiste tu guía?'})).toBeVisible();
  await expect(page.locator('.delivery-help')).toContainText('gestionaremos manualmente');
  await expect(page.locator('.delivery-help')).toContainText('comprobante de Mercado Pago');
  await expect(page.locator('.delivery-help')).not.toContainText('fixture-token');
  await expect(page.locator('.delivery-help a[href*="wa.me"]')).toHaveAttribute('rel','noopener noreferrer');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});

test('manual delivery recovery remains available when payment and account APIs fail',async({page,request},info)=>{
  await page.addInitScript(()=>sessionStorage.setItem('english90-order',JSON.stringify({order:'fixture',token:'fixture-token'})));
  await page.route('**/api/commerce?*',route=>route.fulfill({status:503,json:{error:'provider_unavailable'}}));
  await page.goto('/pago/?order=fixture');
  await expect(page.getByRole('heading',{name:'Estamos comprobando tu compra'})).toBeVisible();
  await expect(page.locator('.delivery-help')).toContainText('No vuelvas a pagar');
  await expect(page.locator('.delivery-help a[href="mailto:soporte@imrtech.xyz"]')).toBeVisible();
  await page.screenshot({path:`tmp/promotion-recovery-${info.project.name}.png`,fullPage:true});
  await page.goto('/cuenta/');
  await expect(page.getByRole('heading',{name:'No pudimos consultar tu cuenta'})).toBeVisible();
  await expect(page.locator('.delivery-help')).toContainText('Nunca envíes contraseñas ni códigos de acceso');
  const response=await request.get('/entrega-y-reembolsos/');
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('id="ayuda-entrega"');
  expect(await response.text()).toContain('gestionaremos manualmente');
});

test('pending payment polling stops after a minute and can be restarted manually',async({page})=>{
  await page.clock.install();
  await page.addInitScript(()=>{
    sessionStorage.setItem('english90-order',JSON.stringify({order:'fixture',token:'fixture-token'}));
    const state=window as Window & {pollSchedules:number};
    state.pollSchedules=0;
    const schedule=window.setTimeout.bind(window);
    window.setTimeout=((handler:TimerHandler,delay?:number,...args:unknown[])=>{
      const timer=schedule(handler,delay,...args);
      if(delay===5000)state.pollSchedules++;
      return timer;
    }) as typeof window.setTimeout;
  });
  let calls=0;
  await page.route('**/api/commerce?*',route=>{calls++;return route.fulfill({json:{status:'pending',delivery:'pending'}});});
  await page.goto('/pago/?order=fixture');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Tu pago sigue en proceso.');
  for(let i=0;i<12;i++) {
    // Wait for the previous response to schedule its next poll before advancing time.
    await expect.poll(()=>page.evaluate(()=>(window as Window & {pollSchedules:number}).pollSchedules)).toBe(i+1);
    await page.clock.runFor(5000);
    await expect.poll(()=>calls).toBe(i+2);
  }
  await expect(page.getByRole('status')).toContainText('Puedes comprobar de nuevo');
  await page.clock.runFor(15000);
  expect(calls).toBe(13);
  await page.getByRole('button',{name:'Comprobar de nuevo'}).click();
  await expect(page.getByRole('status')).toContainText('automáticamente');
  expect(calls).toBe(14);
});

for (const width of [320,375,390,428,768,1024,1440,1920]) test.describe(`sales redesign at ${width}px`,()=>{
  test.use({viewport:{width,height:width===768?600:900},reducedMotion:'reduce'});
  test('composition, purchase focus, highlights and real assets fit the viewport',async({page},info)=>{
    await page.goto('/comprar/');
    await page.evaluate(()=>document.fonts.ready);
    await expect(page.getByRole('heading',{level:1})).toContainText('Sigue un plan claro de 90 días.');
    expect(await page.locator('.sales-duration').evaluate(el=>el.getClientRects().length)).toBe(1);
    await expect(page.getByRole('link',{name:'Quiero mi guía English90'})).toBeVisible();
    await expect(page.locator('.laptop-mockup img')).toBeVisible();
    await expect(page.locator('.sales-benefits li')).toHaveCount(3);
    await expect(page.locator('.sales-form input')).toHaveCount(2);
    await expect(page.locator('.sales-landing')).not.toContainText(/Conoce tu próximo paso|Antes:|79\.990|Oferta de lanzamiento/);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const boxes=await page.locator('.sales-copy mark,.sales-price,.sales-form .sales-cta').evaluateAll(nodes=>nodes.flatMap(node=>[...node.getClientRects()].map(r=>({left:r.left,right:r.right}))));
    for(const box of boxes){expect(box.left).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width);}
    const copy=await page.locator('.sales-copy').boundingBox(),product=await page.locator('.sales-product').boundingBox();
    if(width<768) expect(product!.y).toBeGreaterThanOrEqual(copy!.y+copy!.height);
    else expect(product!.x).toBeGreaterThanOrEqual(copy!.x+copy!.width);
    const response=await page.request.get('/comprar/');
    expect(await response.text()).toContain('rel="canonical" href="https://english90.imrtech.xyz/comprar/"');
    await page.getByRole('link',{name:'Quiero mi guía English90'}).click();
    await expect(page.getByLabel('Tu correo electrónico',{exact:true})).toBeFocused();
    await expect(page.getByLabel('Acepto los')).not.toBeChecked();
    await expect(page.getByRole('status')).toContainText('Venta en preparación');
    if(info.project.name==='chromium-desktop') {
      await page.locator('.sales-journey').scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('.sales-landing img')].every(img=>img.complete&&img.naturalWidth>0));
      await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});
      await page.screenshot({path:`tmp/redesign-sales-${width}.png`,fullPage:true});
    }
    if(width===390||width===1440) expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  });
});
