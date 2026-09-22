-- One row per shopper message. cost_nanos is the turn's Gemini tokens plus ACS searches.
-- units_charged is how many whole session units that cost completed, after adding the
-- merchant's carried remainder. The purchased balance only moves for units past the included
-- allowance. The unit size defaults to 2500000 nano-dollars, matching SESSION_UNIT_NANOS.

alter table public.users
  add column if not exists session_units_balance integer not null default 0,
  add column if not exists session_cost_carry_nanos bigint not null default 0;

create table if not exists public.session_usage_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  session_id text not null,
  cost_nanos bigint not null check (cost_nanos >= 0),
  acs_searches integer not null check (acs_searches >= 0),
  gemini_calls integer not null check (gemini_calls >= 0),
  units_charged integer not null check (units_charged >= 0),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint session_usage_events_idempotency_key_key unique (idempotency_key)
);

create index if not exists session_usage_events_owner_created_idx
  on public.session_usage_events (owner_id, created_at);

alter table public.session_usage_events enable row level security;

create or replace function public.consume_session_units(
  p_user_id uuid,
  p_session_id text,
  p_cost_nanos bigint,
  p_acs_searches integer,
  p_gemini_calls integer,
  p_cycle_start timestamptz,
  p_included_allowance integer,
  p_idempotency_key text,
  p_unit_nanos bigint default 2500000
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  current_balance integer;
  carry bigint;
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

  select session_units_balance, session_cost_carry_nanos
    into current_balance, carry
  from public.users
  where id = p_user_id
  for update;

  if current_balance is null then raise exception 'account not found'; end if;

  if exists (
    select 1 from public.session_usage_events where idempotency_key = p_idempotency_key
  ) then
    return current_balance;
  end if;

  combined := carry + p_cost_nanos;
  units := least(combined / p_unit_nanos, 2147483647::bigint)::integer;
  remainder := combined % p_unit_nanos;

  select coalesce(sum(e.units_charged), 0) into previous_units
  from public.session_usage_events e
  where e.owner_id = p_user_id and e.created_at >= p_cycle_start;

  previous_overage := greatest(previous_units - greatest(p_included_allowance, 0), 0);
  next_overage := greatest(previous_units + units - greatest(p_included_allowance, 0), 0);
  units_to_charge := least(greatest(next_overage - previous_overage, 0), 2147483647)::integer;
  remaining_balance := greatest(current_balance - units_to_charge, 0);

  update public.users
  set session_units_balance = remaining_balance,
      session_cost_carry_nanos = remainder,
      updated_at = now()
  where id = p_user_id;

  insert into public.session_usage_events (
    owner_id, session_id, cost_nanos, acs_searches, gemini_calls, units_charged, idempotency_key
  ) values (
    p_user_id, p_session_id, p_cost_nanos, p_acs_searches, p_gemini_calls, units, p_idempotency_key
  );

  return remaining_balance;
end;
$$;

revoke all on function public.consume_session_units(uuid, text, bigint, integer, integer, timestamptz, integer, text, bigint)
  from public, anon, authenticated;
grant execute on function public.consume_session_units(uuid, text, bigint, integer, integer, timestamptz, integer, text, bigint)
  to service_role;
