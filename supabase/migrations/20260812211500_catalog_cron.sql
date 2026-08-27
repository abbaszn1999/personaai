-- ─── Scheduling: pg_cron fires, pg_net calls, the route drains ────────────────
-- Postgres can't call Gemini itself, so indexing can't live entirely in the
-- database. It can still be *driven* from there, which is the point: the schedule
-- doesn't depend on the hosting platform having cron, and survives a redeploy.

-- The URL and shared secret live in Vault rather than being written into this file
-- or a plain table — this is the one credential that would let anyone on the
-- internet drive the job queue.
--
-- Set them once per environment before the schedule does anything:
--   select vault.create_secret('https://app.example.com', 'app_url');
--   select vault.create_secret('<INTERNAL_JOB_SECRET>', 'internal_job_secret');
create extension if not exists supabase_vault with schema vault;

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

  -- Silently do nothing rather than raise. This runs on a schedule, so a missing
  -- secret in a fresh environment would otherwise log an error every single minute
  -- and bury anything real.
  if v_url is null or v_secret is null then
    return null;
  end if;

  return net.http_post(
    url := rtrim(v_url, '/') || route,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body := '{}'::jsonb,
    -- pg_net is fire-and-forget: this bounds how long it waits for a *response*, not
    -- how long the route may run. The drain deliberately outlives it.
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function public.call_internal_route(text) from public, anon, authenticated;

-- Skips the HTTP call entirely when the queue is empty, which is the common case —
-- this fires every minute forever, and an idle catalog shouldn't wake the app 1,440
-- times a day to be told there's nothing to do.
create or replace function public.trigger_catalog_drain()
returns void
language plpgsql
security definer
set search_path = public, extensions, pgmq
as $$
declare
  v_depth bigint;
begin
  select queue_length into v_depth from pgmq.metrics('catalog_enrichment');
  if coalesce(v_depth, 0) = 0 then
    return;
  end if;

  perform public.call_internal_route('/api/internal/catalog/drain');
end;
$$;

revoke all on function public.trigger_catalog_drain() from public, anon, authenticated;

-- Every minute, while each invocation works for several minutes. The overlap is
-- deliberate: pgmq hides a claimed batch for its visibility timeout, so concurrent
-- drains take disjoint work and a large backfill finishes in a fraction of the time
-- a strictly serial one would.
select cron.schedule(
  'catalog-drain',
  '* * * * *',
  $$select public.trigger_catalog_drain()$$
);

-- Picks up stores marked `pending` by the connect flow and walks their catalog onto
-- the queue. Every two minutes rather than every minute because a walk takes far
-- longer than a drain batch, and the route claims each connection by flipping it to
-- `indexing` before starting.
select cron.schedule(
  'catalog-enqueue',
  '*/2 * * * *',
  $$select public.call_internal_route('/api/internal/catalog/enqueue')$$
);

-- The safety net under webhooks, not a replacement for them: a delivery can fail
-- while the merchant's host is down, a subscription can be deleted from the store
-- admin, and bulk edits through an import tool often fire no per-product events at
-- all. Hourly is frequent enough to bound how long a missed change stays wrong, and
-- costs one incremental API call per store when nothing has changed.
select cron.schedule(
  'catalog-reconcile',
  '17 * * * *',
  $$select public.call_internal_route('/api/internal/catalog/reconcile')$$
);
