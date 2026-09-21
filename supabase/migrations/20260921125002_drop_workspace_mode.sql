-- Phase 4 of the wearable/unwearable-mode removal: every workspace is a wearable (virtual
-- try-on) agent now, so the mode concept is dropped from the schema.

-- 1. Rewrite consume_live_tryon_seconds (both overloads) to check ownership only, not mode.
CREATE OR REPLACE FUNCTION public.consume_live_tryon_seconds(
  p_user_id uuid, p_workspace_id uuid, p_session_id text, p_product_id text,
  p_product_name text, p_duration_seconds integer, p_cycle_start timestamp with time zone,
  p_included_allowance integer
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if not exists (
    select 1 from public.workspaces
    where id = p_workspace_id and owner_id = p_user_id
  ) then raise exception 'workspace not found'; end if;
  select coalesce(sum(e.duration_seconds), 0) into previous_seconds
  from public.realtime_tryon_events e
  join public.workspaces w on w.id = e.workspace_id
  where w.owner_id = p_user_id and e.created_at >= p_cycle_start;
  previous_overage := greatest(previous_seconds - greatest(p_included_allowance, 0), 0);
  next_overage := greatest(previous_seconds + p_duration_seconds - greatest(p_included_allowance, 0), 0);
  seconds_to_charge := least(next_overage - previous_overage, 2147483647)::integer;
  remaining_balance := greatest(current_balance - seconds_to_charge, 0);
  update public.users set live_tryon_seconds_balance = remaining_balance, updated_at = now()
  where id = p_user_id;
  insert into public.realtime_tryon_events (
    workspace_id, session_id, product_id, product_name, duration_seconds
  ) values (p_workspace_id, p_session_id, p_product_id, p_product_name, p_duration_seconds);
  return remaining_balance;
end;
$function$;

CREATE OR REPLACE FUNCTION public.consume_live_tryon_seconds(
  p_user_id uuid, p_workspace_id uuid, p_session_id text, p_product_id text,
  p_product_name text, p_duration_seconds integer, p_cycle_start timestamp with time zone,
  p_included_allowance integer, p_idempotency_key text
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_balance integer; previous_seconds bigint; previous_overage bigint;
  next_overage bigint; seconds_to_charge integer; remaining_balance integer;
begin
  if p_duration_seconds <= 0 then raise exception 'duration must be positive'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'idempotency key is required';
  end if;
  select live_tryon_seconds_balance into current_balance
  from public.users where id = p_user_id for update;
  if current_balance is null then raise exception 'account not found'; end if;
  if exists (
    select 1 from public.realtime_tryon_events where idempotency_key = p_idempotency_key
  ) then return current_balance; end if;
  if not exists (
    select 1 from public.workspaces
    where id = p_workspace_id and owner_id = p_user_id
  ) then raise exception 'workspace not found'; end if;
  select coalesce(sum(e.duration_seconds), 0) into previous_seconds
  from public.realtime_tryon_events e
  join public.workspaces w on w.id = e.workspace_id
  where w.owner_id = p_user_id and e.created_at >= p_cycle_start;
  previous_overage := greatest(previous_seconds - greatest(p_included_allowance, 0), 0);
  next_overage := greatest(previous_seconds + p_duration_seconds - greatest(p_included_allowance, 0), 0);
  seconds_to_charge := least(next_overage - previous_overage, 2147483647)::integer;
  remaining_balance := greatest(current_balance - seconds_to_charge, 0);
  update public.users set live_tryon_seconds_balance = remaining_balance, updated_at = now()
  where id = p_user_id;
  insert into public.realtime_tryon_events (
    workspace_id, session_id, product_id, product_name, duration_seconds, idempotency_key
  ) values (
    p_workspace_id, p_session_id, p_product_id, p_product_name,
    p_duration_seconds, p_idempotency_key
  );
  return remaining_balance;
end;
$function$;

-- 2. Rewrite sync_billing_subscription to drop the wearable/unwearable validation — every
-- subscription is wearable now, but the workspace_mode column/value is kept for this phase
-- (dropped later once billing_orders/billing_subscriptions history no longer needs it).
CREATE OR REPLACE FUNCTION public.sync_billing_subscription(
  p_user_id uuid, p_stripe_customer_id text, p_stripe_subscription_id text,
  p_stripe_product_id text, p_stripe_price_id text, p_workspace_mode text, p_tier_id text,
  p_status text, p_current_period_start timestamp with time zone,
  p_current_period_end timestamp with time zone, p_cancel_at_period_end boolean,
  p_canceled_at timestamp with time zone, p_event_created_at timestamp with time zone
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare updated_rows integer;
begin
  if p_tier_id not in ('fixed', 'hybrid') then raise exception 'invalid tier'; end if;
  if not exists (select 1 from public.users where id = p_user_id) then raise exception 'account not found'; end if;
  insert into public.billing_accounts (user_id, stripe_customer_id, access_mode, updated_at)
  values (p_user_id, p_stripe_customer_id, 'stripe', now())
  on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id,
    access_mode = 'stripe', updated_at = now();
  insert into public.billing_subscriptions (
    user_id, stripe_customer_id, stripe_subscription_id, stripe_product_id,
    stripe_price_id, workspace_mode, tier_id, status, current_period_start,
    current_period_end, cancel_at_period_end, canceled_at,
    last_stripe_event_created_at, updated_at
  ) values (
    p_user_id, p_stripe_customer_id, p_stripe_subscription_id, nullif(p_stripe_product_id, ''),
    p_stripe_price_id, p_workspace_mode, p_tier_id, p_status, p_current_period_start,
    p_current_period_end, p_cancel_at_period_end, p_canceled_at, p_event_created_at, now()
  ) on conflict (stripe_subscription_id) do update set
    user_id = excluded.user_id, stripe_customer_id = excluded.stripe_customer_id,
    stripe_product_id = excluded.stripe_product_id, stripe_price_id = excluded.stripe_price_id,
    workspace_mode = excluded.workspace_mode, tier_id = excluded.tier_id,
    status = excluded.status, current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end, canceled_at = excluded.canceled_at,
    last_stripe_event_created_at = excluded.last_stripe_event_created_at, updated_at = now()
  where public.billing_subscriptions.last_stripe_event_created_at is null
     or public.billing_subscriptions.last_stripe_event_created_at <= excluded.last_stripe_event_created_at;
  get diagnostics updated_rows = row_count;
  if updated_rows > 0 then
    update public.users set subscription_tier = p_tier_id, updated_at = now() where id = p_user_id;
  end if;
  return updated_rows > 0;
end;
$function$;

-- 3. Drop the now-redundant wearable/unwearable CHECK constraints on the billing tables —
-- workspace_mode columns are kept for this phase (historical reporting), just unconstrained.
ALTER TABLE public.billing_subscriptions DROP CONSTRAINT IF EXISTS billing_subscriptions_workspace_mode_check;
ALTER TABLE public.billing_orders DROP CONSTRAINT IF EXISTS billing_orders_workspace_mode_check;

-- 4. Drop the mode column from workspaces entirely — every workspace is wearable now.
ALTER TABLE public.workspaces DROP COLUMN IF EXISTS mode;
