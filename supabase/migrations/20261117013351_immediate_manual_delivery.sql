begin;
alter table public.guide_deliveries add column first_sent_at timestamptz,
 add column first_delivered_at timestamptz;
update public.guide_deliveries d set first_sent_at=coalesce(
 (select min((n.previous_delivery->>'sent_at')::timestamptz) from public.guide_update_notifications n where n.order_id=d.order_id),d.sent_at),
 first_delivered_at=coalesce(
 (select min((n.previous_delivery->>'delivered_at')::timestamptz) from public.guide_update_notifications n where n.order_id=d.order_id),d.delivered_at);
create function commerce_private.keep_first_delivery_dates() returns trigger
language plpgsql set search_path='' as $$
begin
 new.first_sent_at:=coalesce(old.first_sent_at,new.sent_at);
 new.first_delivered_at:=coalesce(old.first_delivered_at,new.delivered_at);
 return new;
end $$;
revoke all on function commerce_private.keep_first_delivery_dates() from public,anon,authenticated;
create trigger keep_first_delivery_dates before update on public.guide_deliveries
 for each row execute function commerce_private.keep_first_delivery_dates();

create view public.manual_recipient_delivery_status with(security_invoker=true) as
 select m.email,m.payment_method,m.amount_clp,m.environment,m.order_id,m.created_at,
 d.status as delivery_status,d.guide_version,
 d.first_sent_at is not null as ever_sent,
 d.first_delivered_at is not null as ever_delivered,
 d.first_sent_at,d.first_delivered_at,d.last_error_code,d.next_attempt_at
 from public.manual_recipients m join public.guide_deliveries d on d.order_id=m.order_id;
revoke all on public.manual_recipient_delivery_status from public,anon,authenticated;
grant select on public.manual_recipient_delivery_status to service_role;

-- Private trigger needs Vault access; neither the credentials nor the function
-- are exposed to browser roles. pg_net dispatches only after the insert commits.
create function commerce_private.send_new_manual_recipient() returns trigger
language plpgsql security definer set search_path='' as $$
declare delivery_secret text;
begin
 if new.environment<>'production' then return new; end if;
 if (select auth.uid()) is not null then raise exception 'owner_only'; end if;
 select decrypted_secret into strict delivery_secret from vault.decrypted_secrets where name='english90_cron_secret';
 if coalesce(delivery_secret,'')='' then raise exception 'delivery_secret_missing'; end if;
 perform net.http_post(
  url:='https://english90-landing.imrtech.xyz/api/commerce?action=operations',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||delivery_secret),
  body:=jsonb_build_object('order',new.order_id),timeout_milliseconds:=260000);
 return new;
exception when others then
 -- Registration and its durable pending delivery survive a notification outage.
 -- The existing five-minute recovery worker will retry it.
 raise warning 'immediate_delivery_deferred_to_scheduler';
 return new;
end $$;
revoke all on function commerce_private.send_new_manual_recipient() from public,anon,authenticated;
create trigger send_new_manual_recipient after insert on public.manual_recipients
 for each row execute function commerce_private.send_new_manual_recipient();
commit;
