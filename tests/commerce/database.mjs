import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
grant usage on schema auth to authenticated,service_role;
create table storage.buckets(id text primary key,name text,public boolean);
`);
for(const migration of (await readdir('supabase/migrations')).filter(p=>p.endsWith('.sql')).sort()) {
  await db.exec(await readFile(`supabase/migrations/${migration}`,'utf8'));
}
const a='00000000-0000-4000-8000-000000000001', b='00000000-0000-4000-8000-000000000002';
const o='00000000-0000-4000-8000-000000000003';
await db.query(`insert into auth.users(id,email,email_confirmed_at) values($1,'a@example.com',now()),($2,'b@example.com',now())`,[a,b]);
await db.query(`insert into public.orders(id,checkout_key,status_token_hash,customer_email,product_id,amount_clp,currency,environment,guide_version,master_path,master_sha256,terms_version,mp_order_id)
 values($1,$1,'hash','a@example.com','english90-premium',59990,'CLP','sandbox','fixture','fixture.pdf','hash','fixture','ORDTST123')`,[o]);
const payment = async (rev,status) => (await db.query(`select commerce_payment($1,'ORDTST123',$2,$3,$4,$4) as status`,[o,rev,`event-${rev}-${status}`,status])).rows[0].status;
assert.equal(await payment(1,'pending'),'pending');
assert.equal((await db.query('select * from entitlements')).rows.length,0);
assert.equal(await payment(2,'paid'),'paid');
assert.equal(await payment(2,'paid'),'paid');
assert.equal(await payment(1,'pending'),'paid');
assert.equal((await db.query('select * from entitlements')).rows.length,1);
assert.equal((await db.query('select * from guide_deliveries')).rows.length,1);
await db.exec('set role service_role');
await assert.rejects(()=>db.query('select email from auth.users'),/permission denied/);
await db.query('select commerce_claim($1)',[b]);
assert.equal((await db.query('select user_id from orders')).rows[0].user_id,null);
await db.query('select commerce_claim($1)',[a]);
await db.exec('reset role');
assert.equal((await db.query('select user_id from entitlements')).rows[0].user_id,a);
assert.equal((await db.query(`select * from commerce_lease($1,$2)`,[o,a])).rows.length,1);
assert.equal((await db.query(`select * from commerce_lease($1,$2)`,[o,b])).rows.length,0);
await db.exec("update guide_deliveries set email_id='failed-message',status='failed',lease_until=null,lease_id=null");
assert.equal((await db.query(`select * from commerce_lease($1,$2)`,[o,b])).rows.length,0);
await db.exec("update guide_deliveries set email_id=null,status='ready'");
assert.equal((await db.query(`select * from commerce_lease($1,$2)`,[o,b])).rows.length,1);
await db.exec(`set role authenticated; set "test.uid"='${b}';`);
assert.equal((await db.query('select id,status from orders')).rows.length,0);
await db.exec(`set "test.uid"='${a}';`);
assert.equal((await db.query('select id,status from orders')).rows.length,1);
for(const sql of ['select customer_email from orders','select password_ciphertext from guide_deliveries',"update orders set status='paid'",'select commerce_claim(\''+b+'\')','select commerce_private.verified_email(\''+b+'\')','select * from payment_events']) await assert.rejects(()=>db.query(sql),/permission denied/);
await db.exec('reset role');
assert.equal(await payment(3,'refunded'),'refunded');
assert.equal(await payment(4,'paid'),'refunded');
assert.equal((await db.query('select status from entitlements')).rows[0].status,'revoked');
await db.exec(`update guide_deliveries set email_id='mail',status='sent';
insert into email_events(id,email_id,event_type,event_at) values('late','mail','email.sent',now()-interval '1 minute'),('delivered','mail','email.delivered',now());
select commerce_email_events();`);
assert.equal((await db.query('select status from guide_deliveries')).rows[0].status,'delivered');
await db.exec(`insert into email_events(id,email_id,event_type,event_at) values('older','mail','email.sent',now()-interval '2 minutes'); select commerce_email_events();`);
assert.equal((await db.query('select status from guide_deliveries')).rows[0].status,'delivered');
assert.equal((await db.query('select public from storage.buckets where public=true')).rows.length,0);
assert.equal((await db.query(`select commerce_rate('fixture',1,60) as ok`)).rows[0].ok,true);
assert.equal((await db.query(`select commerce_rate('fixture',1,60) as ok`)).rows[0].ok,false);
// Validate the scheduler SQL and optional protection header without installing
// extensions or making a network request. These schemas are local fixtures.
await db.exec(`create schema vault; create schema net; create schema cron;
create table vault.decrypted_secrets(name text,decrypted_secret text);
create table cron.jobs(command text);
create function cron.schedule(text,text,text) returns integer language sql as $$ insert into cron.jobs values($3) returning 1 $$;
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns jsonb language sql as $$ select headers $$;
insert into vault.decrypted_secrets values('english90_site_url','https://fixture.vercel.app'),('english90_cron_secret','fixture-cron');`);
const schedule=(await readFile('supabase/schedule-commerce.sql','utf8')).replace(/^create extension.*$/gm,'');
await db.exec(schedule);
const command=(await db.query('select command from cron.jobs')).rows[0].command;
let headers=(await db.query(command)).rows[0].http_post;
assert.equal(headers.Authorization,'Bearer fixture-cron');
assert.equal(headers['x-vercel-protection-bypass'],undefined);
await db.exec("insert into vault.decrypted_secrets values('english90_vercel_bypass_secret','fixture-bypass')");
headers=(await db.query(command)).rows[0].http_post;
assert.equal(headers['x-vercel-protection-bypass'],'fixture-bypass');
// Manual registrations queue the same delivery atomically, without an Auth signup.
await db.exec(`insert into commerce_private.manual_release values
 ('sandbox','manual-fixture','fixture.pdf',repeat('a',64));`);
for (const [method,amount] of [['transfer',59990],['cash',59990],['free',0]]) {
  const recipient=`${method}@example.com`;
  const row=(await db.query(`insert into manual_recipients(email,payment_method,environment)
    values($1,$2,'sandbox') returning *`,[recipient,method])).rows[0];
  const purchase=(await db.query('select * from orders where id=$1',[row.order_id])).rows[0];
  assert.equal(purchase.amount_clp,amount);
  assert.equal(purchase.payment_method,method);
  assert.equal(purchase.status,'paid');
  assert.equal(purchase.mp_order_id,null);
  assert.equal(purchase.consent_at,null);
  assert.equal(purchase.master_sha256,'a'.repeat(64));
  assert.equal((await db.query('select * from entitlements where source_order_id=$1',[row.order_id])).rows.length,1);
  assert.equal((await db.query('select status from guide_deliveries where order_id=$1',[row.order_id])).rows[0].status,'pending');
  await assert.rejects(()=>db.query(`insert into manual_recipients(email,payment_method,environment)
    values($1,$2,'sandbox')`,[recipient,method]),/recipient_already_has_access/);
}
await assert.rejects(()=>db.query(`insert into manual_recipients(email,payment_method,environment)
 values('invalid','free','sandbox')`),/invalid_email/);
await assert.rejects(()=>db.query(`insert into manual_recipients(email,payment_method,amount_clp,environment)
 values('bad@example.com','free',59990,'sandbox')`),/invalid_manual_payment/);
assert.equal((await db.query("select id from orders where customer_email='bad@example.com'")).rows.length,0);
await db.exec('set role authenticated');
await assert.rejects(()=>db.query("insert into manual_recipients(email,payment_method) values('unauthorized@example.com','free')"),/permission denied/);
await assert.rejects(()=>db.query('select * from manual_recipients'),/permission denied/);
await db.exec('reset role');
// Only recipients with valid access and a delivered older edition are updated.
await db.exec(`update guide_deliveries set status='delivered',storage_path='old.pdf',password_ciphertext='sealed',email_id=order_id::text
 where order_id in(select id from orders where payment_method in ('transfer','cash','free'));
update orders set status='refunded' where payment_method='cash';`);
let queued=(await db.query("select commerce_queue_edition('sandbox','edition-2','new.pdf',repeat('b',64)) as n")).rows[0].n;
assert.equal(queued,2);
assert.equal((await db.query("select commerce_queue_edition('sandbox','edition-2','new.pdf',repeat('b',64)) as n")).rows[0].n,0);
await assert.rejects(()=>db.query("select commerce_queue_edition('sandbox','edition-2','changed.pdf',repeat('c',64))"),/edition_version_conflict/);
const updated=(await db.query("select * from guide_deliveries where is_update order by order_id")).rows;
assert.equal(updated.length,2);
for(const row of updated) {
  assert.equal(row.storage_path,'old.pdf'); // Remains downloadable until its replacement is verified.
  assert.equal(row.password_ciphertext,'sealed');
  assert.equal(row.target_version,'edition-2');
  assert.equal(row.email_attempt,1);
  assert.equal(row.status,'pending');
}
assert.equal((await db.query('select * from guide_update_notifications')).rows.length,2);
// A late bounce for the archived email suppresses further updates to that address.
await db.query("insert into email_events(id,email_id,event_type,event_at) values('archived-bounce',$1,'email.bounced',now())",[updated[0].order_id]);
assert.equal((await db.query('select commerce_update_allowed($1) as ok',[updated[0].order_id])).rows[0].ok,false);
await db.query('select commerce_archive_email_events()');
assert.ok((await db.query("select processed_at from email_events where id='archived-bounce'")).rows[0].processed_at);
await db.exec("update guide_deliveries set guide_version='edition-2',status='delivered' where is_update");
assert.equal((await db.query("select commerce_queue_edition('sandbox','edition-3','newer.pdf',repeat('c',64)) as n")).rows[0].n,1);
await assert.rejects(()=>db.query("select commerce_queue_edition('sandbox','edition-2','new.pdf',repeat('b',64))"),/edition_rollback_requires_review/);
// Daily update allowance leaves separate capacity for purchase deliveries.
for(let i=0;i<50;i++) assert.equal((await db.query('select commerce_reserve_email($1,true) as ok',['update-'+i])).rows[0].ok,true);
assert.equal((await db.query("select commerce_reserve_email('update-0',true) as ok")).rows[0].ok,true);
assert.equal((await db.query("select commerce_reserve_email('update-51',true) as ok")).rows[0].ok,false);
for(let i=0;i<30;i++) assert.equal((await db.query('select commerce_reserve_email($1,false) as ok',['purchase-'+i])).rows[0].ok,true);
assert.equal((await db.query("select commerce_reserve_email('purchase-31',false) as ok")).rows[0].ok,false);
// Usage reported by Resend includes email sent outside this worker.
await db.exec('delete from commerce_private.email_reservations; select commerce_observe_email(95,900);');
assert.equal((await db.query("select commerce_reserve_email('over-provider-budget',false) as ok")).rows[0].ok,false);
await db.exec('delete from commerce_private.email_usage; select commerce_observe_email(0,3000);');
assert.equal((await db.query("select commerce_reserve_email('over-provider-month',false) as ok")).rows[0].ok,false);
await db.exec('set role authenticated');
await assert.rejects(()=>db.query("select commerce_queue_edition('production','bad','bad.pdf',repeat('f',64))"),/permission denied/);
await assert.rejects(()=>db.query('select * from guide_update_notifications'),/permission denied/);
await db.exec('reset role');
// Registering a production recipient immediately queues its own operation request.
await db.exec(`set "test.uid"='';
create table net.test_requests(url text,headers jsonb,body jsonb);
create or replace function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
 returns jsonb language plpgsql as $$ begin
 insert into net.test_requests values(url,headers,body); return headers; end $$;
insert into commerce_private.manual_release values('production','production-initial','production.pdf',repeat('d',64));`);
const instant=(await db.query(`insert into manual_recipients(email,payment_method)
 values('instant@example.com','free') returning order_id`)).rows[0].order_id;
let requests=(await db.query('select * from net.test_requests')).rows;
assert.equal(requests.length,1);
assert.equal(requests[0].url,'https://english90-landing.imrtech.xyz/api/commerce?action=operations');
assert.equal(requests[0].body.order,instant);
assert.equal(requests[0].headers.Authorization,'Bearer fixture-cron');
let status=(await db.query('select * from manual_recipient_delivery_status where order_id=$1',[instant])).rows[0];
assert.equal(status.ever_sent,false); assert.equal(status.ever_delivered,false);
await db.query("update guide_deliveries set status='delivered',sent_at=now(),delivered_at=now(),storage_path='instant.pdf',password_ciphertext='sealed' where order_id=$1",[instant]);
assert.equal((await db.query("select commerce_queue_edition('production','production-new','new.pdf',repeat('e',64)) as n")).rows[0].n,1);
status=(await db.query('select * from manual_recipient_delivery_status where order_id=$1',[instant])).rows[0];
assert.equal(status.delivery_status,'pending');
assert.equal(status.ever_sent,true); assert.equal(status.ever_delivered,true);
// A networking/configuration failure must not lose the recipient or pending delivery.
await db.exec("delete from vault.decrypted_secrets where name='english90_cron_secret'");
await db.query("insert into manual_recipients(email,payment_method) values('fallback@example.com','free')");
assert.equal((await db.query('select * from net.test_requests')).rows.length,1);
assert.equal((await db.query("select delivery_status from manual_recipient_delivery_status where email='fallback@example.com'")).rows[0].delivery_status,'pending');
await db.exec('set role authenticated');
await assert.rejects(()=>db.query('select * from manual_recipient_delivery_status'),/permission denied/);
await db.exec('reset role');
await db.close();
console.log('PostgreSQL migration, RLS, ownership, payment idempotency/reversal, leases, email ordering and rate limits passed (PGlite; Auth/Storage schemas are fixtures).');
