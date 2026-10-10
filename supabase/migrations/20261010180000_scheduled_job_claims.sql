-- The hourly catalog reconcile runs from the app's own worker loop, not only from pg_cron: the
-- pg_cron route needs `app_url` and `internal_job_secret` in Vault, and without them it is skipped
-- with nothing but a warning. Every instance runs that loop, so a claim decides which one runs a
-- scheduled job each period: whoever moves `claimed_at` forward first.
create table if not exists public.scheduled_job_claims (
  name text primary key,
  claimed_at timestamptz not null
);

comment on table public.scheduled_job_claims is
  'Last start of each periodic job the app runs itself (e.g. catalog-reconcile), claimed atomically by claim_scheduled_job.';

alter table public.scheduled_job_claims enable row level security;
revoke all on table public.scheduled_job_claims from public, anon, authenticated;
grant select, insert, update on table public.scheduled_job_claims to service_role;

-- True for exactly one caller per period: the first whose call finds the last claim at least
-- `p_every_seconds` old (or none). A period of 0 always claims, for a run started on purpose.
create or replace function public.claim_scheduled_job(p_name text, p_every_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  insert into public.scheduled_job_claims as claims (name, claimed_at)
  values (p_name, now())
  on conflict (name) do update
    set claimed_at = excluded.claimed_at
    where claims.claimed_at <= now() - make_interval(secs => greatest(p_every_seconds, 0))
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_scheduled_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_scheduled_job(text, integer) to service_role;
