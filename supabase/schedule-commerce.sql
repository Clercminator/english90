-- Run only in the selected TEST project first, after storing these Vault secrets
-- through the owner dashboard: english90_site_url, english90_cron_secret.
-- The URL must be the exact HTTPS deployment origin; the secret equals CRON_SECRET.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('english90-commerce-recovery','*/5 * * * *',$job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='english90_site_url') || '/api/commerce?action=operations',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
    (select decrypted_secret from vault.decrypted_secrets where name='english90_cron_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 260000
 );
$job$);
