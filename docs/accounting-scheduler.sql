-- OPTIONAL: continuous processing of the accounting outbox via Supabase Cron.
-- First add these two secrets in Supabase Vault (do not paste their values here):
--   viva_app_url       = HTTPS URL of the deployment hosting this code
--   viva_cron_secret   = the same CRON_SECRET configured on that deployment
-- For a protected Vercel Preview, optionally add viva_preview_bypass containing
-- its Automation Bypass secret. Admin/API authentication remains enabled.
-- Accounting and auto-send settings start disabled; enable them in Finance Controls
-- only after testing the manual run and notification flow.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_viva_accounting_worker()
returns bigint language plpgsql security definer set search_path='' as $$
declare v_url text; v_secret text; v_bypass text; v_headers jsonb;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='viva_app_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='viva_cron_secret' limit 1;
  select decrypted_secret into v_bypass from vault.decrypted_secrets where name='viva_preview_bypass' limit 1;
  if v_url is null or v_url !~ '^https://' or coalesce(length(v_secret),0)<16 then
    raise exception 'Configure the HTTPS app URL and matching cron secret in Supabase Vault first.';
  end if;
  v_headers=jsonb_build_object('Authorization','Bearer '||v_secret);
  if coalesce(length(v_bypass),0)>0 then v_headers=v_headers||jsonb_build_object('x-vercel-protection-bypass',v_bypass); end if;
  return net.http_get(url:=rtrim(v_url,'/')||'/api/admin/accounting?task=scheduled',headers:=v_headers,timeout_milliseconds:=60000);
end $$;
revoke all on function public.invoke_viva_accounting_worker() from public,anon,authenticated;

do $$ declare j record; begin
  for j in select jobid from cron.job where jobname='viva-accounting-worker' loop perform cron.unschedule(j.jobid); end loop;
end $$;
select cron.schedule('viva-accounting-worker','*/5 * * * *','select public.invoke_viva_accounting_worker()');

-- A submitted HTTP request is not proof of completed accounting/email work.
-- Check Finance > Controls for run results and Notifications for provider acceptance.
-- Review HTTP status_code/error_msg in net._http_response when troubleshooting.
-- To stop this optional worker:
-- select cron.unschedule('viva-accounting-worker');
