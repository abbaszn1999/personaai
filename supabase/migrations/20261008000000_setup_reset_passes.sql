-- "Start from scratch" removes a store's products from ACS at about 20 a second, so a large store
-- takes longer than one function may run. The cleanup now works in passes: a pass holds a lease
-- while it deletes and releases it when its time is up, and this schedule starts the next pass every
-- minute until the cleanup is done. The HTTP call is skipped whenever no cleanup is running.
alter table public.store_connections
  add column if not exists setup_reset_total integer,
  add column if not exists setup_reset_lease_until timestamptz;

comment on column public.store_connections.setup_reset_total is
  'Start-from-scratch ACS cleanup: the store''s documents in ACS when it began, once the first pass has listed them.';

comment on column public.store_connections.setup_reset_lease_until is
  'Start-from-scratch ACS cleanup: until when the pass now deleting holds it; set to the stop time when a pass ends.';

create or replace function public.trigger_setup_reset_cleanup()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_running bigint;
begin
  select count(*) into v_running from public.store_connections where setup_reset_status = 'running';
  if coalesce(v_running, 0) = 0 then
    return;
  end if;
  perform public.call_internal_route('/api/internal/catalog/setup-reset');
end;
$$;

revoke all on function public.trigger_setup_reset_cleanup() from public, anon, authenticated;

select cron.unschedule('setup-reset-cleanup') where exists (select 1 from cron.job where jobname = 'setup-reset-cleanup');

select cron.schedule(
  'setup-reset-cleanup',
  '* * * * *',
  $$select public.trigger_setup_reset_cleanup()$$
);
