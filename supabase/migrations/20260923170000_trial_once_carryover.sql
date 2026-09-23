-- Trial is once per account. Upgrading to Main during that period moves the unused
-- include into the purchased balances exactly once, keyed by the Trial subscription.

alter table public.billing_accounts
  add column if not exists trial_used_at timestamptz;

update public.billing_accounts a
set trial_used_at = coalesce(a.trial_used_at, s.first_seen)
from (
  select user_id, min(created_at) as first_seen
  from public.billing_subscriptions
  where tier_id = 'trial' and user_id is not null
    and status not in ('incomplete', 'incomplete_expired')
  group by user_id
) s
where a.user_id = s.user_id and a.trial_used_at is null;

-- Inline checks get generated names, so match them by definition rather than by name.
do $$
declare
  constraint_name name;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'billing_balance_ledger'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%source_type%'
  loop
    execute format('alter table public.billing_balance_ledger drop constraint %I', constraint_name);
  end loop;

  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'billing_balance_ledger'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%balance_after%'
  loop
    execute format('alter table public.billing_balance_ledger drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.billing_balance_ledger
  add constraint billing_balance_ledger_source_type_check
  check (source_type in ('stripe_payment', 'stripe_refund', 'manual', 'trial_carryover'));

create table if not exists public.billing_trial_carryovers (
  trial_subscription_id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  session_added integer not null default 0,
  live_seconds_added integer not null default 0,
  garment_added integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.billing_trial_carryovers enable row level security;

-- Inserting the marker and granting the balances are one transaction. A replay finds the
-- marker and grants nothing. A failure rolls the insert back, so Stripe can retry.
create or replace function public.apply_trial_carryover(
  p_user_id uuid,
  p_trial_subscription_id text,
  p_period_start timestamptz,
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
  if p_trial_subscription_id is null or length(trim(p_trial_subscription_id)) = 0 then
    raise exception 'trial subscription id is required';
  end if;
  if p_period_start is null then
    raise exception 'trial period start is required';
  end if;

  select session_units_balance, live_tryon_seconds_balance, credits
    into session_balance, live_balance, garment_balance
  from public.users where id = p_user_id for update;
  if not found then
    return false;
  end if;

  insert into public.billing_trial_carryovers (trial_subscription_id, user_id)
  values (p_trial_subscription_id, p_user_id)
  on conflict (trial_subscription_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false;
  end if;

  select coalesce(sum(units_charged), 0) into session_used
  from public.session_usage_events
  where owner_id = p_user_id and created_at >= p_period_start;

  select coalesce(sum(duration_seconds), 0) into live_used
  from public.realtime_tryon_events
  where owner_id = p_user_id and billable and created_at >= p_period_start;

  select coalesce(sum(units), 0) into garment_used
  from public.image_generations
  where user_id = p_user_id and created_at >= p_period_start;

  v_session_added := greatest(coalesce(p_session_allowance, 0)::bigint - session_used, 0)::integer;
  v_live_added := greatest(coalesce(p_live_allowance, 0)::bigint - live_used, 0)::integer;
  v_garment_added := greatest(coalesce(p_garment_allowance, 0)::bigint - garment_used, 0)::integer;

  update public.users
  set session_units_balance = session_units_balance + v_session_added,
      live_tryon_seconds_balance = live_tryon_seconds_balance + v_live_added,
      credits = credits + v_garment_added,
      updated_at = now()
  where id = p_user_id;

  if v_session_added > 0 then
    insert into public.billing_balance_ledger (
      user_id, balance_type, delta, balance_after, source_type, source_id
    ) values (
      p_user_id, 'session_units', v_session_added, session_balance + v_session_added,
      'trial_carryover', p_trial_subscription_id
    );
  end if;
  if v_live_added > 0 then
    insert into public.billing_balance_ledger (
      user_id, balance_type, delta, balance_after, source_type, source_id
    ) values (
      p_user_id, 'live_tryon_seconds', v_live_added, live_balance + v_live_added,
      'trial_carryover', p_trial_subscription_id
    );
  end if;
  if v_garment_added > 0 then
    insert into public.billing_balance_ledger (
      user_id, balance_type, delta, balance_after, source_type, source_id
    ) values (
      p_user_id, 'image_credits', v_garment_added, garment_balance + v_garment_added,
      'trial_carryover', p_trial_subscription_id
    );
  end if;

  update public.billing_trial_carryovers
  set session_added = v_session_added,
      live_seconds_added = v_live_added,
      garment_added = v_garment_added
  where trial_subscription_id = p_trial_subscription_id;

  return true;
end;
$$;

revoke all on function public.apply_trial_carryover(uuid, text, timestamptz, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.apply_trial_carryover(uuid, text, timestamptz, integer, integer, integer)
  to service_role;

-- A canceled subscription must not overwrite the tier of the plan that replaced it.
-- The first paid Trial stamps trial_used_at and nothing clears it. A declined first payment
-- (incomplete) does not use the Trial up.
create or replace function public.sync_billing_subscription(
  p_user_id uuid, p_stripe_customer_id text, p_stripe_subscription_id text,
  p_stripe_product_id text, p_stripe_price_id text, p_tier_id text,
  p_status text, p_current_period_start timestamptz,
  p_current_period_end timestamptz, p_cancel_at_period_end boolean,
  p_canceled_at timestamptz, p_event_created_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare updated_rows integer;
begin
  if p_tier_id not in ('trial', 'main') then raise exception 'invalid tier'; end if;
  if not exists (select 1 from public.users where id = p_user_id) then raise exception 'account not found'; end if;

  insert into public.billing_accounts (user_id, stripe_customer_id, access_mode, updated_at)
  values (p_user_id, p_stripe_customer_id, 'stripe', now())
  on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id,
    access_mode = 'stripe', updated_at = now();

  insert into public.billing_subscriptions (
    user_id, stripe_customer_id, stripe_subscription_id, stripe_product_id,
    stripe_price_id, tier_id, status, current_period_start,
    current_period_end, cancel_at_period_end, canceled_at,
    last_stripe_event_created_at, updated_at
  ) values (
    p_user_id, p_stripe_customer_id, p_stripe_subscription_id, nullif(p_stripe_product_id, ''),
    p_stripe_price_id, p_tier_id, p_status, p_current_period_start,
    p_current_period_end, p_cancel_at_period_end, p_canceled_at, p_event_created_at, now()
  ) on conflict (stripe_subscription_id) do update set
    user_id = excluded.user_id, stripe_customer_id = excluded.stripe_customer_id,
    stripe_product_id = excluded.stripe_product_id, stripe_price_id = excluded.stripe_price_id,
    tier_id = excluded.tier_id,
    status = excluded.status, current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end, canceled_at = excluded.canceled_at,
    last_stripe_event_created_at = excluded.last_stripe_event_created_at, updated_at = now()
  where public.billing_subscriptions.last_stripe_event_created_at is null
     or public.billing_subscriptions.last_stripe_event_created_at <= excluded.last_stripe_event_created_at;

  get diagnostics updated_rows = row_count;
  if updated_rows > 0 and p_tier_id = 'trial' and p_status in ('active', 'trialing', 'past_due', 'canceled') then
    update public.billing_accounts
    set trial_used_at = coalesce(trial_used_at, now())
    where user_id = p_user_id;
  end if;
  if updated_rows > 0 and p_status in ('active', 'trialing', 'past_due') then
    update public.users set subscription_tier = p_tier_id, updated_at = now() where id = p_user_id;
  end if;
  return updated_rows > 0;
end;
$function$;
