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
  await expect(page.getByRole('heading',{level:1})).toHaveText('Tu pago está confirmado.');
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
