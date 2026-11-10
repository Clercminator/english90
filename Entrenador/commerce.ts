import type { SupabaseClient } from '@supabase/supabase-js';
import './commerce.css';
import cover from './assets/guide-cover.webp';
import trainerPreview from './assets/trainer-desktop.webp';
import mountains from './assets/mountain-journey.webp';
import mountainsMobile from './assets/mountain-journey-mobile.webp';
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
let paymentTimer: ReturnType<typeof setTimeout> | undefined;
let paymentRequest = 0;
const trackedPurchases = new Set<string>();
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const find = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const support = siteConfig.contactEmail ? `mailto:${siteConfig.contactEmail}` : '/contacto/';
function deliveryHelp(identifier?: string): string {
  return `<section class="delivery-help" aria-labelledby="deliveryHelpTitle"><h2 id="deliveryHelpTitle">¿Pagaste y no recibiste tu guía?</h2><p>Si Mercado Pago confirmó tu pago, un problema técnico de entrega no anula tu compra. No vuelvas a pagar.</p><ol><li>Revisa Spam o Promociones y el correo que usaste al comprar.</li><li>Entra a <a href="/cuenta/">Mi cuenta</a> con ese mismo correo y solicita otro enlace de acceso.</li><li>Si no puedes acceder, escribe a <a href="${escape(support)}">${escape(siteConfig.contactEmail || 'soporte')}</a> o <a href="https://wa.me/message/JDI5GLAII5DCG1" target="_blank" rel="noopener noreferrer">WhatsApp para resolver la entrega</a>. Indica el correo de compra, explica brevemente qué ocurrió y comparte el comprobante de Mercado Pago con el identificador de la operación.</li></ol>${identifier?`<p class="order-reference">Referencia del pedido: ${escape(identifier)}</p>`:''}<p>Oculta saldos, datos de tarjeta y movimientos ajenos a esta compra en el comprobante. Nunca envíes contraseñas ni códigos de acceso.</p><p>Revisaremos el pago y, una vez verificado, gestionaremos manualmente la entrega de tu guía sin que tengas que volver a pagar. Sentimos las molestias que pueda causar un fallo técnico.</p></section>`;
}
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
const whatsapp = `<a class="sales-whatsapp" href="https://wa.me/message/JDI5GLAII5DCG1" target="_blank" rel="noopener noreferrer" aria-label="Resolver dudas por WhatsApp (abre una nueva pestaña)" title="Resolver dudas por WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.52 3.48A11.91 11.91 0 0 0 12.05 0C5.45 0 .08 5.37.07 11.97c0 2.11.55 4.17 1.6 5.99L0 24l6.2-1.63a11.97 11.97 0 0 0 5.84 1.49h.01c6.6 0 11.97-5.37 11.98-11.97a11.9 11.9 0 0 0-3.51-8.41ZM12.05 21.84a9.94 9.94 0 0 1-5.06-1.38l-.36-.22-3.68.97.98-3.59-.24-.37a9.9 9.9 0 0 1-1.52-5.28c0-5.48 4.46-9.94 9.95-9.94a9.87 9.87 0 0 1 7.03 2.92 9.88 9.88 0 0 1 2.91 7.04c0 5.48-4.46 9.94-10.01 9.85Zm5.46-7.45c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.8-1.49-1.78-1.66-2.08-.18-.3-.02-.46.13-.61.13-.14.3-.35.45-.53.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.68-.51h-.58c-.2 0-.52.07-.8.37-.27.3-1.05 1.03-1.05 2.51 0 1.48 1.08 2.91 1.23 3.11.15.2 2.12 3.24 5.14 4.54.72.31 1.28.49 1.72.63.72.23 1.37.2 1.89.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.18-1.42-.08-.13-.28-.2-.58-.35Z"/></svg></a>`;
const footer = `<footer class="sales-footer">${brand}<p>Un producto de <strong>IMR Tech SpA</strong></p><div><a href="/terminos/">Términos y Condiciones</a><a href="/privacidad/">Política de Privacidad</a><a href="/entrega-y-reembolsos/">Entrega y Reembolsos</a><a href="${escape(support)}">Soporte</a>${whatsapp}</div></footer>`;
const lineIcon = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({
  calendar:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16M8 15h1m6 0h1m-8 3h1"/>',
  route:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
  guide:'<rect x="4" y="4" width="16" height="12" rx="1"/><path d="M2 20h20m-13-4v4m6-4v4"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  lock:'<rect x="6" y="10" width="12" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
} as Record<string,string>)[name]}</svg>`;
const icon = (name: string) => `<span class="sales-icon">${lineIcon(name)}</span>`;

export function landingMarkup(): string {
  return `<div class="sales-page sales-landing"><div class="sales-inner">
    <header class="sales-header">${brand}</header>
    <section class="sales-hero" aria-labelledby="salesTitle">
      <div class="sales-copy"><h1 id="salesTitle"><span class="sales-lead">Deja de estudiar inglés sin rumbo.</span> <mark>Sigue un plan claro <span class="sales-duration">de 90 días.</span></mark></h1>
        <p>English90 combina una guía paso a paso con una plataforma de práctica y tests online para ayudarte a saber qué estudiar, cómo practicar y cómo avanzar a tu ritmo, sin depender de horarios de clases.</p></div>
      <figure class="sales-product"><div class="product-composition">
        <div class="laptop-mockup"><div class="device-screen"><img src="${trainerPreview}" alt="Captura real del inicio de la plataforma de práctica English90, en su tema oscuro" width="1280" height="800" fetchpriority="high"></div><div class="device-base"></div></div>
        <div class="book-wrap"><img src="${cover}" alt="Portada de la guía English90 Premium" width="595" height="842" fetchpriority="high"></div>
        </div></figure>
      <a class="sales-jump sales-cta" href="#purchase">Quiero mi guía English90 ${lineIcon('arrow')}</a>
    </section>
    <section id="purchase" class="sales-purchase" aria-labelledby="offerTitle">
      <div class="sales-offer"><h2 id="offerTitle">English90 Premium</h2><p class="sales-price">$59.990 <span>CLP</span></p>
        <ul class="sales-inclusions"><li>${lineIcon('check')}<span>Guía digital de English90.</span></li><li>${lineIcon('check')}<span>Plataforma gratuita de práctica y tests.</span></li><li>${lineIcon('check')}<span>Entrega digital por email.</span></li></ul>
        <p class="sales-payment-note">Precio final · Pago único · Sin suscripción</p></div>
      <form id="purchaseForm" class="sales-form"><label class="sales-email-label" for="buyerEmail">Tu correo electrónico</label>
        <div class="sales-email-field">${lineIcon('mail')}<input id="buyerEmail" type="email" name="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="Tu correo electrónico" maxlength="254" required></div>
        <label class="sales-consent"><input id="buyerConsent" type="checkbox" required><span>Acepto los <a href="/terminos/" target="_blank" rel="noopener">Términos y Condiciones</a> y la <a href="/privacidad/" target="_blank" rel="noopener">Política de Privacidad</a>.</span></label>
        <button class="sales-cta" type="submit">Quiero English90 por $59.990 ${lineIcon('arrow')}</button>
        <div id="emailConfirmation" class="sales-email-confirmation" role="group" aria-label="Confirma tu correo" hidden><p>Enviaremos tu guía y acceso a:</p><strong id="confirmedEmail"></strong><p>Revisa que esté bien escrito antes de continuar.</p><button id="confirmEmail" class="sales-cta" type="button">Confirmar correo e ir a Mercado Pago ${lineIcon('arrow')}</button><button id="correctEmail" class="sales-correct-email" type="button">Corregir correo</button></div>
        <p class="sales-email-help">La contraseña del PDF estará en tu cuenta. Recibirás por email el enlace de acceso.</p>
        <p class="sales-recovery-note">¿Ya pagaste y no recibiste la guía? <a href="/entrega-y-reembolsos/#ayuda-entrega">Consulta los pasos para recuperar tu compra.</a></p>
        <p class="sales-secure">${lineIcon('lock')} Pago a través de Mercado Pago Checkout Pro</p><p id="checkoutMessage" role="status" aria-live="polite"></p>
      </form>
    </section>
    <ul class="sales-benefits"><li>${icon('calendar')}<p><strong>Estudia a tu ritmo,</strong><br>sin horarios ni clases obligatorias.</p></li><li>${icon('route')}<p><strong>Sigue una ruta paso a paso</strong><br>en lugar de preguntarte qué estudiar.</p></li><li>${icon('guide')}<p><strong>Practica y mide tu avance</strong><br>complementa tu guía con la plataforma de práctica y tests online.</p></li></ul>
    </div><div class="sales-journey" aria-hidden="true"><img src="${mountainsMobile}" srcset="${mountainsMobile} 800w, ${mountains} 1600w" sizes="100vw" alt="" width="1600" height="533" loading="lazy" decoding="async"></div>${footer}
  </div>`;
}

function cryptoToken(): string { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
function bindLanding(): void {
  event('landing_view');
  find<HTMLAnchorElement>('purchase')?.querySelector('a')?.addEventListener('click', () => event('cta_click'));
  document.querySelector('.sales-jump')?.addEventListener('click', ev => { ev.preventDefault(); event('cta_click'); const email = find('buyerEmail'); email.focus({preventScroll:true}); email.scrollIntoView({ behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center' }); });
  const form = find<HTMLFormElement>('purchaseForm');
  const checkoutButton = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  let confirmedEmail = '';
  const resetConfirmation = () => { confirmedEmail=''; find('emailConfirmation').hidden=true; checkoutButton.hidden=false; };
  find('buyerEmail').addEventListener('input',resetConfirmation);
  find('correctEmail').onclick=()=>{resetConfirmation();find('buyerEmail').focus();};
  find('confirmEmail').onclick=()=>{confirmedEmail=find<HTMLInputElement>('buyerEmail').value.trim().toLowerCase();form.requestSubmit();};
  form.onsubmit = async ev => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    const buyer = find<HTMLInputElement>('buyerEmail').value.trim().toLowerCase();
    if (confirmedEmail !== buyer) {
      find('confirmedEmail').textContent=buyer;
      find('emailConfirmation').hidden=false;
      checkoutButton.hidden=true;
      find('confirmEmail').focus();
      return;
    }
    const button = checkoutButton;
    find('emailConfirmation').hidden=true;
    button.hidden=false;
    button.disabled = true;
    const message = find('checkoutMessage');
    message.textContent = 'Preparando tu pago…'; event('cta_click');
    try {
      const settings = await configure();
      if (!settings.enabled) throw new Error('Las compras todavía no están habilitadas. Puedes seguir usando la práctica gratuita.');
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
  void configure().then(c => { if (c.environment==='sandbox') find('checkoutMessage').textContent=c.enabled?'PRUEBA SANDBOX: sin cobro real. Entrega un PDF técnico de prueba; solo admite el correo autorizado.':'Entorno de pruebas. El checkout aún no está habilitado.'; else if (!c.enabled) find('checkoutMessage').textContent='Venta en preparación. El cobro aún no está habilitado.'; }).catch(() => { find('checkoutMessage').textContent='Venta en preparación. El servicio de compra aún no está conectado.'; });
}

function shell(content: string): string { return `<div class="sales-page sales-account"><header class="sales-header">${brand}<a href="/cuenta/">Mi cuenta</a></header><section class="account-panel">${content}</section>${footer}</div>`; }
async function account(view: HTMLElement, id: number): Promise<void> {
  view.innerHTML=shell('<h1>Tu cuenta English90</h1><p role="status">Consultando tu cuenta…</p>');
  try {
    await configure(); if (id!==renderId) return;
    const session=auth?(await auth.auth.getSession()).data.session:null;
    if (!session) {
      view.innerHTML=shell(`<p class="sales-kicker">TU GUÍA, SIEMPRE A MANO</p><h1>Ingresa con tu correo</h1><p>Usa el mismo correo de tu compra. Te enviaremos un enlace de acceso; no necesitas recordar una contraseña de cuenta.</p><form id="loginForm" class="sales-form"><label for="loginEmail">Correo electrónico</label><input id="loginEmail" type="email" autocomplete="email" required maxlength="254"><button class="sales-cta">Enviar enlace de acceso</button><p id="loginMessage" role="status"></p></form>${deliveryHelp()}`);
      find<HTMLFormElement>('loginForm').onsubmit=async ev => { ev.preventDefault(); const button=find('loginForm').querySelector('button')!; button.disabled=true;
        try { await api('login',{email:find<HTMLInputElement>('loginEmail').value}); find('loginMessage').textContent='Revisa tu correo. Si el mensaje no aparece, revisa spam o vuelve a solicitar el enlace más tarde.'; }
        catch (error) { find('loginMessage').textContent=(error as Error).message; } finally { button.disabled=false; }
      }; return;
    }
    const data=await api<Account>('account',{}); if (id!==renderId) return;
    view.innerHTML=shell(`<p class="sales-kicker">MI CUENTA</p><h1>Tu próximo paso empieza aquí.</h1><p>${escape(data.email)}</p>${data.entitled?'<a class="sales-cta" href="/#/guide">Ir a mi práctica →</a>':'<p>No hay una compra vigente vinculada a esta cuenta. Si acabas de pagar, espera unos minutos y actualiza.</p>'}<div class="account-purchases">${data.orders.map(o=>`<article class="account-order"><h2>English90 Premium</h2><p>$59.990 CLP · ${escape(labels[o.status]||o.status)}</p><p>Entrega: ${escape(labels[data.deliveries.find(d=>d.order_id===o.id)?.status||'pending'])}</p><p class="order-reference">Pedido ${escape(o.id)}</p>${o.status==='paid'?`<button class="outline" data-download="${escape(o.id)}">Descargar guía</button> <button class="outline" data-password="${escape(o.id)}">Ver contraseña del PDF</button>`:''}</article>`).join('')}</div><p id="accountMessage" role="status"></p><p id="pdfSecret" class="pdf-secret" hidden></p><button id="hideSecret" class="outline" hidden>Ocultar contraseña</button><div class="account-actions"><button id="refreshAccount" class="outline">Actualizar estado</button><button id="logout" class="outline">Cerrar sesión</button></div><p>Tu progreso de práctica se conserva en este navegador. La cuenta guarda tus compras y acceso a la guía.</p>${deliveryHelp()}`);
    find('refreshAccount').onclick=()=>void account(view,id);
    find('logout').onclick=async()=>{ accessUntil=0; await auth?.auth.signOut(); void account(view,id); };
    find('hideSecret').onclick=()=>{ find('pdfSecret').textContent=''; find('pdfSecret').hidden=true; find('hideSecret').hidden=true; };
    view.querySelectorAll<HTMLButtonElement>('[data-download],[data-password]').forEach(button=>{ button.onclick=async()=>{ button.disabled=true;
      try {
        if (button.dataset.download) { const result=await api<{url:string}>('download',{order:button.dataset.download}); location.assign(result.url); }
        else { const result=await api<{password:string}>('password',{order:button.dataset.password}); find('pdfSecret').textContent=result.password; find('pdfSecret').hidden=false; find('hideSecret').hidden=false; }
      } catch(error) { find('accountMessage').textContent=(error as Error).message; } finally { button.disabled=false; }
    }; });
  } catch(error) { if(id===renderId) view.innerHTML=shell(`<h1>No pudimos consultar tu cuenta</h1><p role="alert">${escape((error as Error).message)}</p><a href="/cuenta/">Volver a intentar</a>${deliveryHelp()}`); }
}

async function payment(view: HTMLElement, id: number, checks = 0): Promise<void> {
  clearTimeout(paymentTimer);
  const request = ++paymentRequest;
  if (!checks) view.innerHTML=shell('<h1>Consultemos el estado de tu pago</h1><p role="status">Comprobando el registro de tu compra…</p>');
  try {
    let saved: {order:string;token:string}|null=null;
    try { saved=JSON.parse(sessionStorage.getItem('english90-order')||'null'); } catch { /* Account login recovers access on another device. */ }
    const identifier=new URLSearchParams(location.search).get('order') || saved?.order;
    if (!identifier || !saved || saved.order!==identifier) {
      view.innerHTML=shell(`<h1>Consulta tu compra desde tu cuenta</h1><p>Para proteger tus datos, ingresa con el correo usado al comprar.</p><a class="sales-cta" href="/cuenta/">Ingresar a mi cuenta →</a>${deliveryHelp()}`); return;
    }
    const result=await api<{status:string;delivery:string}>('status',{order:identifier,token:saved.token}); if(id!==renderId || request!==paymentRequest) return;
    const paid=result.status==='paid';
    if(paid && !trackedPurchases.has(identifier)) { trackedPurchases.add(identifier); event('verified_purchase'); }
    const headline=paid?'¡Gracias por elegir English90!':result.status==='pending'?'Tu pago sigue en proceso.':labels[result.status]||'Estado de tu compra';
    const failedDelivery=['failed','bounced'].includes(result.delivery);
    const sent=['sent','delivered'].includes(result.delivery);
    const detail=paid?'Tu pago está confirmado. Ya diste el primer paso en tu camino para aprender inglés.':result.status==='pending'?'Todavía no recibimos una confirmación del pago. No vuelvas a pagar mientras comprobamos tu pedido.':'No se ha habilitado la guía para este pedido. Puedes consultar los detalles con soporte.';
    const delivery=paid?`<p class="payment-guide">${failedDelivery?'Tu compra está registrada, pero hubo un problema al preparar o enviar la guía. No necesitas volver a pagar. Ingresa a tu cuenta para comprobar si tu descarga está disponible y contacta con soporte si necesitas ayuda.':sent?'Hemos enviado un correo con el enlace a tu guía protegida y el acceso a tu cuenta. Revisa también Spam o Promociones.':'Estamos preparando tu guía protegida. Recibirás por email el enlace de descarga y el acceso a tu cuenta.'}</p><p>Entrega: ${escape(labels[result.delivery]||'En preparación')}. La contraseña del PDF está en tu cuenta. Si el enlace de acceso vence, puedes solicitar uno nuevo allí.</p>`:'';
    const waiting=result.status==='pending' || (paid && ['pending','processing','ready','queued'].includes(result.delivery));
    const automatic=waiting && checks<12;
    const state=result.status+'/'+result.delivery+'/'+automatic;
    if(view.dataset.paymentState!==state || !checks) {
      const restoreFocus=document.activeElement?.id==='checkPayment';
      view.innerHTML=shell(`${paid?`<div class="payment-welcome" aria-hidden="true">${lineIcon('check')}</div>`:''}<h1>${escape(headline)}</h1><p>${escape(detail)}</p>${delivery}<div class="account-actions"><a class="sales-cta" href="/cuenta/">${paid?'Acceder a mi guía y contraseña':'Ir a mi cuenta'}</a><button id="checkPayment" class="outline">Comprobar de nuevo</button></div><p><a href="${escape(support)}">Contactar con soporte</a></p><p id="returnMessage" role="status" aria-live="polite">${automatic?'Actualizamos el estado automáticamente durante un minuto.':waiting?'Puedes comprobar de nuevo o recuperar el acceso desde tu cuenta.':''}</p>${deliveryHelp(identifier)}`);
      view.dataset.paymentState=state;
      find('checkPayment').onclick=()=>void payment(view,id);
      if(restoreFocus)find('checkPayment').focus({preventScroll:true});
    }
    if(automatic) paymentTimer=setTimeout(()=>{if(id===renderId)void payment(view,id,checks+1);},5000);
  } catch(error) { if(id===renderId && request===paymentRequest) view.innerHTML=shell(`<h1>Estamos comprobando tu compra</h1><p>${escape((error as Error).message)}</p><p>No vuelvas a pagar si ya completaste el pago. Puedes recuperar el acceso desde tu cuenta o contactar con soporte.</p><a href="/pago/">Comprobar de nuevo</a> · <a href="/cuenta/">Ir a mi cuenta</a> · <a href="${escape(support)}">Soporte</a>${deliveryHelp()}`); }
}

export function renderCommercial(view: HTMLElement, force?: string): boolean {
  clearTimeout(paymentTimer);
  const hash=location.hash.split('?')[0];
  const path=force || (hash==='#/comprar'?'landing':hash==='#/cuenta'?'account':hash==='#/pago'?'payment':!hash&&__COMMERCE_LANDING__?'landing':'');
  const guard=__PREMIUM_GUARD__ && Date.now()>accessUntil && /^#\/(guide|plan)(\/|\?|$)/.test(location.hash);
  document.body.classList.toggle('commercial',!!path || guard);
  document.body.classList.toggle('sales-landing-view',path==='landing');
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
