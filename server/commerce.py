"""Trusted commercial boundary. No customer data, signed URLs or secrets in logs."""
import base64
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
import hashlib
import hmac
import html
import io
import json
import os
import re
import secrets
import time
from urllib.parse import urlencode, urlparse, parse_qs, quote
from uuid import UUID, uuid4

import pikepdf
import requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from svix.webhooks import Webhook, WebhookVerificationError

SKU = 'english90-premium'
PRICE = 59990
TERMS = '2026-11-06'
MAX_PDF = 35 * 1024 * 1024


class Problem(Exception):
    def __init__(self, code, status=400):
        super().__init__(code)
        self.code, self.status = code, status


def env(name):
    value = os.environ.get(name, '')
    if name == 'SUPABASE_PROJECT_URL':
        value = value or os.environ.get('SUPABASE_URL', '')
    if name == 'MP_WEBHOOK_SECRET' and os.environ.get('COMMERCE_ENV') == 'sandbox':
        value = os.environ.get('MP_WEBHOOK_SECRET_PRUEBA', '')
    if not value:
        raise Problem('configuration_missing', 503)
    return value


def now():
    return datetime.now(timezone.utc)


def stamp():
    return now().isoformat()


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def email(value):
    if not isinstance(value, str) or len(value) > 254 or not re.fullmatch(r'[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+', value):
        raise Problem('invalid_email')
    return value.lower()


def uuid(value):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError):
        raise Problem('invalid_identifier') from None


def site():
    value = env('SITE_URL')
    u = urlparse(value)
    if u.scheme != 'https' or u.path not in ('', '/') or u.username or u.query or u.fragment:
        raise Problem('configuration_invalid', 503)
    return value.rstrip('/')


def public_auth_key():
    key=os.environ.get('SUPABASE_PUBLISHABLE_KEY','')
    if key.startswith('sb_publishable_'):
        return key
    try:
        claims=key.split('.')[1]
        if json.loads(base64.urlsafe_b64decode(claims+'='*(-len(claims)%4))).get('role')=='anon':
            return key
    except (ValueError,IndexError,TypeError):
        pass
    return ''


def enabled():
    if os.environ.get('COMMERCE_ENABLED') != 'true':
        raise Problem('sales_disabled', 503)
    mode = env('COMMERCE_ENV')
    if mode not in ('sandbox', 'production'):
        raise Problem('configuration_invalid', 503)
    fixture = mode == 'sandbox' and os.environ.get('SANDBOX_TEST_MODE') == 'true'
    if fixture and (os.environ.get('VERCEL_ENV') != 'preview' or
                    env('MASTER_PDF_PATH') != 'sandbox/noncommercial-fixture-v1.pdf' or
                    env('GUIDE_VERSION') != 'sandbox-fixture-v1'):
        raise Problem('sandbox_fixture_required', 503)
    if fixture:
        email(env('SANDBOX_BUYER_EMAIL'))
    flags = ('FULFILLMENT_SCHEDULER_READY',) if fixture else ('LEGAL_APPROVED', 'MASTER_PDF_APPROVED', 'FULFILLMENT_SCHEDULER_READY')
    for flag in flags:
        if os.environ.get(flag) != 'true':
            raise Problem('sales_not_ready', 503)
    if mode == 'production' and (os.environ.get('LIVE_SALES_APPROVED') != 'true' or os.environ.get('VERCEL_ENV') != 'production'):
        raise Problem('live_sales_disabled', 503)
    if mode == 'sandbox' and not env('MP_ACCESS_TOKEN').startswith(('TEST-', 'APP_USR-')):
        raise Problem('sandbox_credentials_required', 503)
    if mode == 'production' and env('MP_ACCESS_TOKEN').startswith('TEST-'):
        raise Problem('production_credentials_required', 503)
    for name in ('SUPABASE_PROJECT_URL','SUPABASE_SECRET_KEY','SUPABASE_PUBLISHABLE_KEY','MP_MERCHANT_ID','MP_APPLICATION_ID',
                 'MP_WEBHOOK_SECRET','RESEND_API_KEY','RESEND_FROM','RESEND_WEBHOOK_SECRET',
                 'PDF_SECRET_KEY','GUIDE_VERSION','MASTER_PDF_PATH','MASTER_PDF_SHA256',
                 'CRON_SECRET','RATE_LIMIT_SECRET','SUPPORT_EMAIL'):
        env(name)
    if len(base64.b64decode(env('PDF_SECRET_KEY'), validate=True)) != 32 or not re.fullmatch('[a-f0-9]{64}',env('MASTER_PDF_SHA256')):
        raise Problem('configuration_invalid',503)
    email(env('SUPPORT_EMAIL'))
    if not public_auth_key():
        raise Problem('publishable_key_required',503)
    site()


def http(method, url, *, headers=None, data=None, raw=False):
    try:
        response = requests.request(method, url, headers=headers, json=None if isinstance(data, bytes) else data,
                                    data=data if isinstance(data, bytes) else None, timeout=(5, 35))
        if not response.ok:
            raise Problem('provider_unavailable', 502)
        if raw:
            if len(response.content) > MAX_PDF:
                raise Problem('document_too_large', 503)
            return response.content
        return response.json() if response.content else None
    except (requests.RequestException, ValueError):
        raise Problem('provider_unavailable', 502) from None


class Store:
    def __init__(self):
        self.url = env('SUPABASE_PROJECT_URL').rstrip('/')
        self.headers = {'apikey':env('SUPABASE_SECRET_KEY'), 'Authorization':'Bearer '+env('SUPABASE_SECRET_KEY')}

    def rest(self, table, method='GET', data=None, **params):
        return http(method, self.url+'/rest/v1/'+table+'?'+urlencode(params),
                    headers={**self.headers,'Prefer':'return=representation'}, data=data)

    def rpc(self, name, **args):
        return http('POST',self.url+'/rest/v1/rpc/'+name,headers=self.headers,data=args)

    def order(self, identifier):
        rows = self.rest('orders',id='eq.'+uuid(identifier))
        if not rows:
            raise Problem('order_not_found',404)
        return rows[0]

    def patch_delivery(self, identifier, lease, **values):
        rows = self.rest('guide_deliveries','PATCH',values,order_id='eq.'+identifier,lease_id='eq.'+lease)
        if not rows:
            raise Problem('lease_lost',409)
        return rows[0]

    def file(self, bucket, path):
        return http('GET',self.url+'/storage/v1/object/'+bucket+'/'+quote(path,safe='/'),headers=self.headers,raw=True)

    def upload(self, path, content):
        return http('POST',self.url+'/storage/v1/object/english90-buyers/'+quote(path,safe='/'),
                    headers={**self.headers,'Content-Type':'application/pdf','x-upsert':'false'},data=content)

    def sign(self, path, seconds=300):
        result = http('POST',self.url+'/storage/v1/object/sign/english90-buyers/'+quote(path,safe='/'),
                      headers=self.headers,data={'expiresIn':seconds})
        return self.url+'/storage/v1'+result['signedURL']


def rate(db, identity, action, limit=10, seconds=600):
    key = hmac.new(env('RATE_LIMIT_SECRET').encode(), (action+':'+identity).encode(),hashlib.sha256).hexdigest()
    if not db.rpc('commerce_rate',p_key=key,p_limit=limit,p_seconds=seconds):
        raise Problem('rate_limited',429)


def mp(method, path, data=None, key=None):
    headers = {'Authorization':'Bearer '+env('MP_ACCESS_TOKEN')}
    if method == 'POST' and path == '/v1/orders':
        account = http('GET', 'https://api.mercadopago.com/users/me', headers=headers)
        if str(account.get('id')) != env('MP_MERCHANT_ID') or account.get('site_id') != 'MLC':
            raise Problem('payment_account_mismatch', 503)
        is_test = 'test_user' in account.get('tags', [])
        if is_test != (env('COMMERCE_ENV') == 'sandbox'):
            raise Problem('payment_environment_mismatch', 503)
    if key:
        headers['X-Idempotency-Key']=key
    return http(method,'https://api.mercadopago.com'+path,headers=headers,data=data)


def checkout_url(result):
    value = result.get('checkout_url','')
    u = urlparse(value)
    if u.scheme!='https' or u.hostname!='www.mercadopago.cl' or u.username or u.port not in (None,443) or u.path!='/checkout/v1/redirect' or parse_qs(u.query).get('order_id')!=[result.get('id')]:
        raise Problem('invalid_checkout_response',502)
    return value


def checkout(db, body, ip):
    enabled()
    buyer = email(body.get('email'))
    if os.environ.get('COMMERCE_ENV') == 'sandbox' and os.environ.get('SANDBOX_TEST_MODE') == 'true' and buyer != email(env('SANDBOX_BUYER_EMAIL')):
        raise Problem('sandbox_buyer_required',403)
    if body.get('consent') is not True:
        raise Problem('consent_required')
    if set(body)-{'email','consent','key','token','attribution'}:
        raise Problem('unexpected_checkout_fields')
    key = uuid(body.get('key'))
    token = body.get('token','')
    if not isinstance(token,str) or not re.fullmatch(r'[A-Za-z0-9_-]{43,86}',token):
        raise Problem('invalid_status_token')
    rate(db,ip,'checkout')
    rate(db,buyer,'checkout-email',5)
    products = db.rest('products',id='eq.'+SKU,active='eq.true')
    if not products or products[0]['price_clp']!=PRICE:
        raise Problem('product_unavailable',503)
    rows = db.rest('orders',checkout_key='eq.'+key)
    if rows:
        order = rows[0]
        if order['customer_email']!=buyer or not hmac.compare_digest(order['status_token_hash'],digest(token)) or order['environment']!=env('COMMERCE_ENV'):
            raise Problem('checkout_conflict',409)
        if order['status']!='pending':
            raise Problem('checkout_already_completed',409)
        if order.get('checkout_url'):
            return {'url':order['checkout_url'],'order':order['id']}
    else:
        attribution = body.get('attribution',{})
        if not isinstance(attribution,dict):
            raise Problem('invalid_attribution')
        attribution = {k:str(v)[:160] for k,v in attribution.items() if k in ('utm_source','utm_medium','utm_campaign','utm_content','utm_term')}
        order = {'id':str(uuid4()),'checkout_key':key,'status_token_hash':digest(token),'customer_email':buyer,
                 'product_id':SKU,'amount_clp':PRICE,'currency':'CLP','environment':env('COMMERCE_ENV'),
                 'guide_version':env('GUIDE_VERSION'),'master_path':env('MASTER_PDF_PATH'),
                 'master_sha256':env('MASTER_PDF_SHA256'),'attribution':attribution,'terms_version':TERMS}
        try:
            order = db.rest('orders','POST',order)[0]
        except Problem:
            # Concurrent insert: recover only the same buyer and bearer capability.
            rows = db.rest('orders',checkout_key='eq.'+key)
            if not rows or rows[0]['customer_email']!=buyer or not hmac.compare_digest(rows[0]['status_token_hash'],digest(token)):
                raise
            order=rows[0]
    return_url = site()+'/pago?order='+order['id']
    result = mp('POST','/v1/orders',{
        'type':'online','processing_mode':'manual','total_amount':str(PRICE),'external_reference':order['id'],
        'payer':{'email':buyer},'items':[{'external_code':SKU,'title':'English90 Premium','unit_price':str(PRICE),'quantity':1}],
        'config':{'online':{'success_url':return_url,'pending_url':return_url,'failure_url':return_url,'auto_return':'all'}}},key)
    url = checkout_url(result)
    if result.get('external_reference')!=order['id'] or result.get('currency')!='CLP' or Decimal(result.get('total_amount','0'))!=PRICE or str(result.get('user_id'))!=env('MP_MERCHANT_ID'):
        raise Problem('invalid_checkout_response',502)
    db.rest('orders','PATCH',{'mp_order_id':result['id'],'checkout_url':url},id='eq.'+order['id'])
    return {'url':url,'order':order['id']}


def verify_mp_signature(headers, resource):
    try:
        parts = dict(piece.strip().split('=',1) for piece in headers.get('x-signature','').split(','))
        ts, signature = parts['ts'], parts['v1']
        timestamp = int(ts)
        if timestamp > 10**11:
            timestamp /= 1000
        if abs(time.time()-timestamp)>300 or not re.fullmatch(r'[A-Za-z0-9]+',resource):
            raise ValueError()
        request_id = headers['x-request-id']
        manifest = f'id:{resource.lower()};request-id:{request_id};ts:{ts};'
        expected = hmac.new(env('MP_WEBHOOK_SECRET').encode(),manifest.encode(),hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected,signature):
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise Problem('invalid_signature',401) from None


def money(value):
    try:
        n=Decimal(str(value))
        if not n.is_finite():
            raise ValueError()
        return n
    except (InvalidOperation,ValueError):
        raise Problem('payment_mismatch',409) from None


def payment_state(remote, order):
    if (remote.get('id')!=order['mp_order_id'] or remote.get('external_reference')!=order['id'] or
        str(remote.get('user_id'))!=env('MP_MERCHANT_ID') or remote.get('currency')!='CLP' or
        remote.get('country_code')!='CHL' or remote.get('type')!='online' or
        str(remote.get('integration_data',{}).get('application_id'))!=env('MP_APPLICATION_ID') or
        money(remote.get('total_amount'))!=order['amount_clp']):
        raise Problem('payment_mismatch',409)
    # Orders test IDs are explicitly ORDTST; merchant/app isolation is also mandatory.
    if remote['id'].startswith('ORDTST') != (order['environment']=='sandbox'):
        raise Problem('payment_environment_mismatch',409)
    items=remote.get('items',[])
    if len(items)!=1 or items[0].get('external_code')!=SKU or items[0].get('quantity')!=1 or money(items[0].get('unit_price'))!=PRICE:
        raise Problem('payment_product_mismatch',409)
    status, detail = remote.get('status'), remote.get('status_detail')
    payments=remote.get('transactions',{}).get('payments',[])
    if status=='refunded' or detail in ('partially_refunded','refunded') or any(p.get('status')=='refunded' or p.get('status_detail') in ('partially_refunded','refunded') for p in payments):
        return 'refunded'
    if status in ('charged_back','disputed') or detail in ('charged_back','in_dispute') or any(p.get('status') in ('charged_back','disputed') for p in payments):
        return 'disputed'
    if status=='processed' and detail=='accredited':
        accredited=[p for p in payments if p.get('status')=='processed' and p.get('status_detail')=='accredited']
        if (not accredited or money(remote.get('total_paid_amount'))!=PRICE or
            sum((money(p.get('paid_amount')) for p in accredited),Decimal(0))!=PRICE or
            any(money(p.get('refunded_amount',0))>0 for p in payments)):
            raise Problem('payment_not_accredited',409)
        return 'paid'
    return {'failed':'failed','canceled':'canceled'}.get(status,'pending')


def reconcile(db, order):
    remote=mp('GET','/v1/orders/'+quote(order['mp_order_id'],safe=''))
    state=payment_state(remote,order)
    # Current Orders resources expose version; the timestamp fallback is for older payloads.
    revision=remote.get('version')
    if revision is None:
        revision=int(datetime.fromisoformat(remote['last_updated_date'].replace('Z','+00:00')).timestamp()*1000000)
    return db.rpc('commerce_payment',p_order=order['id'],p_mp_id=order['mp_order_id'],p_revision=revision,
                  p_event=f"{order['mp_order_id']}:{revision}:{remote.get('status')}:{remote.get('status_detail')}",
                  p_status=state,p_provider_status=f"{remote.get('status')}/{remote.get('status_detail')}")


def payment_webhook(db, headers, query, body):
    resource=query.get('data.id',[''])[0]
    verify_mp_signature(headers,resource)
    if body.get('type')!='order' or body.get('data',{}).get('id')!=resource or str(body.get('user_id'))!=env('MP_MERCHANT_ID') or str(body.get('application_id'))!=env('MP_APPLICATION_ID'):
        raise Problem('notification_mismatch',409)
    if body.get('live_mode') is not (env('COMMERCE_ENV')=='production'):
        raise Problem('payment_environment_mismatch',409)
    rows=db.rest('orders',mp_order_id='eq.'+resource)
    if not rows:
        # Creation may still be saving its provider ID. Return retryable failure.
        raise Problem('order_not_ready',503)
    reconcile(db,rows[0])
    fulfillment(db,rows[0]['id'])
    # Work remains durable on failure; no unawaited background task.
    return {'received':True}


def seal(password, order_id):
    nonce=secrets.token_bytes(12)
    encrypted=AESGCM(base64.b64decode(env('PDF_SECRET_KEY'),validate=True)).encrypt(nonce,password.encode(),order_id.encode())
    return base64.b64encode(nonce+encrypted).decode()


def unseal(value, order_id):
    raw=base64.b64decode(value)
    return AESGCM(base64.b64decode(env('PDF_SECRET_KEY'),validate=True)).decrypt(raw[:12],raw[12:],order_id.encode()).decode()


def protect_pdf(master, password):
    if len(master)>MAX_PDF:
        raise Problem('document_too_large',503)
    output=io.BytesIO()
    with pikepdf.open(io.BytesIO(master)) as pdf:
        pages=len(pdf.pages)
        pdf.save(output,encryption=pikepdf.Encryption(user=password,owner=secrets.token_urlsafe(48),R=6,aes=True,metadata=True))
    data=output.getvalue()
    try:
        with pikepdf.open(io.BytesIO(data)):
            raise Problem('pdf_not_protected',500)
    except pikepdf.PasswordError:
        pass
    with pikepdf.open(io.BytesIO(data),password=password) as check:
        if len(check.pages)!=pages or check.encryption.R!=6 or check.encryption.bits!=256:
            raise Problem('pdf_verification_failed',500)
    return data


def validated_activation_link(db, activation):
    value = activation.get('action_link') or activation.get('properties',{}).get('action_link')
    if not isinstance(value,str):
        raise Problem('activation_link_failed',502)
    link = urlparse(value)
    if (link.scheme != 'https' or link.netloc != urlparse(db.url).netloc or link.path != '/auth/v1/verify' or
        parse_qs(link.query).get('redirect_to') != [site()+'/cuenta/']):
        raise Problem('activation_redirect_not_allowed',503)
    return value


def fulfillment(db, order_id):
    lease=str(uuid4())
    rows=db.rpc('commerce_lease',p_order=order_id,p_lease=lease)
    if not rows:
        return
    delivery=rows[0]
    # Provider-confirmed failed sends require an explicit new email attempt.
    # Replaying their old idempotency key would return the old message, not resend.
    if delivery.get('email_id'):
        db.patch_delivery(order_id,lease,lease_id=None,lease_until=None)
        return
    try:
        order=db.order(order_id)
        if order['status']!='paid':
            return
        if not delivery.get('storage_path'):
            master=db.file('english90-master',order['master_path'])
            if hashlib.sha256(master).hexdigest()!=order['master_sha256']:
                raise Problem('master_digest_mismatch',503)
            password=secrets.token_urlsafe(24)
            content=protect_pdf(master,password)
            path=order_id+'/'+str(uuid4())+'.pdf'
            db.upload(path,content)
            delivery=db.patch_delivery(order_id,lease,storage_path=path,password_ciphertext=seal(password,order_id),status='ready')
        if not delivery.get('email_payload'):
            # generate_link handles existing/new accounts; only opening the link verifies ownership.
            activation=http('POST',db.url+'/auth/v1/admin/generate_link?'+urlencode({'redirect_to':site()+'/cuenta/'}),headers=db.headers,
                            data={'type':'magiclink','email':order['customer_email']})
            action_link=validated_activation_link(db,activation)
            url=db.sign(delivery['storage_path'],86400)
            account=site()+'/cuenta'
            test = order['environment'] == 'sandbox'
            notice = '<p><strong>PRUEBA SANDBOX: no es una compra real. El PDF es una muestra técnica sin contenido comercial.</strong></p>' if test else ''
            message=f'''<html lang="es"><body><h1>English90 · {'Compra de prueba confirmada' if test else 'Tu compra está confirmada'}</h1>{notice}
<p>Pago único: $59.990 CLP. Gracias por elegir una ruta de estudio a tu ritmo.</p>
<p><a href="{html.escape(url,quote=True)}">Descargar tu guía protegida</a> (enlace válido durante 24 horas).</p>
<p><a href="{html.escape(action_link,quote=True)}">Activar o ingresar a mi cuenta</a>. Este enlace es de un solo uso.</p>
<p>En tu cuenta encontrarás la contraseña para abrir el PDF y podrás volver a descargarlo.
La contraseña no se envía por correo. Si el enlace de acceso venció, solicita otro en <a href="{account}">Mi cuenta</a>.</p>
<p>La práctica se guarda en tu navegador, sin sincronización entre dispositivos.</p>
<p>Soporte: {html.escape(env('SUPPORT_EMAIL'))} · IMR Tech SpA</p></body></html>'''
            payload={'from':env('RESEND_FROM'),'to':[order['customer_email']],'subject':'[SANDBOX] English90 · PDF de prueba y acceso' if test else 'Tu guía English90 y acceso a tu cuenta','html':message,
                     'tags':[{'name':'order_id','value':order_id}]}
            delivery=db.patch_delivery(order_id,lease,email_payload=payload,email_started_at=stamp(),status='queued')
        started=datetime.fromisoformat(delivery['email_started_at'].replace('Z','+00:00'))
        if now()-started>timedelta(hours=23):
            # Provider dedupe expires at 24h: ambiguous sends require owner reconciliation.
            raise Problem('email_outcome_requires_review',409)
        if db.order(order_id)['status']!='paid':
            raise Problem('order_reversed',409)
        sent=http('POST','https://api.resend.com/emails',headers={'Authorization':'Bearer '+env('RESEND_API_KEY'),
                  'Idempotency-Key':f"english90-delivery/{order_id}/{delivery['email_attempt']}"},data=delivery['email_payload'])
        db.patch_delivery(order_id,lease,email_id=sent['id'],status='sent',sent_at=stamp(),last_error_code=None,lease_id=None,lease_until=None)
        db.rpc('commerce_email_events')
    except Exception as error:
        code=error.code if isinstance(error,Problem) else 'fulfillment_step_failed'
        db.patch_delivery(order_id,lease,status='failed',last_error_code=code,lease_id=None,lease_until=None,
                          next_attempt_at=(now()+timedelta(minutes=min(360,2**min(delivery['attempts'],8)))).isoformat())


def customer(db, headers):
    bearer=headers.get('authorization','')
    if not bearer.startswith('Bearer '):
        raise Problem('authentication_required',401)
    try:
        user=http('GET',db.url+'/auth/v1/user',headers={'apikey':env('SUPABASE_PUBLISHABLE_KEY'),'Authorization':bearer})
    except Problem:
        raise Problem('authentication_required',401) from None
    if not user.get('email_confirmed_at') or user.get('is_anonymous'):
        raise Problem('verified_email_required',403)
    db.rpc('commerce_claim',p_user=user['id'])
    return user


def owned_delivery(db, user, identifier):
    order=db.order(identifier)
    if order.get('user_id')!=user['id'] or order['status']!='paid':
        raise Problem('purchase_required',403)
    rows=db.rest('guide_deliveries',order_id='eq.'+order['id'])
    if not rows or not rows[0].get('storage_path'):
        raise Problem('guide_processing',409)
    return rows[0]


def email_webhook(db, headers, raw):
    try:
        event=Webhook(env('RESEND_WEBHOOK_SECRET')).verify(raw,headers)
    except (WebhookVerificationError,ValueError):
        raise Problem('invalid_signature',401) from None
    if event.get('type') not in ('email.sent','email.delivered','email.bounced','email.failed','email.delivery_delayed'):
        return {'received':True}
    db.rest('email_events','POST',{'id':headers['svix-id'],'email_id':event['data']['email_id'],
            'event_type':event['type'],'event_at':event['created_at']},on_conflict='id') if not db.rest('email_events',id='eq.'+headers['svix-id']) else None
    db.rpc('commerce_email_events')
    return {'received':True}


def operate(db, headers, body):
    if not hmac.compare_digest(headers.get('authorization',''),'Bearer '+env('CRON_SECRET')):
        raise Problem('forbidden',403)
    # Recovery is available even while new sales are disabled.
    if body.get('order'):
        identifier=uuid(body['order'])
        order=db.order(identifier)
        if order.get('mp_order_id'):
            reconcile(db,order)
        if body.get('retry'):
            db.rest('guide_deliveries','PATCH',{'next_attempt_at':stamp()},order_id='eq.'+identifier)
        if body.get('resend'):
            deliveries=db.rest('guide_deliveries',order_id='eq.'+identifier)
            if not deliveries or deliveries[0]['status'] not in ('failed','bounced') or not deliveries[0].get('email_id'):
                raise Problem('resend_requires_confirmed_failure',409)
            delivery=deliveries[0]
            if delivery.get('lease_until') and datetime.fromisoformat(delivery['lease_until'].replace('Z','+00:00'))>now():
                raise Problem('delivery_busy',409)
            db.rest('guide_deliveries','PATCH',{'status':'ready','email_attempt':delivery['email_attempt']+1,'email_id':None,
                    'email_payload':None,'email_started_at':None,'email_event_at':None,'next_attempt_at':stamp()},
                    order_id='eq.'+identifier,email_attempt='eq.'+str(delivery['email_attempt']))
        fulfillment(db,identifier)
        return {'processed':1}
    # Reconcile recent orders plus paid orders indefinitely to catch missed reversals.
    orders=db.rest('orders',select='*',mp_order_id='not.is.null',order='updated_at.asc',limit='2')
    for order in orders:
        try:
            reconcile(db,order)
            # Touch even unchanged revisions so reconciliation rotates fairly.
            db.rest('orders','PATCH',{'updated_at':stamp()},id='eq.'+order['id'])
        except Problem:
            continue
    deliveries=db.rest('guide_deliveries',select='order_id,orders!inner(status)',status='in.(pending,processing,ready,queued,failed)',
                        email_id='is.null',next_attempt_at='lte.'+stamp(),
                        order='next_attempt_at.asc',limit='1',**{'orders.status':'eq.paid',
                        'or':f'(lease_until.is.null,lease_until.lt.{stamp()})'})
    for delivery in deliveries:
        fulfillment(db,delivery['order_id'])
    db.rpc('commerce_email_events')
    return {'processed':len(deliveries)}


def dispatch(method, action, headers, query, raw, ip, db=None):
    if action=='config' and method=='GET':
        ready=True
        try:
            enabled()
        except Exception:
            ready=False
        return {'enabled':ready,'price':PRICE,'currency':'CLP','environment':os.environ.get('COMMERCE_ENV','sandbox'),
                'supabaseUrl':os.environ.get('SUPABASE_PROJECT_URL') or os.environ.get('SUPABASE_URL',''),'supabaseKey':public_auth_key()}
    db=db or Store()
    if action=='operations' and method in ('GET','POST'):
        return operate(db,headers,json.loads(raw or b'{}'))
    if method!='POST':
        raise Problem('method_not_allowed',405)
    if action=='email-webhook':
        return email_webhook(db,headers,raw)
    body=json.loads(raw or b'{}')
    if not isinstance(body,dict):
        raise Problem('invalid_input')
    if action=='mp-webhook':
        return payment_webhook(db,headers,query,body)
    origin=headers.get('origin')
    if origin!=site():
        raise Problem('origin_not_allowed',403)
    if action=='checkout':
        return checkout(db,body,ip)
    if action=='status':
        rate(db,ip,'status',60)
        order=db.order(body.get('order'))
        token=body.get('token','')
        if not isinstance(token,str) or not hmac.compare_digest(digest(token),order['status_token_hash']):
            raise Problem('forbidden',403)
        deliveries=db.rest('guide_deliveries',select='status',order_id='eq.'+order['id'])
        return {'status':order['status'],'delivery':deliveries[0]['status'] if deliveries else 'pending'}
    if action=='login':
        buyer=email(body.get('email'))
        rate(db,ip,'login',5)
        rate(db,buyer,'login-email',3)
        http('POST',db.url+'/auth/v1/otp?'+urlencode({'redirect_to':site()+'/cuenta/'}),headers={'apikey':env('SUPABASE_PUBLISHABLE_KEY')},
             data={'email':buyer,'create_user':True,'gotrue_meta_security':{'captcha_token':body.get('captchaToken')}})
        return {'requested':True}
    rate(db,ip,'account',60)
    user=customer(db,headers)
    if action=='account':
        return {'email':user['email'],'orders':db.rest('orders',select='id,status,amount_clp,created_at',user_id='eq.'+user['id']),
                'entitled':bool(db.rest('entitlements',select='id',user_id='eq.'+user['id'],status='eq.active',product_id='eq.'+SKU)),
                'deliveries':db.rest('guide_deliveries',select='order_id,status,guide_version',user_id='eq.'+user['id'])}
    if action in ('download','password'):
        rate(db,user['id'],action,10)
        delivery=owned_delivery(db,user,body.get('order'))
        if action=='download':
            return {'url':db.sign(delivery['storage_path'])}
        return {'password':unseal(delivery['password_ciphertext'],delivery['order_id'])}
    raise Problem('not_found',404)
