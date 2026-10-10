-- ─── Exact, scalable session billing ──────────────────────────────────────────

-- 1. Products the setup scan left out because they have no image (never published).
alter table public.sizing_runs add column if not exists products_without_image integer not null default 0;

-- 2. A running count of the session units each merchant used this cycle. `consume_session_units`
--    used to add up every usage event of the cycle on every turn, which grows with the store's
--    traffic and is read while the merchant's row is locked, so every concurrent turn of a busy
--    store queued behind it. The counter is kept in the same short row update instead, and is
--    rebuilt from the events once, whenever a new cycle starts.
alter table public.users add column if not exists session_units_used_cycle bigint not null default 0;
alter table public.users add column if not exists session_usage_cycle_start timestamptz;

-- 3. What each charged turn was made of, so any store's bill can be rebuilt line by line.
alter table public.session_usage_events add column if not exists input_tokens bigint not null default 0;
alter table public.session_usage_events add column if not exists cached_tokens bigint not null default 0;
alter table public.session_usage_events add column if not exists output_tokens bigint not null default 0;
alter table public.session_usage_events add column if not exists model text;

drop function if exists public.consume_session_units(uuid, text, bigint, integer, integer, timestamptz, integer, text, bigint, integer, text);

create or replace function public.consume_session_units(
  p_user_id uuid,
  p_session_id text,
  p_cost_nanos bigint,
  p_acs_searches integer,
  p_gemini_calls integer,
  p_cycle_start timestamptz,
  p_included_allowance integer,
  p_idempotency_key text,
  p_unit_nanos bigint default 2500000,
  p_balance_floor integer default 0,
  p_source text default null,
  p_input_tokens bigint default 0,
  p_cached_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_model text default null
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  current_balance integer;
  carry bigint;
  used_cycle bigint;
  cycle_start timestamptz;
  combined bigint;
  units integer;
  remainder bigint;
  previous_units bigint;
  previous_overage bigint;
  next_overage bigint;
  units_to_charge integer;
  remaining_balance integer;
begin
  if p_cost_nanos < 0 then raise exception 'cost must be non-negative'; end if;
  if p_unit_nanos <= 0 then raise exception 'unit size must be positive'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'idempotency key is required';
  end if;
  if p_source is not null and p_source not in ('store', 'preview') then
    raise exception 'invalid usage source';
  end if;

  select session_units_balance, session_cost_carry_nanos, session_units_used_cycle, session_usage_cycle_start
    into current_balance, carry, used_cycle, cycle_start
  from public.users
  where id = p_user_id
  for update;

  if current_balance is null then raise exception 'account not found'; end if;

  if exists (
    select 1 from public.session_usage_events where idempotency_key = p_idempotency_key
  ) then
    return current_balance;
  end if;

  -- The counter is only trusted for the cycle it was built in. A new cycle (or the first charge
  -- after this migration) rebuilds it once from the events, which is a small read at that moment.
  if cycle_start is not null and cycle_start = p_cycle_start then
    previous_units := used_cycle;
  else
    select coalesce(sum(e.units_charged), 0) into previous_units
    from public.session_usage_events e
    where e.owner_id = p_user_id and e.created_at >= p_cycle_start;
  end if;

  combined := carry + p_cost_nanos;
  units := least(combined / p_unit_nanos, 2147483647::bigint)::integer;
  remainder := combined % p_unit_nanos;

  previous_overage := greatest(previous_units - greatest(p_included_allowance, 0), 0);
  next_overage := greatest(previous_units + units - greatest(p_included_allowance, 0), 0);
  units_to_charge := least(greatest(next_overage - previous_overage, 0), 2147483647)::integer;
  remaining_balance := current_balance - units_to_charge;
  if remaining_balance < p_balance_floor then
    remaining_balance := p_balance_floor;
  end if;

  update public.users
  set session_units_balance = remaining_balance,
      session_cost_carry_nanos = remainder,
      session_units_used_cycle = previous_units + units,
      session_usage_cycle_start = p_cycle_start,
      updated_at = now()
  where id = p_user_id;

  insert into public.session_usage_events (
    owner_id, session_id, cost_nanos, acs_searches, gemini_calls, units_charged, idempotency_key, source,
    input_tokens, cached_tokens, output_tokens, model
  ) values (
    p_user_id, p_session_id, p_cost_nanos, p_acs_searches, p_gemini_calls, units, p_idempotency_key, p_source,
    greatest(p_input_tokens, 0), greatest(p_cached_tokens, 0), greatest(p_output_tokens, 0), p_model
  );

  return remaining_balance;
end;
$$;

revoke all on function public.consume_session_units(uuid, text, bigint, integer, integer, timestamptz, integer, text, bigint, integer, text, bigint, bigint, bigint, text)
  from public, anon, authenticated;
grant execute on function public.consume_session_units(uuid, text, bigint, integer, integer, timestamptz, integer, text, bigint, integer, text, bigint, bigint, bigint, text)
  to service_role;

-- Units used this cycle, read from the counter when it belongs to the cycle asked about.
create or replace function public.session_units_used(p_owner_id uuid, p_since timestamptz)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select case
    when u.session_usage_cycle_start = p_since then u.session_units_used_cycle
    else (
      select coalesce(sum(e.units_charged), 0)::bigint
      from public.session_usage_events e
      where e.owner_id = p_owner_id and e.created_at >= p_since
    )
  end
  from public.users u
  where u.id = p_owner_id;
$$;

revoke all on function public.session_units_used(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.session_units_used(uuid, timestamptz) to service_role;

-- 4. Daily reconciliation per merchant: what the turns cost us against the units burned for them.
--    `gap_nanos` is cost not yet covered by a burned unit; it can only ever be the carry (below one
--    unit). Anything larger means a charge was lost and is worth an alert.
create or replace view public.session_billing_daily
with (security_invoker = true)
as
select
  e.owner_id,
  date_trunc('day', e.created_at) as day,
  count(*) as charges,
  sum(e.cost_nanos) as cost_nanos,
  sum(e.units_charged) as units,
  sum(e.units_charged) * 2500000 as units_nanos,
  sum(e.cost_nanos) - sum(e.units_charged) * 2500000 as gap_nanos,
  sum(e.acs_searches) as acs_searches,
  sum(e.gemini_calls) as gemini_calls,
  sum(e.input_tokens) as input_tokens,
  sum(e.cached_tokens) as cached_tokens,
  sum(e.output_tokens) as output_tokens
from public.session_usage_events e
group by e.owner_id, date_trunc('day', e.created_at);

revoke all on public.session_billing_daily from public, anon, authenticated;
grant select on public.session_billing_daily to service_role;
