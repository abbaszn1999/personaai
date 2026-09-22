-- At-cost wallets. Old purchased garment credits and Lucy seconds are wiped so nothing
-- bought at the previous prices remains inside a cost-priced wallet. Session carry and
-- usage history stay. Balances may now sit below zero, down to the grace floor the
-- consume functions enforce.

update public.users
set credits = 0,
    live_tryon_seconds_balance = 0,
    updated_at = now()
where credits <> 0 or live_tryon_seconds_balance <> 0;

alter table public.users drop constraint if exists users_credits_nonnegative;
alter table public.users drop constraint if exists users_live_tryon_seconds_balance_check;
alter table public.users drop constraint if exists users_session_units_balance_check;

alter table public.users
  add column if not exists overage_cap_cents integer;

alter table public.users drop constraint if exists users_overage_cap_cents_check;
alter table public.users
  add constraint users_overage_cap_cents_check
  check (overage_cap_cents is null or overage_cap_cents >= 0);

alter table public.billing_orders
  add column if not exists units_to_grant integer not null default 0;

alter table public.billing_orders drop constraint if exists billing_orders_units_to_grant_check;
alter table public.billing_orders
  add constraint billing_orders_units_to_grant_check check (units_to_grant >= 0);

alter table public.billing_orders drop constraint if exists billing_orders_kind_check;
alter table public.billing_orders
  add constraint billing_orders_kind_check
  check (kind in ('subscription', 'image_credits', 'live_tryon_seconds', 'session_units'));

alter table public.billing_balance_ledger drop constraint if exists billing_balance_ledger_balance_type_check;
alter table public.billing_balance_ledger
  add constraint billing_balance_ledger_balance_type_check
  check (balance_type in ('image_credits', 'live_tryon_seconds', 'session_units'));

create table if not exists public.billing_usage_alerts (
  user_id uuid not null references public.users(id) on delete cascade,
  wallet text not null check (wallet in ('sessions', 'live', 'garments')),
  cycle_start timestamptz not null,
  threshold integer not null check (threshold in (80, 100)),
  created_at timestamptz not null default now(),
  primary key (user_id, wallet, cycle_start, threshold)
);

alter table public.billing_usage_alerts enable row level security;

create table if not exists public.billing_rollovers (
  user_id uuid not null references public.users(id) on delete cascade,
  cycle_start timestamptz not null,
  carries boolean not null,
  session_added integer not null default 0,
  live_seconds_added integer not null default 0,
  garment_added integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, cycle_start)
);

alter table public.billing_rollovers enable row level security;

-- Included allowance is still consumed first. The purchased balance may fall to p_balance_floor
-- (a negative grace margin) and no further. A charge that would pass the floor is refused
-- and not logged.
drop function if exists public.consume_image_generation(uuid, varchar, timestamptz, integer, integer);

create or replace function public.consume_image_generation(
  p_user_id uuid,
  p_kind varchar,
  p_cycle_start timestamptz,
  p_included_allowance integer,
  p_units integer default 1,
  p_balance_floor integer default 0
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_credits integer;
  used_this_cycle bigint;
  included_remaining bigint;
  from_credits integer;
begin
  if p_units is null or p_units < 1 then
    raise exception 'units must be positive';
  end if;

  select credits into current_credits
    from public.users where id = p_user_id for update;
  if current_credits is null then return false; end if;

  select coalesce(sum(units), 0) into used_this_cycle
    from public.image_generations
    where user_id = p_user_id and created_at >= p_cycle_start;

  included_remaining := greatest(greatest(coalesce(p_included_allowance, 0), 0)::bigint - used_this_cycle, 0);
  from_credits := greatest(p_units::bigint - included_remaining, 0)::integer;

  if from_credits > 0 and current_credits - from_credits < p_balance_floor then
    return false;
  end if;

  if from_credits > 0 then
    update public.users
    set credits = credits - from_credits, updated_at = now()
    where id = p_user_id;
  end if;

  insert into public.image_generations (user_id, kind, units)
  values (p_user_id, p_kind, p_units);
  return true;
end;
$$;

revoke all on function public.consume_image_generation(uuid, varchar, timestamptz, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_image_generation(uuid, varchar, timestamptz, integer, integer, integer)
  to service_role;

-- A finished live session is billed after the fact, so the balance clamps at the floor
-- instead of failing the already-rendered minute.
drop function if exists public.consume_live_tryon_seconds(uuid, text, text, text, integer, timestamptz, integer, text, boolean);

create or replace function public.consume_live_tryon_seconds(
  p_user_id uuid,
  p_session_id text,
  p_product_id text,
  p_product_name text,
  p_duration_seconds integer,
  p_cycle_start timestamptz,
  p_included_allowance integer,
  p_idempotency_key text default null,
  p_billable boolean default true,
  p_balance_floor integer default 0
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  current_balance integer;
  previous_seconds bigint;
  previous_overage bigint;
  next_overage bigint;
  seconds_to_charge integer;
  remaining_balance integer;
begin
  if p_duration_seconds <= 0 then raise exception 'duration must be positive'; end if;

  select live_tryon_seconds_balance into current_balance from public.users
  where id = p_user_id for update;
  if current_balance is null then raise exception 'account not found'; end if;

  if p_idempotency_key is not null then
    if length(trim(p_idempotency_key)) < 8 then
      raise exception 'idempotency key is required';
    end if;
    if exists (select 1 from public.realtime_tryon_events where idempotency_key = p_idempotency_key) then
      return current_balance;
    end if;
  end if;

  select coalesce(sum(e.duration_seconds), 0) into previous_seconds
  from public.realtime_tryon_events e
  where e.owner_id = p_user_id and e.created_at >= p_cycle_start and e.billable;

  if p_billable then
    previous_overage := greatest(previous_seconds - greatest(p_included_allowance, 0), 0);
    next_overage := greatest(previous_seconds + p_duration_seconds - greatest(p_included_allowance, 0), 0);
    seconds_to_charge := least(next_overage - previous_overage, 2147483647)::integer;
    remaining_balance := current_balance - seconds_to_charge;
    if remaining_balance < p_balance_floor then
      remaining_balance := p_balance_floor;
    end if;
    update public.users set live_tryon_seconds_balance = remaining_balance, updated_at = now()
    where id = p_user_id;
  else
    remaining_balance := current_balance;
  end if;

  insert into public.realtime_tryon_events (
    owner_id, session_id, product_id, product_name, duration_seconds, idempotency_key, billable
  ) values (
    p_user_id, p_session_id, p_product_id, p_product_name, p_duration_seconds, p_idempotency_key, p_billable
  );

  return remaining_balance;
end;
$$;

revoke all on function public.consume_live_tryon_seconds(uuid, text, text, text, integer, timestamptz, integer, text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.consume_live_tryon_seconds(uuid, text, text, text, integer, timestamptz, integer, text, boolean, integer)
  to service_role;

drop function if exists public.consume_session_units(uuid, text, bigint, integer, integer, timestamptz, integer, text, bigint);

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
  p_balance_floor integer default 0
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
  remaining_balance := current_balance - units_to_charge;
  if remaining_balance < p_balance_floor then
    remaining_balance := p_balance_floor;
  end if;

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

revoke all on function public.consume_session_units(uuid, text, bigint, integer, integer, timestamptz, integer, text, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.consume_session_units(uuid, text, bigint, integer, integer, timestamptz, integer, text, bigint, integer)
  to service_role;

create or replace function public.fulfill_billing_order(
  p_order_id uuid, p_stripe_event_id text, p_checkout_session_id text,
  p_payment_intent_id text, p_amount_total integer, p_currency text
) returns table (
  fulfilled boolean, order_status text, credits_balance integer, live_seconds_balance integer
) language plpgsql security definer set search_path = public as $$
declare
  v_order public.billing_orders%rowtype;
  v_credits integer;
  v_seconds integer;
  v_units integer;
begin
  select * into v_order from public.billing_orders where id = p_order_id for update;
  if not found then raise exception 'billing order not found'; end if;
  if v_order.status = 'fulfilled' then
    select credits, live_tryon_seconds_balance into v_credits, v_seconds
    from public.users where id = v_order.user_id;
    return query select false, v_order.status, v_credits, v_seconds; return;
  end if;
  if v_order.kind = 'subscription' then
    raise exception 'subscription orders are synchronized by subscription webhooks';
  end if;
  if v_order.user_id is null then raise exception 'billing account was deleted'; end if;
  if p_amount_total <> v_order.expected_amount_cents then raise exception 'payment amount mismatch'; end if;
  if lower(p_currency) <> lower(v_order.currency) then raise exception 'payment currency mismatch'; end if;
  if v_order.stripe_checkout_session_id is not null
     and v_order.stripe_checkout_session_id <> p_checkout_session_id then
    raise exception 'checkout session mismatch';
  end if;
  select credits, live_tryon_seconds_balance, session_units_balance
    into v_credits, v_seconds, v_units
  from public.users where id = v_order.user_id for update;
  if not found then raise exception 'account not found'; end if;
  if v_order.kind = 'image_credits' then
    v_credits := v_credits + v_order.credits_to_grant;
    update public.users set credits = v_credits, updated_at = now() where id = v_order.user_id;
    insert into public.billing_balance_ledger (
      user_id, order_id, balance_type, delta, balance_after, source_type, source_id
    ) values (
      v_order.user_id, v_order.id, 'image_credits', v_order.credits_to_grant,
      v_credits, 'stripe_payment', p_checkout_session_id
    );
  elsif v_order.kind = 'live_tryon_seconds' then
    v_seconds := v_seconds + v_order.seconds_to_grant;
    update public.users set live_tryon_seconds_balance = v_seconds, updated_at = now()
    where id = v_order.user_id;
    insert into public.billing_balance_ledger (
      user_id, order_id, balance_type, delta, balance_after, source_type, source_id
    ) values (
      v_order.user_id, v_order.id, 'live_tryon_seconds', v_order.seconds_to_grant,
      v_seconds, 'stripe_payment', p_checkout_session_id
    );
  elsif v_order.kind = 'session_units' then
    v_units := v_units + v_order.units_to_grant;
    update public.users set session_units_balance = v_units, updated_at = now()
    where id = v_order.user_id;
    insert into public.billing_balance_ledger (
      user_id, order_id, balance_type, delta, balance_after, source_type, source_id
    ) values (
      v_order.user_id, v_order.id, 'session_units', v_order.units_to_grant,
      v_units, 'stripe_payment', p_checkout_session_id
    );
  end if;
  update public.billing_orders set
    status = 'fulfilled', stripe_checkout_session_id = p_checkout_session_id,
    stripe_payment_intent_id = nullif(p_payment_intent_id, ''),
    fulfilled_by_event_id = p_stripe_event_id, paid_at = coalesce(paid_at, now()),
    fulfilled_at = now(), updated_at = now()
  where id = v_order.id;
  return query select true, 'fulfilled'::text, v_credits, v_seconds;
end;
$$;

create or replace function public.refund_billing_order(
  p_order_id uuid, p_stripe_event_id text
) returns table (revoked integer, review_required boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_order public.billing_orders%rowtype;
  v_balance integer;
  v_granted integer;
  v_revoked integer;
  v_type text;
begin
  select * into v_order from public.billing_orders where id = p_order_id for update;
  if not found then raise exception 'billing order not found'; end if;
  if v_order.status = 'refunded' then
    return query select 0, v_order.refund_review_required; return;
  end if;
  if v_order.status <> 'fulfilled' then
    update public.billing_orders set status = 'refunded', refunded_at = now(), updated_at = now()
    where id = v_order.id;
    return query select 0, false; return;
  end if;
  if v_order.user_id is null then
    update public.billing_orders set status = 'refunded', refund_review_required = true,
      refunded_at = now(), updated_at = now() where id = v_order.id;
    return query select 0, true; return;
  end if;
  if v_order.kind = 'image_credits' then
    v_type := 'image_credits'; v_granted := v_order.credits_to_grant;
    select credits into v_balance from public.users where id = v_order.user_id for update;
    v_revoked := least(greatest(v_balance, 0), v_granted);
    update public.users set credits = credits - v_revoked, updated_at = now() where id = v_order.user_id;
  elsif v_order.kind = 'live_tryon_seconds' then
    v_type := 'live_tryon_seconds'; v_granted := v_order.seconds_to_grant;
    select live_tryon_seconds_balance into v_balance
    from public.users where id = v_order.user_id for update;
    v_revoked := least(greatest(v_balance, 0), v_granted);
    update public.users set live_tryon_seconds_balance = live_tryon_seconds_balance - v_revoked,
      updated_at = now() where id = v_order.user_id;
  elsif v_order.kind = 'session_units' then
    v_type := 'session_units'; v_granted := v_order.units_to_grant;
    select session_units_balance into v_balance
    from public.users where id = v_order.user_id for update;
    v_revoked := least(greatest(v_balance, 0), v_granted);
    update public.users set session_units_balance = session_units_balance - v_revoked,
      updated_at = now() where id = v_order.user_id;
  else
    v_revoked := 0; v_granted := 0;
  end if;
  if v_revoked > 0 then
    insert into public.billing_balance_ledger (
      user_id, order_id, balance_type, delta, balance_after, source_type, source_id
    ) values (
      v_order.user_id, v_order.id, v_type, -v_revoked, v_balance - v_revoked,
      'stripe_refund', p_stripe_event_id
    ) on conflict (balance_type, source_type, source_id) do nothing;
  end if;
  update public.billing_orders set status = 'refunded',
    refund_review_required = v_revoked < v_granted, refunded_at = now(), updated_at = now()
  where id = v_order.id;
  return query select v_revoked, v_revoked < v_granted;
end;
$$;

-- The first call in a cycle inserts the marker and does not grant. The next cycle reads that
-- marker: only a previous cycle flagged carries=true moves unused include into the purchased
-- balance, and only up to twice the monthly include. Concurrent callers collide on the
-- primary key; the loser sees the existing row and does nothing.
create or replace function public.apply_billing_rollover(
  p_user_id uuid,
  p_cycle_start timestamptz,
  p_carries boolean,
  p_session_allowance integer,
  p_live_allowance integer,
  p_garment_allowance integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
  prev_start timestamptz;
  prev_carries boolean;
  session_balance integer;
  live_balance integer;
  garment_balance integer;
  session_used bigint;
  live_used bigint;
  garment_used bigint;
  v_session_added integer;
  v_live_added integer;
  v_garment_added integer;
begin
  insert into public.billing_rollovers (user_id, cycle_start, carries)
  values (p_user_id, p_cycle_start, coalesce(p_carries, false))
  on conflict (user_id, cycle_start) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false;
  end if;

  select r.cycle_start, r.carries into prev_start, prev_carries
  from public.billing_rollovers r
  where r.user_id = p_user_id and r.cycle_start < p_cycle_start
  order by r.cycle_start desc
  limit 1;

  if prev_start is null or prev_carries is not true then
    return true;
  end if;

  select session_units_balance, live_tryon_seconds_balance, credits
    into session_balance, live_balance, garment_balance
  from public.users where id = p_user_id for update;
  if session_balance is null then
    return true;
  end if;

  select coalesce(sum(units_charged), 0) into session_used
  from public.session_usage_events
  where owner_id = p_user_id and created_at >= prev_start and created_at < p_cycle_start;

  select coalesce(sum(duration_seconds), 0) into live_used
  from public.realtime_tryon_events
  where owner_id = p_user_id and billable
    and created_at >= prev_start and created_at < p_cycle_start;

  select coalesce(sum(units), 0) into garment_used
  from public.image_generations
  where user_id = p_user_id and created_at >= prev_start and created_at < p_cycle_start;

  v_session_added := least(
    greatest(coalesce(p_session_allowance, 0)::bigint - session_used, 0),
    greatest(coalesce(p_session_allowance, 0)::bigint * 2 - session_balance, 0)
  )::integer;
  v_live_added := least(
    greatest(coalesce(p_live_allowance, 0)::bigint - live_used, 0),
    greatest(coalesce(p_live_allowance, 0)::bigint * 2 - live_balance, 0)
  )::integer;
  v_garment_added := least(
    greatest(coalesce(p_garment_allowance, 0)::bigint - garment_used, 0),
    greatest(coalesce(p_garment_allowance, 0)::bigint * 2 - garment_balance, 0)
  )::integer;

  update public.users
  set session_units_balance = session_units_balance + v_session_added,
      live_tryon_seconds_balance = live_tryon_seconds_balance + v_live_added,
      credits = credits + v_garment_added,
      updated_at = now()
  where id = p_user_id;

  update public.billing_rollovers
  set session_added = v_session_added,
      live_seconds_added = v_live_added,
      garment_added = v_garment_added
  where user_id = p_user_id and cycle_start = p_cycle_start;

  return true;
end;
$$;

revoke all on function public.apply_billing_rollover(uuid, timestamptz, boolean, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.apply_billing_rollover(uuid, timestamptz, boolean, integer, integer, integer)
  to service_role;
