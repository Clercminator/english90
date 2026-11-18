begin;
alter table public.orders add column payment_method text not null default 'mercadopago'
 check(payment_method in ('mercadopago','transfer','cash','free'));
alter table public.orders drop constraint orders_amount_clp_check;
alter table public.orders add constraint orders_amount_clp_check check (
 (payment_method='mercadopago' and amount_clp=59990) or
 (payment_method in ('transfer','cash') and amount_clp>0) or
 (payment_method='free' and amount_clp=0));
alter table public.orders alter column consent_at drop not null;

create table commerce_private.manual_release (
 environment text primary key check(environment in ('sandbox','production')),
 guide_version text not null, master_path text not null,
 master_sha256 text not null check(master_sha256 ~ '^[a-f0-9]{64}$')
);
alter table commerce_private.manual_release enable row level security;
revoke all on commerce_private.manual_release from public,anon,authenticated;
grant select on commerce_private.manual_release to service_role;

create table public.manual_recipients (
 email text not null,
 payment_method text not null check(payment_method in ('transfer','cash','free')),
 amount_clp integer,
 reference text,
 environment text not null default 'production' check(environment in ('sandbox','production')),
 order_id uuid primary key default gen_random_uuid() references public.orders(id),
 created_at timestamptz not null default now(),
 unique(email,environment),
 check((payment_method='free' and amount_clp=0) or
       (payment_method in ('transfer','cash') and amount_clp>0))
);
alter table public.manual_recipients enable row level security;
revoke all on public.manual_recipients from public,anon,authenticated;
grant select,insert on public.manual_recipients to service_role;

create function commerce_private.queue_manual_recipient() returns trigger
language plpgsql set search_path='' as $$
declare release commerce_private.manual_release;
begin
 new.email := lower(btrim(new.email));
 if length(new.email)>254 or new.email !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' then
  raise exception 'invalid_email';
 end if;
 if new.payment_method='free' then new.amount_clp := coalesce(new.amount_clp,0);
 else new.amount_clp := coalesce(new.amount_clp,59990); end if;
 if new.payment_method not in ('transfer','cash','free') or
    (new.payment_method='free' and new.amount_clp<>0) or
    (new.payment_method in ('transfer','cash') and new.amount_clp<=0) then
  raise exception 'invalid_manual_payment';
 end if;
 select * into strict release from commerce_private.manual_release where environment=new.environment;
 -- Serialize registrations for the same address; repeated inserts never queue another email.
 perform pg_advisory_xact_lock(hashtextextended(new.environment||':'||new.email,0));
 if exists(select 1 from public.orders where customer_email=new.email
           and environment=new.environment and product_id='english90-premium' and status='paid') then
  raise exception 'recipient_already_has_access';
 end if;
 insert into public.orders(id,checkout_key,status_token_hash,customer_email,product_id,
   amount_clp,currency,environment,guide_version,master_path,master_sha256,status,
   terms_version,consent_at,payment_method)
 values(new.order_id,gen_random_uuid(),gen_random_uuid()::text,new.email,'english90-premium',
   new.amount_clp,'CLP',new.environment,release.guide_version,release.master_path,release.master_sha256,
   'paid','manual-registration',null,new.payment_method);
 insert into public.entitlements(product_id,source_order_id,status)
 values('english90-premium',new.order_id,'active');
 insert into public.guide_deliveries(order_id,guide_version) values(new.order_id,release.guide_version);
 return new;
end $$;
revoke all on function commerce_private.queue_manual_recipient() from public,anon,authenticated;
grant execute on function commerce_private.queue_manual_recipient() to service_role;
create trigger queue_manual_recipient before insert on public.manual_recipients
 for each row execute function commerce_private.queue_manual_recipient();
commit;
