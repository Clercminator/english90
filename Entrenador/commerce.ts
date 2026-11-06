import type { SupabaseClient } from '@supabase/supabase-js';
import './commerce.css';
import cover from './assets/guide-cover.webp';
import { siteConfig } from './config';

declare const __COMMERCE_LANDING__: boolean;
declare const __PREMIUM_GUARD__: boolean;
type Config = { enabled: boolean; price: number; environment: string; supabaseUrl: string; supabaseKey: string };
type Purchase = { id: string; status: string; amount_clp: number; created_at: string };
type Account = { email: string; entitled: boolean; orders: Purchase[]; deliveries: { order_id: string; status: string }[] };
let auth: SupabaseClient | undefined;
let config: Config | undefined;
let renderId = 0;
let accessUntil = 0;
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const find = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const support = siteConfig.contactEmail ? `mailto:${siteConfig.contactEmail}` : siteConfig.contactUrl || '/contacto/';
function event(name: string): void { window.dispatchEvent(new CustomEvent('english90:analytics', { detail: { name } })); }
const labels: Record<string,string> = { pending:'Pendiente', paid:'Pago confirmado', failed:'No se pudo completar', canceled:'Cancelado', refunded:'Reembolsado', disputed:'Pago en disputa', processing:'En preparación', ready:'Guía preparada', queued:'Correo en cola', sent:'Correo enviado', delivered:'Entrega confirmada por el servidor de correo', bounced:'Correo rechazado por el destinatario' };
const messages: Record<string,string> = { sales_disabled:'Las compras todavía no están habilitadas.', sales_not_ready:'Estamos preparando la venta. Vuelve más adelante.', rate_limited:'Has hecho varios intentos. Espera unos minutos antes de volver a intentarlo.', authentication_required:'Ingresa con tu correo para continuar.', purchase_required:'Este recurso requiere una compra vigente de tu cuenta.', guide_processing:'Estamos preparando tu guía. Vuelve a comprobarlo en unos minutos.', forbidden:'Ingresa a tu cuenta para consultar esta compra.', invalid_email:'Revisa tu dirección de correo.', consent_required:'Debes aceptar los términos y la política de privacidad.' };
class ApiError extends Error { constructor(message:string,public code:string){super(message);} }

async function api<T>(action: string, body?: object): Promise<T> {
  const token = auth ? (await auth.auth.getSession()).data.session?.access_token : undefined;
  const response = await fetch(`/api/commerce?action=${action}`, { method: body ? 'POST' : 'GET', cache:'no-store',
    headers: { ...(body ? { 'Content-Type':'application/json' } : {}), ...(token ? { Authorization:`Bearer ${token}` } : {}) },
    ...(body ? { body:JSON.stringify(body) } : {}) });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('El servicio de compra aún no está conectado.');
  const result = await response.json();
  if (!response.ok) throw new ApiError(messages[result.error] || 'No pudimos completar la solicitud. Inténtalo de nuevo o contacta con soporte.',result.error);
  return result as T;
}

async function configure(): Promise<Config> {
  config ??= await api<Config>('config');
  if (!auth && config.supabaseUrl && config.supabaseKey) { const { createClient } = await import('@supabase/supabase-js'); auth = createClient(config.supabaseUrl, config.supabaseKey); }
  // Wait until the SDK has consumed an activation callback before reading the session.
  if (auth) await auth.auth.getSession();
  return config;
}

const brand = `<a class="sales-brand" href="/comprar/" aria-label="English90 · Inicio">English<span>90</span><svg viewBox="0 0 150 12" aria-hidden="true"><path d="M3 5 Q52 15 100 5 T147 5"/></svg></a>`;
const footer = `<footer class="sales-footer">${brand}<p>Un producto de <strong>IMR Tech SpA</strong></p><div><a href="/terminos/">Términos y Condiciones</a><a href="/privacidad/">Política de Privacidad</a><a href="/entrega-y-reembolsos/">Entrega y Reembolsos</a><a href="${escape(support)}">Soporte</a></div></footer>`;
const icon = (name: string) => `<span class="sales-icon" aria-hidden="true">${({calendar:'▦',route:'◇',guide:'▱'} as Record<string,string>)[name]}</span>`;

export function landingMarkup(): string {
  return `<div class="sales-page"><header class="sales-header">${brand}</header><section class="sales-hero" aria-labelledby="salesTitle"><div class="sales-copy"><p class="sales-kicker">TU GUÍA. TU PRÁCTICA. TU RITMO.</p><h1 id="salesTitle">Deja de estudiar inglés sin rumbo.<br><mark>Sigue un plan claro de 90 días.</mark></h1><p>English90 combina una guía paso a paso con práctica online para ayudarte a saber qué estudiar, cómo practicar y cómo avanzar a tu ritmo, sin depender de horarios de clases.</p><a class="sales-jump" href="#purchase">Conoce tu próximo paso <span aria-hidden="true">↓</span></a></div><figure class="sales-product"><div class="book-wrap"><img src="${cover}" alt="Portada de la edición de referencia de la guía English90" width="595" height="842" fetchpriority="high"></div><figcaption>Vista de la guía · edición de referencia.<br>La edición de entrega se confirmará antes de habilitar la venta.</figcaption></figure></section><section id="purchase" class="sales-purchase" aria-labelledby="offerTitle"><div class="sales-offer"><p class="sales-kicker">UN PAGO · UNA RUTA PARA EMPEZAR</p><h2 id="offerTitle">English90 Premium</h2><p class="sales-price">$59.990 <span>CLP</span></p><p class="sales-includes">Guía digital protegida + práctica online.<br>Precio final. Sin suscripción.</p></div><form id="purchaseForm" class="sales-form"><label for="buyerEmail">Tu correo electrónico</label><input id="buyerEmail" type="email" name="email" autocomplete="email" placeholder="tu@correo.cl" maxlength="254" required><label class="sales-consent"><input id="buyerConsent" type="checkbox" required><span>Acepto los <a href="/terminos/" target="_blank" rel="noopener">Términos y Condiciones</a> y la <a href="/privacidad/" target="_blank" rel="noopener">Política de Privacidad</a>.</span></label><button class="sales-cta" type="submit">Quiero English90 por $59.990 <span aria-hidden="true">→</span></button><p class="sales-secure">Pago a través de Mercado Pago Checkout Pro</p><p id="checkoutMessage" role="status" aria-live="polite"></p></form></section><ul class="sales-benefits"><li>${icon('calendar')}<p><strong>Estudia a tu ritmo,</strong><br>sin horarios ni clases obligatorias.</p></li><li>${icon('route')}<p><strong>Sigue una ruta paso a paso</strong><br>en lugar de preguntarte qué estudiar.</p></li><li>${icon('guide')}<p><strong>Recibe tu guía por email</strong><br>y recupera el acceso desde tu cuenta English90.</p></li></ul>${footer}</div>`;
}

function cryptoToken(): string { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
function bindLanding(): void {
  event('landing_view');
  find<HTMLAnchorElement>('purchase')?.querySelector('a')?.addEventListener('click', () => event('cta_click'));
  document.querySelector('.sales-jump')?.addEventListener('click', ev => { ev.preventDefault(); event('cta_click'); find('buyerEmail').focus(); find('purchase').scrollIntoView({ behavior:'smooth',block:'center' }); });
  const form = find<HTMLFormElement>('purchaseForm');
  form.onsubmit = async ev => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('button')!;
    button.disabled = true;
    const message = find('checkoutMessage');
    message.textContent = 'Preparando tu pago…'; event('cta_click');
    try {
      const settings = await configure();
      if (!settings.enabled) throw new Error('Las compras todavía no están habilitadas. Puedes seguir usando la práctica gratuita.');
      const buyer = find<HTMLInputElement>('buyerEmail').value.trim().toLowerCase();
      let attempt: {key:string;token:string;email:string};
      try { attempt=JSON.parse(sessionStorage.getItem('english90-checkout') || 'null'); } catch { attempt=null!; }
      if (!attempt || attempt.email!==buyer) { attempt={key:crypto.randomUUID(),token:cryptoToken(),email:buyer}; sessionStorage.setItem('english90-checkout',JSON.stringify(attempt)); }
      const attribution=Object.fromEntries([...new URLSearchParams(location.search)].filter(([k]) => /^utm_(source|medium|campaign|content|term)$/.test(k)));
      const result=await api<{url:string;order:string}>('checkout',{email:buyer,consent:find<HTMLInputElement>('buyerConsent').checked,key:attempt.key,token:attempt.token,attribution});
      sessionStorage.setItem('english90-order',JSON.stringify({order:result.order,token:attempt.token}));
      const url=new URL(result.url);
      if (url.protocol!=='https:' || url.hostname!=='www.mercadopago.cl') throw new Error('No pudimos validar el destino de pago.');
      event('checkout_started'); location.assign(url.href);
    } catch (error) {
      if(error instanceof ApiError && error.code==='checkout_already_completed') { sessionStorage.removeItem('english90-checkout'); message.textContent='Este intento ya terminó. Consulta tu cuenta si pagaste; para iniciar otra compra, vuelve a pulsar el botón.'; }
      else message.textContent=error instanceof Error?error.message:'No pudimos iniciar la compra.';
      button.disabled=false;
    }
  };
  void configure().then(c => { if (!c.enabled) find('checkoutMessage').textContent='Venta en preparación. El cobro aún no está habilitado.'; }).catch(() => { find('checkoutMessage').textContent='Venta en preparación. El servicio de compra aún no está conectado.'; });
}

function shell(content: string): string { return `<div class="sales-page sales-account"><header class="sales-header">${brand}<a href="/cuenta/">Mi cuenta</a></header><section class="account-panel">${content}</section>${footer}</div>`; }
async function account(view: HTMLElement, id: number): Promise<void> {
  view.innerHTML=shell('<h1>Tu cuenta English90</h1><p role="status">Consultando tu cuenta…</p>');
  try {
    await configure(); if (id!==renderId) return;
    const session=auth?(await auth.auth.getSession()).data.session:null;
    if (!session) {
      view.innerHTML=shell(`<p class="sales-kicker">TU GUÍA, SIEMPRE A MANO</p><h1>Ingresa con tu correo</h1><p>Usa el mismo correo de tu compra. Te enviaremos un enlace de acceso; no necesitas recordar una contraseña de cuenta.</p><form id="loginForm" class="sales-form"><label for="loginEmail">Correo electrónico</label><input id="loginEmail" type="email" autocomplete="email" required maxlength="254"><button class="sales-cta">Enviar enlace de acceso</button><p id="loginMessage" role="status"></p></form>`);
      find<HTMLFormElement>('loginForm').onsubmit=async ev => { ev.preventDefault(); const button=find('loginForm').querySelector('button')!; button.disabled=true;
        try { await api('login',{email:find<HTMLInputElement>('loginEmail').value}); find('loginMessage').textContent='Revisa tu correo. Si el mensaje no aparece, revisa spam o vuelve a solicitar el enlace más tarde.'; }
        catch (error) { find('loginMessage').textContent=(error as Error).message; } finally { button.disabled=false; }
      }; return;
    }
    const data=await api<Account>('account',{}); if (id!==renderId) return;
    view.innerHTML=shell(`<p class="sales-kicker">MI CUENTA</p><h1>Tu próximo paso empieza aquí.</h1><p>${escape(data.email)}</p>${data.entitled?'<a class="sales-cta" href="/#/guide">Ir a mi práctica →</a>':'<p>No hay una compra vigente vinculada a esta cuenta. Si acabas de pagar, espera unos minutos y actualiza.</p>'}<div class="account-purchases">${data.orders.map(o=>`<article class="account-order"><h2>English90 Premium</h2><p>$59.990 CLP · ${escape(labels[o.status]||o.status)}</p><p>Entrega: ${escape(labels[data.deliveries.find(d=>d.order_id===o.id)?.status||'pending'])}</p><p class="order-reference">Pedido ${escape(o.id)}</p>${o.status==='paid'?`<button class="outline" data-download="${escape(o.id)}">Descargar guía</button> <button class="outline" data-password="${escape(o.id)}">Ver contraseña del PDF</button>`:''}</article>`).join('')}</div><p id="accountMessage" role="status"></p><p id="pdfSecret" class="pdf-secret" hidden></p><button id="hideSecret" class="outline" hidden>Ocultar contraseña</button><div class="account-actions"><button id="refreshAccount" class="outline">Actualizar estado</button><button id="logout" class="outline">Cerrar sesión</button></div><p>Tu progreso de práctica se conserva en este navegador. La cuenta guarda tus compras y acceso a la guía.</p>`);
    find('refreshAccount').onclick=()=>void account(view,id);
    find('logout').onclick=async()=>{ accessUntil=0; await auth?.auth.signOut(); void account(view,id); };
    find('hideSecret').onclick=()=>{ find('pdfSecret').textContent=''; find('pdfSecret').hidden=true; find('hideSecret').hidden=true; };
    view.querySelectorAll<HTMLButtonElement>('[data-download],[data-password]').forEach(button=>{ button.onclick=async()=>{ button.disabled=true;
      try {
        if (button.dataset.download) { const result=await api<{url:string}>('download',{order:button.dataset.download}); location.assign(result.url); }
        else { const result=await api<{password:string}>('password',{order:button.dataset.password}); find('pdfSecret').textContent=result.password; find('pdfSecret').hidden=false; find('hideSecret').hidden=false; }
      } catch(error) { find('accountMessage').textContent=(error as Error).message; } finally { button.disabled=false; }
    }; });
  } catch(error) { if(id===renderId) view.innerHTML=shell(`<h1>No pudimos consultar tu cuenta</h1><p role="alert">${escape((error as Error).message)}</p><a href="/cuenta/">Volver a intentar</a>`); }
}

async function payment(view: HTMLElement, id: number): Promise<void> {
  view.innerHTML=shell('<h1>Consultemos el estado de tu pago</h1><p role="status">Comprobando el registro de tu compra…</p>');
  try {
    let saved: {order:string;token:string}|null=null;
    try { saved=JSON.parse(sessionStorage.getItem('english90-order')||'null'); } catch { /* Account login recovers access on another device. */ }
    const identifier=new URLSearchParams(location.search).get('order') || saved?.order;
    if (!identifier || !saved || saved.order!==identifier) {
      view.innerHTML=shell('<h1>Consulta tu compra desde tu cuenta</h1><p>Para proteger tus datos, ingresa con el correo usado al comprar.</p><a class="sales-cta" href="/cuenta/">Ingresar a mi cuenta →</a>'); return;
    }
    const result=await api<{status:string;delivery:string}>('status',{order:identifier,token:saved.token}); if(id!==renderId) return;
    const paid=result.status==='paid';
    if(paid) event('verified_purchase');
    const headline=paid?'Tu pago está confirmado.':result.status==='pending'?'Tu pago sigue en proceso.':labels[result.status]||'Estado de tu compra';
    const detail=paid?`Entrega: ${labels[result.delivery]||'En preparación'}. La contraseña del PDF está en tu cuenta.`:result.status==='pending'?'Todavía no recibimos una confirmación del pago. Puedes comprobar de nuevo en unos minutos.':'No se ha habilitado la guía para este pedido. Puedes consultar los detalles con soporte.';
    view.innerHTML=shell(`<h1>${escape(headline)}</h1><p>${escape(detail)}</p><button id="checkPayment" class="outline">Comprobar de nuevo</button> <a href="/cuenta/">Ir a mi cuenta</a><p id="returnMessage" role="status"></p>`);
    find('checkPayment').onclick=()=>void payment(view,id);
  } catch(error) { if(id===renderId) view.innerHTML=shell(`<h1>Estamos comprobando tu compra</h1><p>${escape((error as Error).message)}</p><a href="/pago/">Comprobar de nuevo</a> · <a href="/cuenta/">Ir a mi cuenta</a>`); }
}

export function renderCommercial(view: HTMLElement, force?: string): boolean {
  const hash=location.hash.split('?')[0];
  const path=force || (hash==='#/comprar'?'landing':hash==='#/cuenta'?'account':hash==='#/pago'?'payment':!hash&&__COMMERCE_LANDING__?'landing':'');
  const guard=__PREMIUM_GUARD__ && Date.now()>accessUntil && /^#\/(guide|plan)(\/|\?|$)/.test(location.hash);
  document.body.classList.toggle('commercial',!!path || guard);
  const id=++renderId;
  if(!path && !guard) return false;
  document.title='English90 · '+(path==='landing'?'Tu plan de inglés de 90 días':path==='payment'?'Estado de tu pago':'Mi cuenta');
  if(path==='landing') { view.innerHTML=landingMarkup(); bindLanding(); }
  else if(path==='payment') void payment(view,id);
  else if(guard) {
    view.innerHTML=shell('<h1>Verificando tu acceso…</h1>');
    void configure().then(async()=>{const data=await api<Account>('account',{}); if(id!==renderId)return; if(data.entitled){ accessUntil=Date.now()+60000; document.body.classList.remove('commercial'); window.dispatchEvent(new CustomEvent('english90:access',{detail:{allowed:true}})); } else void account(view,id); }).catch(()=>void account(view,id));
  } else void account(view,id);
  return true;
}
