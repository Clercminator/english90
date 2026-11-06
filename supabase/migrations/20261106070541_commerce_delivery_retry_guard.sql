begin;
-- A known provider message must not be replayed as a new send after failure.
-- The owner resend operation explicitly clears email_id and increments email_attempt.
create or replace function public.commerce_lease(p_order uuid, p_lease uuid) returns setof public.guide_deliveries
language sql set search_path='' as $$
 update public.guide_deliveries d set lease_id=p_lease,lease_until=now()+interval '10 minutes',
 attempts=attempts+1,status=case when storage_path is null then 'processing' else status end
 where d.order_id=p_order and status not in ('sent','delivered','bounced')
 and email_id is null and next_attempt_at<=now()
 and (lease_until is null or lease_until<now())
 and exists(select 1 from public.orders o where o.id=d.order_id and o.status='paid') returning d.*;
$$;
revoke all on function public.commerce_lease(uuid,uuid) from public,anon,authenticated;
grant execute on function public.commerce_lease(uuid,uuid) to service_role;
commit;
