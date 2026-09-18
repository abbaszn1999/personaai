-- Drives the full-catalog CMS column walk the same way `catalog-drain` drives enrichment: the
-- schedule lives in the database so discovery doesn't depend on the hosting platform's own cron,
-- and survives a redeploy. Skips the HTTP call whenever nothing is running, so an idle install
-- isn't waking the app every minute for a walk nobody started — see `cms_column_discovery_status`
-- on `store_connections`.
create or replace function public.trigger_cms_column_discovery()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_running bigint;
begin
  select count(*) into v_running from public.store_connections where cms_column_discovery_status = 'running';
  if coalesce(v_running, 0) = 0 then
    return;
  end if;

  perform public.call_internal_route('/api/internal/catalog/discover-columns');
end;
$$;

revoke all on function public.trigger_cms_column_discovery() from public, anon, authenticated;

-- Idempotent re-run guard, same as the other per-connection cron jobs in this schema: a migration
-- replayed against an environment that already scheduled this job would otherwise error rather
-- than no-op.
select cron.unschedule('cms-column-discovery') where exists (select 1 from cron.job where jobname = 'cms-column-discovery');

select cron.schedule(
  'cms-column-discovery',
  '* * * * *',
  $$select public.trigger_cms_column_discovery()$$
);
