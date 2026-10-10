-- ─── Persona hardening ────────────────────────────────────────────────────────

-- 1. Session units used this cycle, summed in the database. The chat path used to read every usage
--    row of the cycle back and add them up in the app, which grows with every turn a store serves.
create or replace function public.session_units_used(p_owner_id uuid, p_since timestamptz)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(units_charged), 0)::bigint
  from public.session_usage_events
  where owner_id = p_owner_id and created_at >= p_since;
$$;

revoke all on function public.session_units_used(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.session_units_used(uuid, timestamptz) to service_role;

-- 2. One row per Persona turn: what the agent decided and what the shopper got. Enough to watch the
--    zero-result rate, retries, turn time and cache share per store, without any shopper text.
create table if not exists public.persona_turn_metrics (
  id bigint generated always as identity primary key,
  connection_id uuid not null references public.store_connections(id) on delete cascade,
  created_at timestamptz not null default now(),
  action text not null,
  outcome text not null,
  results integer not null default 0,
  shown integer not null default 0,
  retried boolean not null default false,
  ms integer not null,
  cached_tokens integer not null default 0
);

create index if not exists persona_turn_metrics_connection_created_idx
  on public.persona_turn_metrics (connection_id, created_at desc);

alter table public.persona_turn_metrics enable row level security;

-- Daily summary per store, for dashboards and alerts.
create or replace view public.persona_turn_daily
with (security_invoker = true)
as
select
  connection_id,
  date_trunc('day', created_at) as day,
  count(*) as turns,
  count(*) filter (where action in ('filter', 'cosine')) as searches,
  round(
    100.0 * count(*) filter (where outcome in ('empty', 'empty_size', 'exhausted', 'invalid'))
      / nullif(count(*) filter (where action in ('filter', 'cosine', 'invalid')), 0),
    1
  ) as zero_result_pct,
  round(100.0 * count(*) filter (where retried) / nullif(count(*), 0), 1) as retry_pct,
  percentile_cont(0.5) within group (order by ms) as p50_ms,
  percentile_cont(0.9) within group (order by ms) as p90_ms,
  round(avg(cached_tokens)) as avg_cached_tokens
from public.persona_turn_metrics
group by connection_id, date_trunc('day', created_at);

revoke all on public.persona_turn_daily from public, anon, authenticated;
grant select on public.persona_turn_daily to service_role;
