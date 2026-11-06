begin;
create table public.products (
 id text primary key, name text not null, price_clp integer not null check(price_clp=59990),
 currency text not null default 'CLP' check(currency='CLP'), active boolean not null default false
);
insert into public.products values ('english90-premium','English90 Premium',59990,'CLP',false);
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.orders (
 id uuid primary key, checkout_key uuid not null unique, status_token_hash text not null,
 customer_email text not null check(customer_email=lower(customer_email)),
 user_id uuid references auth.users(id), product_id text not null references public.products(id),
 amount_clp integer not null check(amount_clp=59990), currency text not null check(currency='CLP'),
 environment text not null check(environment in ('sandbox','production')),
 guide_version text not null, master_path text not null, master_sha256 text not null,
 status text not null default 'pending' check(status in ('pending','paid','failed','canceled','refunded','disputed')),
 mp_order_id text unique, checkout_url text, provider_revision numeric not null default -1,
 attribution jsonb not null default '{}', terms_version text not null,
 consent_at timestamptz not null default now(), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index orders_customer_email on public.orders(customer_email);
create index orders_user_id on public.orders(user_id);
create index orders_reconcile on public.orders(updated_at) where mp_order_id is not null;
create table public.payment_events (
 id bigint generated always as identity primary key, order_id uuid not null references public.orders(id),
 provider_event_id text not null unique, provider_status text not null,
 processing_status text not null check(processing_status in ('applied','ignored')),
 received_at timestamptz not null default now(), processed_at timestamptz not null default now()
);
create index payment_events_order on public.payment_events(order_id);
create table public.entitlements (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id),
 product_id text not null references public.products(id), source_order_id uuid not null unique references public.orders(id),
 status text not null check(status in ('active','revoked')), activated_at timestamptz not null default now(), revoked_at timestamptz
);
create index entitlements_user on public.entitlements(user_id, status);
create table public.guide_deliveries (
 order_id uuid primary key references public.orders(id), user_id uuid references auth.users(id),
 guide_version text not null, storage_path text, password_ciphertext text,
 status text not null default 'pending' check(status in ('pending','processing','ready','queued','sent','delivered','failed','bounced')),
 attempts integer not null default 0, lease_id uuid, lease_until timestamptz,
 next_attempt_at timestamptz not null default now(), last_error_code text,
 email_id text unique, email_attempt integer not null default 0, email_payload jsonb, email_started_at timestamptz, sent_at timestamptz, delivered_at timestamptz,
 email_event_at timestamptz, created_at timestamptz not null default now()
);
create index deliveries_user on public.guide_deliveries(user_id);
create index deliveries_retry on public.guide_deliveries(next_attempt_at) where status in ('pending','processing','ready','queued','failed');
create table public.email_events (
 id text primary key, email_id text not null, event_type text not null, event_at timestamptz not null,
 received_at timestamptz not null default now(), processed_at timestamptz
);
create table public.commerce_rate_limits (
 key text primary key, hits integer not null, expires_at timestamptz not null
);
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.payment_events enable row level security;
alter table public.entitlements enable row level security;
alter table public.guide_deliveries enable row level security;
alter table public.email_events enable row level security;
alter table public.commerce_rate_limits enable row level security;
revoke all on public.products, public.profiles, public.orders, public.payment_events, public.entitlements,
 public.guide_deliveries, public.email_events, public.commerce_rate_limits from anon, authenticated;
grant select on public.profiles, public.entitlements to authenticated;
grant select(id,user_id,product_id,amount_clp,currency,status,created_at) on public.orders to authenticated;
grant select(order_id,user_id,guide_version,status,sent_at,delivered_at) on public.guide_deliveries to authenticated;
create policy own_profile on public.profiles for select to authenticated using ((select auth.uid())=user_id);
create policy own_orders on public.orders for select to authenticated using ((select auth.uid())=user_id);
create policy own_entitlements on public.entitlements for select to authenticated using ((select auth.uid())=user_id);
create policy own_deliveries on public.guide_deliveries for select to authenticated using ((select auth.uid())=user_id);
grant all on public.products, public.profiles, public.orders, public.payment_events, public.entitlements,
 public.guide_deliveries, public.email_events, public.commerce_rate_limits to service_role;
grant usage,select on sequence public.payment_events_id_seq to service_role;
insert into storage.buckets(id,name,public) values ('english90-master','english90-master',false),
 ('english90-buyers','english90-buyers',false) on conflict(id) do update set public=false;
-- No browser Storage policies: the server checks current paid ownership before signing.

create function public.commerce_rate(p_key text, p_limit integer, p_seconds integer) returns boolean
language plpgsql set search_path='' as $$
declare n integer;
begin
 delete from public.commerce_rate_limits where expires_at < now();
 insert into public.commerce_rate_limits values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set hits=public.commerce_rate_limits.hits+1 returning hits into n;
 return n<=p_limit;
end $$;

-- Only called after an independent, validated provider GET. Lock and revision check
-- make duplicates and stale deliveries harmless; reversals remain sticky for review.
create function public.commerce_payment(p_order uuid, p_mp_id text, p_revision numeric,
 p_event text, p_status text, p_provider_status text) returns text
language plpgsql set search_path='' as $$
declare o public.orders; applied boolean;
begin
 select * into strict o from public.orders where id=p_order for update;
 if o.mp_order_id is distinct from p_mp_id then raise exception 'provider_mismatch'; end if;
 if p_status not in ('pending','paid','failed','canceled','refunded','disputed') then raise exception 'invalid_status'; end if;
 if exists(select 1 from public.payment_events where provider_event_id=p_event) then return o.status; end if;
 applied := p_revision>o.provider_revision and
  (o.status not in ('refunded','disputed') or p_status in ('refunded','disputed')) and
  (o.status<>'paid' or p_status in ('paid','refunded','disputed'));
 insert into public.payment_events(order_id,provider_event_id,provider_status,processing_status)
 values(p_order,p_event,p_provider_status,case when applied then 'applied' else 'ignored' end);
 if not applied then return o.status; end if;
 update public.orders set status=p_status,provider_revision=p_revision,updated_at=now() where id=p_order;
 if p_status='paid' then
  insert into public.entitlements(user_id,product_id,source_order_id,status)
  values(o.user_id,o.product_id,o.id,'active') on conflict(source_order_id) do nothing;
  insert into public.guide_deliveries(order_id,user_id,guide_version) values(o.id,o.user_id,o.guide_version)
  on conflict(order_id) do nothing;
 elsif p_status in ('refunded','disputed') then
  update public.entitlements set status='revoked',revoked_at=now() where source_order_id=o.id;
 end if;
 return p_status;
end $$;

-- Auth identity is looked up in auth.users, never taken from editable metadata.
-- service_role has no SELECT on auth.users in hosted Supabase. Keep this narrow
-- definer helper outside the exposed schema and deny every browser role access.
create schema commerce_private;
revoke all on schema commerce_private from public,anon,authenticated;
grant usage on schema commerce_private to service_role;
create function commerce_private.verified_email(p_user uuid) returns text
language sql security definer set search_path='' as $$
 select lower(email) from auth.users where id=p_user and email_confirmed_at is not null
 and coalesce(is_anonymous,false)=false
 and ((select auth.uid()) is null or (select auth.uid())=p_user);
$$;
revoke all on function commerce_private.verified_email(uuid) from public,anon,authenticated;
grant execute on function commerce_private.verified_email(uuid) to service_role;
create function public.commerce_claim(p_user uuid) returns void
language plpgsql set search_path='' as $$
declare verified_email text;
begin
 select commerce_private.verified_email(p_user) into verified_email;
 if verified_email is null then raise exception 'email_unverified'; end if;
 insert into public.profiles(user_id) values(p_user) on conflict do nothing;
 update public.orders set user_id=p_user where customer_email=verified_email and user_id is null and status in ('paid','refunded','disputed');
 update public.entitlements e set user_id=p_user from public.orders o where e.source_order_id=o.id and o.user_id=p_user and e.user_id is null;
 update public.guide_deliveries d set user_id=p_user from public.orders o where d.order_id=o.id and o.user_id=p_user and d.user_id is null;
end $$;

create function public.commerce_lease(p_order uuid, p_lease uuid) returns setof public.guide_deliveries
language sql set search_path='' as $$
 update public.guide_deliveries d set lease_id=p_lease,lease_until=now()+interval '10 minutes',
 attempts=attempts+1,status=case when storage_path is null then 'processing' else status end
 where d.order_id=p_order and status not in ('sent','delivered','bounced') and next_attempt_at<=now()
 and (lease_until is null or lease_until<now())
 and exists(select 1 from public.orders o where o.id=d.order_id and o.status='paid') returning d.*;
$$;

create function public.commerce_email_events() returns void
language plpgsql set search_path='' as $$
declare ev public.email_events;
begin
 for ev in select * from public.email_events where processed_at is null order by event_at for update skip locked loop
  if exists(select 1 from public.guide_deliveries where email_id=ev.email_id) then
   update public.guide_deliveries set status=case ev.event_type when 'email.delivered' then 'delivered'
    when 'email.bounced' then 'bounced' when 'email.failed' then 'failed' when 'email.sent' then 'sent' else status end,
    delivered_at=case when ev.event_type='email.delivered' then ev.event_at else delivered_at end,
    email_event_at=ev.event_at,last_error_code=case when ev.event_type in ('email.bounced','email.failed') then ev.event_type else null end
   where email_id=ev.email_id and (email_event_at is null or email_event_at<ev.event_at)
    and not (status in ('delivered','bounced') and ev.event_type='email.sent');
   update public.email_events set processed_at=now() where id=ev.id;
  end if;
 end loop;
end $$;

revoke all on function public.commerce_rate(text,integer,integer),
 public.commerce_payment(uuid,text,numeric,text,text,text),public.commerce_claim(uuid),
 public.commerce_lease(uuid,uuid),public.commerce_email_events() from public,anon,authenticated;
grant execute on function public.commerce_rate(text,integer,integer),
 public.commerce_payment(uuid,text,numeric,text,text,text),public.commerce_claim(uuid),
 public.commerce_lease(uuid,uuid),public.commerce_email_events() to service_role;
commit;
