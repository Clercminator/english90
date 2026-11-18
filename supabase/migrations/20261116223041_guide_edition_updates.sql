begin;
alter table public.guide_deliveries add column is_update boolean not null default false,
 add column target_version text, add column target_master_path text, add column target_master_sha256 text;
create table commerce_private.guide_editions (
 id bigint generated always as identity primary key,
 environment text not null check(environment in ('sandbox','production')),
 guide_version text not null, master_path text not null,
 master_sha256 text not null check(master_sha256 ~ '^[a-f0-9]{64}$'),
 published_at timestamptz not null default now(), unique(environment,guide_version)
);
create table public.guide_update_notifications (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
 edition_id bigint not null references commerce_private.guide_editions(id),
 recipient_email text not null, previous_delivery jsonb not null,
 queued_at timestamptz not null default now(), unique(recipient_email,edition_id)
);
create index guide_updates_order on public.guide_update_notifications(order_id);
create table commerce_private.email_reservations (
 send_key text not null, day date not null default (now() at time zone 'UTC')::date,
 is_update boolean not null, reserved_at timestamptz not null default now(), primary key(send_key,day)
);
create table commerce_private.email_usage (
 id boolean primary key default true check(id), observed_at timestamptz not null,
 daily_used integer not null, monthly_used integer not null
);
alter table commerce_private.guide_editions enable row level security;
alter table public.guide_update_notifications enable row level security;
alter table commerce_private.email_reservations enable row level security;
alter table commerce_private.email_usage enable row level security;
revoke all on commerce_private.guide_editions,public.guide_update_notifications,
 commerce_private.email_reservations,commerce_private.email_usage from public,anon,authenticated;
grant select,insert,update on commerce_private.guide_editions,public.guide_update_notifications,
 commerce_private.email_reservations,commerce_private.email_usage to service_role;
grant usage,select on sequence commerce_private.guide_editions_id_seq to service_role;
grant insert,update on commerce_private.manual_release to service_role;

create function public.commerce_queue_edition(p_environment text,p_version text,p_path text,p_sha256 text)
returns integer language plpgsql set search_path='' as $$
declare edition commerce_private.guide_editions; d public.guide_deliveries; recipient text; queued integer:=0; added uuid;
begin
 if p_environment not in ('production','sandbox') or coalesce(p_version,'')='' or coalesce(p_path,'')=''
 or coalesce(p_sha256,'') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_edition'; end if;
 perform pg_advisory_xact_lock(hashtextextended('english90-edition:'||p_environment,0));
 insert into commerce_private.guide_editions(environment,guide_version,master_path,master_sha256)
 values(p_environment,p_version,p_path,p_sha256) on conflict(environment,guide_version) do nothing;
 select * into strict edition from commerce_private.guide_editions where environment=p_environment and guide_version=p_version;
 if edition.master_path<>p_path or edition.master_sha256<>p_sha256 then raise exception 'edition_version_conflict'; end if;
 if exists(select 1 from commerce_private.guide_editions where environment=p_environment and id>edition.id)
 then raise exception 'edition_rollback_requires_review'; end if;
 insert into commerce_private.manual_release values(p_environment,p_version,p_path,p_sha256)
 on conflict(environment) do update set guide_version=excluded.guide_version,
 master_path=excluded.master_path,master_sha256=excluded.master_sha256;
 for d in select delivery.* from public.guide_deliveries delivery
 join public.orders o on o.id=delivery.order_id
 where o.environment=p_environment and o.status='paid' and o.product_id='english90-premium'
 and delivery.status in ('sent','delivered') and delivery.storage_path is not null
 and delivery.password_ciphertext is not null and delivery.guide_version<>p_version
 and exists(select 1 from public.entitlements where source_order_id=o.id and status='active')
 and not exists(select 1 from public.guide_update_notifications history join public.orders previous_order on previous_order.id=history.order_id
   join public.email_events ev
   on ev.email_id=history.previous_delivery->>'email_id'
   where previous_order.environment=p_environment and history.recipient_email=o.customer_email and ev.event_type in ('email.bounced','email.complained'))
 and not exists(select 1 from public.orders other join public.guide_deliveries already on already.order_id=other.id
   where other.customer_email=o.customer_email and other.environment=p_environment
   and (already.status='bounced' or (other.status='paid' and already.guide_version=p_version)))
 order by delivery.created_at for update of delivery skip locked
 loop
  select customer_email into recipient from public.orders where id=d.order_id;
  added:=null;
  insert into public.guide_update_notifications(order_id,edition_id,recipient_email,previous_delivery)
  values(d.order_id,edition.id,recipient,to_jsonb(d)) on conflict(recipient_email,edition_id) do nothing returning id into added;
  if added is null then continue; end if;
  update public.guide_deliveries set is_update=true,target_version=p_version,
   target_master_path=p_path,target_master_sha256=p_sha256,status='pending',
   email_attempt=email_attempt+1,email_id=null,email_payload=null,email_started_at=null,
   email_event_at=null,sent_at=null,delivered_at=null,last_error_code=null,next_attempt_at=now(),
   lease_id=null,lease_until=null,attempts=0 where order_id=d.order_id;
  queued:=queued+1;
 end loop;
 return queued;
end $$;

create function public.commerce_reserve_email(p_key text,p_update boolean) returns boolean
language plpgsql set search_path='' as $$
declare today date:=(now() at time zone 'UTC')::date;
 month_start date:=date_trunc('month',now() at time zone 'UTC')::date;
 daily integer; monthly integer; updates_daily integer; updates_monthly integer;
 usage commerce_private.email_usage;
begin
 perform pg_advisory_xact_lock(hashtextextended('english90-email-budget',0));
 if exists(select 1 from commerce_private.email_reservations where send_key=p_key and day=today) then return true; end if;
 select count(*) filter(where day=today),count(*),
  count(*) filter(where day=today and is_update),count(*) filter(where is_update)
 into daily,monthly,updates_daily,updates_monthly from commerce_private.email_reservations where day>=month_start;
 select * into usage from commerce_private.email_usage where id=true;
 if (usage.observed_at at time zone 'UTC')::date=today then
  daily:=greatest(daily,usage.daily_used+(select count(*) from commerce_private.email_reservations
   where day=today and reserved_at>=usage.observed_at));
 end if;
 if (usage.observed_at at time zone 'UTC')::date>=month_start then
  monthly:=greatest(monthly,usage.monthly_used+(select count(*) from commerce_private.email_reservations
   where day>=month_start and reserved_at>=usage.observed_at));
 end if;
 if daily>=80 or monthly>=2400 or (p_update and (updates_daily>=50 or updates_monthly>=1500)) then return false; end if;
 insert into commerce_private.email_reservations(send_key,is_update) values(p_key,p_update) on conflict do nothing;
 return true;
end $$;

create function public.commerce_observe_email(p_daily integer,p_monthly integer) returns void
language sql set search_path='' as $$
 insert into commerce_private.email_usage(id,observed_at,daily_used,monthly_used) values(true,now(),p_daily,p_monthly)
 on conflict(id) do update set observed_at=excluded.observed_at,
 daily_used=greatest(excluded.daily_used,case when (commerce_private.email_usage.observed_at at time zone 'UTC')::date=
 (now() at time zone 'UTC')::date then commerce_private.email_usage.daily_used else 0 end),
 monthly_used=greatest(excluded.monthly_used,case when date_trunc('month',commerce_private.email_usage.observed_at at time zone 'UTC')=
 date_trunc('month',now() at time zone 'UTC') then commerce_private.email_usage.monthly_used else 0 end);
$$;
create function public.commerce_update_allowed(p_order uuid) returns boolean language sql set search_path='' as $$
 select exists(select 1 from public.orders o join public.entitlements e on e.source_order_id=o.id
  where o.id=p_order and o.status='paid' and e.status='active'
  and not exists(select 1 from public.guide_update_notifications history join public.orders previous_order on previous_order.id=history.order_id
   join public.email_events ev
   on ev.email_id=history.previous_delivery->>'email_id'
   where previous_order.environment=o.environment and history.recipient_email=o.customer_email and ev.event_type in ('email.bounced','email.complained')));
$$;
create function public.commerce_archive_email_events() returns void language sql set search_path='' as $$
 update public.email_events e set processed_at=now() where processed_at is null and exists(
  select 1 from public.guide_update_notifications n where n.previous_delivery->>'email_id'=e.email_id);
$$;
revoke all on function public.commerce_queue_edition(text,text,text,text),public.commerce_reserve_email(text,boolean),
 public.commerce_observe_email(integer,integer),public.commerce_archive_email_events(),public.commerce_update_allowed(uuid) from public,anon,authenticated;
grant execute on function public.commerce_queue_edition(text,text,text,text),public.commerce_reserve_email(text,boolean),
 public.commerce_observe_email(integer,integer),public.commerce_archive_email_events(),public.commerce_update_allowed(uuid) to service_role;
commit;
