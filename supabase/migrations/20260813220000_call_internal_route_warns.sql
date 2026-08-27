-- `call_internal_route` returned quietly when its Vault secrets were missing, so every
-- scheduled catalog job recorded `succeeded` in cron.job_run_details while never making an HTTP
-- request at all. A misconfigured deployment therefore looked exactly like a healthy idle one.
-- Warn instead, so the Postgres log names the missing secret.

create or replace function public.call_internal_route(route text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'internal_job_secret' limit 1;

  if v_url is null or v_secret is null then
    raise warning 'call_internal_route(%) skipped: missing vault secret %',
      route,
      case
        when v_url is null and v_secret is null then 'app_url and internal_job_secret'
        when v_url is null then 'app_url'
        else 'internal_job_secret'
      end;
    return null;
  end if;

  return net.http_post(
    url := rtrim(v_url, '/') || route,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;
