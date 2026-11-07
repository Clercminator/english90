import base64
import copy
from datetime import timedelta
import hashlib
import hmac
import io
from http.client import HTTPConnection
from http.server import HTTPServer
import json
import runpy
import sys
from contextlib import redirect_stdout
import os
import time
from threading import Thread
import unittest
from unittest.mock import patch
from uuid import uuid4

import pikepdf
from svix.webhooks import Webhook
from server import commerce as c
from api.commerce import handler


ENV={'SITE_URL':'https://english90.imrtech.xyz','COMMERCE_ENABLED':'true','COMMERCE_ENV':'sandbox',
     'FULFILLMENT_SCHEDULER_READY':'true',
     'LEGAL_APPROVED':'true','MASTER_PDF_APPROVED':'true','MP_ACCESS_TOKEN':'TEST-fixture',
     'MP_MERCHANT_ID':'123','MP_APPLICATION_ID':'456','MP_WEBHOOK_SECRET':'fixture-only-secret',
     'MP_WEBHOOK_SECRET_PRUEBA':'fixture-only-secret',
     'SUPABASE_PROJECT_URL':'https://fixture.supabase.co','SUPABASE_SECRET_KEY':'fixture-only',
     'SUPABASE_PUBLISHABLE_KEY':'sb_publishable_fixture','RESEND_API_KEY':'fixture-only','RESEND_FROM':'English90 <test@example.com>',
     'RESEND_WEBHOOK_SECRET':'whsec_'+base64.b64encode(b'fixture-webhook-secret-32-bytes!!').decode(),
     'PDF_SECRET_KEY':base64.b64encode(bytes(range(32))).decode(),'GUIDE_VERSION':'test-fixture',
     'MASTER_PDF_PATH':'test/fixture.pdf','MASTER_PDF_SHA256':'0'*64,'CRON_SECRET':'fixture-only',
     'RATE_LIMIT_SECRET':'fixture-only','SUPPORT_EMAIL':'test@example.com'}


def order():
    return {'id':str(uuid4()),'mp_order_id':'ORDTST123','amount_clp':59990,'currency':'CLP','status':'pending',
            'product_id':c.SKU,'customer_email':'buyer@example.com','environment':'sandbox',
            'master_path':'test/fixture.pdf','master_sha256':'0'*64,'guide_version':'fixture'}


def remote(o):
    return {'id':o['mp_order_id'],'external_reference':o['id'],'user_id':'123','currency':'CLP','country_code':'CHL',
            'type':'online','integration_data':{'application_id':'456'},'version':1,'total_amount':'59990',
            'total_paid_amount':'59990','status':'processed','status_detail':'accredited',
            'items':[{'external_code':c.SKU,'quantity':1,'unit_price':'59990'}],
            'transactions':{'payments':[{'id':'PAY123','status':'processed','status_detail':'accredited','paid_amount':'59990'}]}}


class DB:
    def __init__(self,o=None):
        self.o=o or order(); self.url='https://fixture.supabase.co'; self.headers={}; self.calls=[]
        self.d=None; self.payloads=[]; self.uploads=[]; self.allowed=True; self.queries=[]

    def rpc(self,name,**params):
        self.calls.append((name,params))
        if name=='commerce_rate': return self.allowed
        if name=='commerce_lease':
            if self.o['status']!='paid' or not self.d or self.d['status'] in ('sent','delivered','bounced'): return []
            self.d['attempts']+=1; return [copy.deepcopy(self.d)]
        if name=='commerce_payment': return params['p_status']

    def rest(self,table,method='GET',data=None,**params):
        self.queries.append((table,params))
        if table=='products': return [{'price_clp':59990}]
        if table=='orders':
            if method=='POST': self.o={**data,'status':'pending'}
            if method=='PATCH': self.o.update(data)
            if 'checkout_key' in params and self.o.get('checkout_key')!=params['checkout_key'][3:]: return []
            return [copy.deepcopy(self.o)]
        if table=='guide_deliveries': return [copy.deepcopy(self.d)] if self.d else []
        if table=='email_events': return []
        return []

    def order(self,_id): return copy.deepcopy(self.o)
    def patch_delivery(self,_id,_lease,**values): self.d.update(values); return copy.deepcopy(self.d)
    def file(self,*_args): return self.master
    def upload(self,path,data): self.uploads.append((path,data))
    def sign(self,*_args): return 'https://fixture.supabase.co/private/signed-fixture'


class Commerce(unittest.TestCase):
    def setUp(self): self.env=patch.dict(os.environ,ENV); self.env.start()
    def tearDown(self): self.env.stop()

    def test_flags_fail_closed_and_isolate_credentials(self):
        c.enabled()
        for name,value in [('COMMERCE_ENABLED','false'),('LEGAL_APPROVED','false'),('MASTER_PDF_APPROVED','false'),
                           ('MP_ACCESS_TOKEN','APP-live'),('COMMERCE_ENV','production')]:
            with patch.dict(os.environ,{name:value}), self.assertRaises(c.Problem): c.enabled()

    def test_server_key_is_never_returned_as_public_config(self):
        with patch.dict(os.environ,{'SUPABASE_PUBLISHABLE_KEY':'sb_secret_fixture'}):
            response=c.dispatch('GET','config',{}, {},b'','ip')
            self.assertFalse(response['enabled']); self.assertEqual(response['supabaseKey'],'')

    def test_project_url_takes_precedence_and_supports_legacy_configuration(self):
        with patch.dict(os.environ, {'SUPABASE_URL':'https://legacy.supabase.co'}):
            self.assertEqual(c.Store().url, ENV['SUPABASE_PROJECT_URL'])
            self.assertEqual(c.dispatch('GET','config',{}, {},b'','ip')['supabaseUrl'], ENV['SUPABASE_PROJECT_URL'])
            with patch.dict(os.environ, {'SUPABASE_PROJECT_URL':''}):
                self.assertEqual(c.Store().url, 'https://legacy.supabase.co')

    def test_webhook_secrets_are_strictly_separated_by_environment(self):
        with patch.dict(os.environ, {'MP_WEBHOOK_SECRET':'production-only','MP_WEBHOOK_SECRET_PRUEBA':'test-only'}):
            self.assertEqual(c.env('MP_WEBHOOK_SECRET'),'test-only')
            with patch.dict(os.environ, {'MP_WEBHOOK_SECRET_PRUEBA':''}), self.assertRaises(c.Problem):
                c.env('MP_WEBHOOK_SECRET')
            with patch.dict(os.environ, {'COMMERCE_ENV':'production'}):
                self.assertEqual(c.env('MP_WEBHOOK_SECRET'),'production-only')

    def test_checkout_checks_provider_account_before_creating_order(self):
        with patch.dict(os.environ, {'MP_ACCESS_TOKEN':'APP_USR-fixture'}):
            for tags,merchant,site in [([], '123','MLC'),(['test_user'],'other','MLC'),(['test_user'],'123','MLA')]:
                with patch.object(c,'http',return_value={'id':merchant,'site_id':site,'tags':tags}) as provider:
                    with self.assertRaises(c.Problem): c.mp('POST','/v1/orders',{},'fixture')
                    self.assertEqual(provider.call_count,1)
            with patch.object(c,'http',side_effect=[{'id':'123','site_id':'MLC','tags':['test_user']},{'id':'ORDTST123'}]) as provider:
                self.assertEqual(c.mp('POST','/v1/orders',{},'fixture')['id'],'ORDTST123')
                self.assertEqual(provider.call_count,2)
            with patch.dict(os.environ, {'COMMERCE_ENV':'production'}), patch.object(c,'http',return_value={'id':'123','site_id':'MLC','tags':['test_user']}) as provider:
                with self.assertRaises(c.Problem): c.mp('POST','/v1/orders',{},'fixture')
                self.assertEqual(provider.call_count,1)

    def test_http_handler_config_no_cache_invalid_json_and_method_boundary(self):
        server=HTTPServer(('127.0.0.1',0),handler)
        thread=Thread(target=server.serve_forever,daemon=True); thread.start()
        try:
            conn=HTTPConnection('127.0.0.1',server.server_port,timeout=5)
            conn.request('GET','/api/commerce?action=config'); response=conn.getresponse()
            self.assertEqual(response.status,200); self.assertIn('no-store',response.getheader('Cache-Control'))
            payload=response.read().decode(); self.assertNotIn('fixture-only',payload)
            conn.request('POST','/api/commerce?action=checkout',body='invalid-json')
            response=conn.getresponse(); self.assertEqual(response.status,400); response.read()
            conn.request('GET','/api/commerce?action=password')
            response=conn.getresponse(); self.assertEqual(response.status,405); response.read(); conn.close()
        finally:
            server.shutdown(); server.server_close(); thread.join()

    def test_vercel_runtime_handle_request_hook_does_not_reenter_dispatch(self):
        instance=handler.__new__(handler)
        with patch.object(instance,'dispatch_commerce') as dispatch, patch.object(instance,'handle_request',create=True,side_effect=AssertionError('runtime hook reentered')):
            instance.do_GET()
            instance.do_POST()
            self.assertEqual(dispatch.call_count,2)

    def test_checkout_authoritative_price_consent_and_durable_key(self):
        db=DB(); body={'key':str(uuid4()),'token':'a'*43,'email':'BUYER@example.com','consent':True}
        def provider(_method,_path,payload,key):
            self.assertEqual(payload['total_amount'],'59990'); self.assertEqual(key,body['key'])
            self.assertEqual(payload['config']['online']['auto_return'],'all')
            self.assertNotIn('#',payload['config']['online']['success_url'])
            return {'id':'ORDTST123','external_reference':payload['external_reference'],'total_amount':'59990','currency':'CLP','user_id':'123',
                    'checkout_url':'https://www.mercadopago.cl/checkout/v1/redirect?order_id=ORDTST123'}
        with patch.object(c,'mp',side_effect=provider) as mock:
            first=c.checkout(db,body,'ip'); second=c.checkout(db,body,'ip')
            self.assertEqual(first,second); self.assertEqual(mock.call_count,1)
        for change in [{'amount':1},{'consent':False},{'email':'invalid'}]:
            with self.assertRaises(c.Problem): c.checkout(db,{**body,**change},'ip')

    def test_untrusted_checkout_url_rejected(self):
        for url in ['https://evil.test/checkout','https://www.mercadopago.cl/checkout/v1/redirect?order_id=another',
                    'https://www.mercadopago.cl@evil.test/checkout','http://www.mercadopago.cl/checkout/v1/redirect?order_id=ORDTST123']:
            with self.assertRaises(c.Problem): c.checkout_url({'id':'ORDTST123','checkout_url':url})

    def test_signature_documented_manifest_seconds_and_milliseconds(self):
        for ts in [str(int(time.time())),str(int(time.time()*1000))]:
            signature=hmac.new(ENV['MP_WEBHOOK_SECRET'].encode(),f'id:ordtst123;request-id:test;ts:{ts};'.encode(),hashlib.sha256).hexdigest()
            headers={'x-signature':f'ts={ts},v1={signature}','x-request-id':'test'}
            c.verify_mp_signature(headers,'ORDTST123')
            with self.assertRaises(c.Problem): c.verify_mp_signature(headers,'ORDTST124')
        for headers in [{},{'x-signature':'ts=1,v1=bad','x-request-id':'test'}]:
            with self.assertRaises(c.Problem): c.verify_mp_signature(headers,'ORDTST123')

    def test_payment_paid_pending_rejected_and_reversals(self):
        o=order(); r=remote(o); self.assertEqual(c.payment_state(r,o),'paid')
        for status,detail,expected in [('created','created','pending'),('processing','in_process','pending'),
             ('action_required','waiting_capture','pending'),('failed','rejected_by_issuer','failed'),('canceled','canceled','canceled'),
             ('processed','partially_refunded','refunded'),('refunded','refunded','refunded'),('charged_back','settled','disputed')]:
            self.assertEqual(c.payment_state({**r,'status':status,'status_detail':detail},o),expected)

    def test_payment_all_correlations_and_accreditation_checked(self):
        o=order(); r=remote(o)
        for field,value in [('total_amount','1'),('currency','USD'),('user_id','other'),('external_reference',str(uuid4())),
                            ('id','ORDlive'),('country_code','ARG'),('items',[]),('total_paid_amount','0'),
                            ('transactions',{'payments':[]}),('integration_data',{'application_id':'other'})]:
            with self.subTest(field=field), self.assertRaises(c.Problem): c.payment_state({**r,field:value},o)

    def test_success_redirect_cannot_write_payment(self):
        db=DB(); db.o['status_token_hash']=c.digest('token')
        result=c.dispatch('POST','status',{'origin':ENV['SITE_URL']},{},json.dumps({'order':db.o['id'],'token':'token','status':'paid'}).encode(),'ip',db)
        self.assertEqual(result['status'],'pending')
        self.assertFalse(any(name=='commerce_payment' for name,_ in db.calls))
        with self.assertRaises(c.Problem): c.dispatch('POST','status',{'origin':ENV['SITE_URL']},{},json.dumps({'order':db.o['id'],'token':'wrong'}).encode(),'ip',db)

    def test_auth_requires_independently_verified_identity(self):
        db=DB()
        for user in [{'id':str(uuid4()),'email':'buyer@example.com'}, {'id':str(uuid4()),'email_confirmed_at':'now','is_anonymous':True}]:
            with patch.object(c,'http',return_value=user), self.assertRaises(c.Problem): c.customer(db,{'authorization':'Bearer test'})
        user={'id':str(uuid4()),'email_confirmed_at':'now','email':'buyer@example.com'}
        with patch.object(c,'http',return_value=user): self.assertEqual(c.customer(db,{'authorization':'Bearer test'}),user)
        self.assertEqual(db.calls[-1],('commerce_claim',{'p_user':user['id']}))

    def test_buyer_cannot_access_other_pdf_or_reversed_purchase(self):
        db=DB(); db.o.update(user_id='buyer-a',status='paid'); db.d={'storage_path':'private/file'}
        with self.assertRaises(c.Problem): c.owned_delivery(db,{'id':'buyer-b'},db.o['id'])
        self.assertEqual(c.owned_delivery(db,{'id':'buyer-a'},db.o['id']),db.d)
        db.o['status']='refunded'
        with self.assertRaises(c.Problem): c.owned_delivery(db,{'id':'buyer-a'},db.o['id'])

    def test_actual_pdf_aes256_content_links_navigation_and_wrong_password(self):
        source=io.BytesIO()
        with pikepdf.new() as pdf:
            page=pdf.add_blank_page()
            page.Contents=pdf.make_stream(b'BT /F1 12 Tf 72 720 Td (Fixture only) Tj ET')
            page.Annots=pikepdf.Array([pikepdf.Dictionary(Type=pikepdf.Name.Annot,Subtype=pikepdf.Name.Link,
                Rect=pikepdf.Array([0,0,10,10]),A=pikepdf.Dictionary(S=pikepdf.Name.URI,URI='https://example.com'))])
            with pdf.open_outline() as outline: outline.root.append(pikepdf.OutlineItem('Fixture',0))
            pdf.save(source)
        passwords=[c.secrets.token_urlsafe(24) for _ in range(2)]
        self.assertNotEqual(*passwords)
        encrypted=c.protect_pdf(source.getvalue(),passwords[0])
        for incorrect in ['',passwords[1]]:
            with self.assertRaises(pikepdf.PasswordError): pikepdf.open(io.BytesIO(encrypted),password=incorrect)
        with pikepdf.open(io.BytesIO(encrypted),password=passwords[0]) as pdf:
            self.assertEqual(pdf.encryption.bits,256); self.assertEqual(pdf.encryption.R,6)
            self.assertIn(b'Fixture only',pdf.pages[0].Contents.read_bytes())
            self.assertEqual(str(pdf.pages[0].Annots[0].A.URI),'https://example.com')
            with pdf.open_outline() as outline: self.assertEqual(outline.root[0].title,'Fixture')
        protected=c.seal(passwords[0],'order-a'); self.assertNotIn(passwords[0],protected)
        self.assertEqual(c.unseal(protected,'order-a'),passwords[0])
        with self.assertRaises(Exception): c.unseal(protected,'order-b')

    def test_fulfillment_retries_without_reencrypting_or_duplicate_email(self):
        db=DB(); db.o['status']='paid'; data=io.BytesIO()
        with pikepdf.new() as pdf: pdf.add_blank_page(); pdf.save(data)
        db.master=data.getvalue(); db.o['master_sha256']=hashlib.sha256(db.master).hexdigest()
        db.d={'order_id':db.o['id'],'status':'pending','attempts':0,'email_attempt':0}
        sends=[]
        def provider(_method,url,**kwargs):
            if 'generate_link' in url: return {'action_link':'https://fixture.supabase.co/auth/verify?token=fixture'}
            sends.append(copy.deepcopy(kwargs))
            if len(sends)==1: raise c.Problem('provider_unavailable',502)
            return {'id':'email-fixture'}
        with patch.object(c,'http',side_effect=provider):
            c.fulfillment(db,db.o['id']); self.assertEqual(db.o['status'],'paid'); self.assertEqual(db.d['status'],'failed')
            c.fulfillment(db,db.o['id']); c.fulfillment(db,db.o['id'])
        self.assertEqual(len(db.uploads),1); self.assertEqual(len(sends),2); self.assertEqual(sends[0],sends[1])
        self.assertEqual(db.d['status'],'sent'); self.assertNotIn('delivered_at',db.d)
        password=c.unseal(db.d['password_ciphertext'],db.o['id'])
        self.assertNotIn(password,json.dumps(db.d['email_payload']))

    def test_unpaid_and_bounced_deliveries_not_automatically_sent(self):
        db=DB(); db.d={'status':'pending'}
        with patch.object(c,'http') as request: c.fulfillment(db,db.o['id']); request.assert_not_called()

    def test_email_signature_and_events(self):
        payload=json.dumps({'type':'email.delivered','created_at':c.stamp(),'data':{'email_id':'mail'}})
        hook=Webhook(ENV['RESEND_WEBHOOK_SECRET']); timestamp=c.now()
        headers={'svix-id':'fixture-event','svix-timestamp':str(int(timestamp.timestamp())),
                 'svix-signature':hook.sign('fixture-event',timestamp,payload)}
        c.email_webhook(DB(),headers,payload.encode())
        with self.assertRaises(c.Problem): c.email_webhook(DB(),headers,b'{}')

    def test_old_ambiguous_email_stops_before_provider_dedupe_expires(self):
        db=DB(); db.o['status']='paid'; db.d={'status':'queued','attempts':1,'email_attempt':0,'storage_path':'file',
            'email_payload':{'html':'fixture'},'email_started_at':(c.now()-timedelta(hours=25)).isoformat()}
        with patch.object(c,'http') as request: c.fulfillment(db,db.o['id']); request.assert_not_called()
        self.assertEqual(db.d['last_error_code'],'email_outcome_requires_review')

    def test_confirmed_email_failure_never_becomes_sent_by_replaying_old_key(self):
        db=DB(); db.o['status']='paid'
        db.d={'status':'failed','attempts':1,'email_id':'known-failed-message','email_attempt':0,
              'storage_path':'file','last_error_code':'email.failed'}
        # Even if a stale worker acquired a lease, it must not replay this message.
        with patch.object(c,'http') as request:
            c.fulfillment(db,db.o['id']); request.assert_not_called()
        self.assertEqual(db.d['status'],'failed')
        self.assertEqual(db.d['last_error_code'],'email.failed')

    def test_worker_excludes_reversed_leased_and_confirmed_send_rows_before_limit(self):
        db=DB()
        with patch.object(c,'reconcile',return_value='pending'):
            c.operate(db,{'authorization':'Bearer '+ENV['CRON_SECRET']},{})
        query=next(params for table,params in db.queries if table=='guide_deliveries')
        self.assertEqual(query['orders.status'],'eq.paid')
        self.assertIn('!inner',query['select'])
        self.assertEqual(query['email_id'],'is.null')
        self.assertIn('lease_until.lt.',query['or'])

    def test_owner_recovery_sends_optional_preview_header_without_printing_it(self):
        output=io.StringIO()
        with patch.dict(os.environ,{'VERCEL_AUTOMATION_BYPASS_SECRET':'fixture-private-bypass'}), \
             patch.object(sys,'argv',['commerce-ops.py','run']), \
             patch('requests.post') as request, redirect_stdout(output):
            request.return_value.ok=True; request.return_value.text='{"processed":0}'
            runpy.run_path('scripts/commerce-ops.py',run_name='__main__')
        self.assertEqual(request.call_args.kwargs['headers']['x-vercel-protection-bypass'],'fixture-private-bypass')
        self.assertNotIn('fixture-private-bypass',output.getvalue())


if __name__=='__main__': unittest.main()
