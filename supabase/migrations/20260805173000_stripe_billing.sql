-- Stripe-backed billing state, idempotent order fulfillment, and retry-safe live metering.
alter table public.users
  add constraint users_credits_nonnegative check (credits >= 0);

alter table public.realtime_tryon_events add column idempotency_key text;
create unique index realtime_tryon_events_idempotency_idx
  on public.realtime_tryon_events(idempotency_key) where idempotency_key is not null;

create or replace function public.consume_live_tryon_seconds(
  p_user_id uuid, p_workspace_id uuid, p_session_id text, p_product_id text,
  p_product_name text, p_duration_seconds integer, p_cycle_start timestamptz,
  p_included_allowance integer, p_idempotency_key text
) returns integer language plpgsql security definer set search_path = public as $$
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
    where id = p_workspace_id and owner_id = p_user_id and mode = 'wearable'
  ) then raise exception 'wearable workspace not found'; end if;
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
$$;

create table public.billing_accounts (
  user_id uuid primary key references public.users(id) on delete cascade,
  stripe_customer_id text unique,
  access_mode text not null default 'stripe' check (access_mode in ('stripe', 'legacy_test')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.billing_accounts (user_id, access_mode)
select id, 'legacy_test' from public.users on conflict (user_id) do nothing;

create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_product_id text,
  stripe_price_id text not null,
  workspace_mode text not null check (workspace_mode in ('wearable', 'unwearable')),
  tier_id text not null check (tier_id in ('fixed', 'hybrid')),
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  last_stripe_event_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index billing_subscriptions_user_idx on public.billing_subscriptions(user_id, updated_at desc);
create index billing_subscriptions_customer_idx on public.billing_subscriptions(stripe_customer_id);

create table public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  stripe_customer_id text,
  kind text not null check (kind in ('subscription', 'image_credits', 'live_tryon_seconds')),
  product_key text not null,
  workspace_mode text not null check (workspace_mode in ('wearable', 'unwearable')),
  tier_id text check (tier_id is null or tier_id in ('fixed', 'hybrid')),
  quantity integer not null default 1 check (quantity > 0),
  credits_to_grant integer not null default 0 check (credits_to_grant >= 0),
  seconds_to_grant integer not null default 0 check (seconds_to_grant >= 0),
  expected_amount_cents integer not null check (expected_amount_cents >= 0),
  currency text not null default 'usd',
  status text not null default 'pending' check (status in (
    'pending', 'checkout_open', 'processing', 'paid', 'fulfilled',
    'payment_failed', 'canceled', 'refunded'
  )),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_subscription_id text,
  fulfilled_by_event_id text unique,
  refund_review_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  fulfilled_at timestamptz,
  refunded_at timestamptz
);
create index billing_orders_user_idx on public.billing_orders(user_id, created_at desc);
create index billing_orders_status_idx on public.billing_orders(status, created_at);

create table public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  api_version text,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed')),
  error_message text,
  stripe_created_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index stripe_webhook_events_status_idx on public.stripe_webhook_events(status, received_at);

create table public.billing_balance_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  order_id uuid references public.billing_orders(id) on delete set null,
  balance_type text not null check (balance_type in ('image_credits', 'live_tryon_seconds')),
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  source_type text not null check (source_type in ('stripe_payment', 'stripe_refund', 'manual')),
  source_id text not null,
  created_at timestamptz not null default now(),
  unique (balance_type, source_type, source_id)
);
create index billing_balance_ledger_user_idx on public.billing_balance_ledger(user_id, created_at desc);

alter table public.billing_accounts enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_orders enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.billing_balance_ledger enable row level security;

create or replace function public.fulfill_billing_order(
  p_order_id uuid, p_stripe_event_id text, p_checkout_session_id text,
  p_payment_intent_id text, p_amount_total integer, p_currency text
) returns table (
  fulfilled boolean, order_status text, credits_balance integer, live_seconds_balance integer
) language plpgsql security definer set search_path = public as $$
declare
  v_order public.billing_orders%rowtype; v_credits integer; v_seconds integer;
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
  select credits, live_tryon_seconds_balance into v_credits, v_seconds
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
  v_order public.billing_orders%rowtype; v_balance integer; v_granted integer;
  v_revoked integer; v_type text;
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
    v_revoked := least(v_balance, v_granted);
    update public.users set credits = credits - v_revoked, updated_at = now() where id = v_order.user_id;
  elsif v_order.kind = 'live_tryon_seconds' then
    v_type := 'live_tryon_seconds'; v_granted := v_order.seconds_to_grant;
    select live_tryon_seconds_balance into v_balance
    from public.users where id = v_order.user_id for update;
    v_revoked := least(v_balance, v_granted);
    update public.users set live_tryon_seconds_balance = live_tryon_seconds_balance - v_revoked,
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

create or replace function public.sync_billing_subscription(
  p_user_id uuid, p_stripe_customer_id text, p_stripe_subscription_id text,
  p_stripe_product_id text, p_stripe_price_id text, p_workspace_mode text,
  p_tier_id text, p_status text, p_current_period_start timestamptz,
  p_current_period_end timestamptz, p_cancel_at_period_end boolean,
  p_canceled_at timestamptz, p_event_created_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
declare updated_rows integer;
begin
  if p_workspace_mode not in ('wearable', 'unwearable') then raise exception 'invalid workspace mode'; end if;
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
$$;

revoke all on function public.fulfill_billing_order(uuid, text, text, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.refund_billing_order(uuid, text)
  from public, anon, authenticated;
revoke all on function public.sync_billing_subscription(
  uuid, text, text, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.consume_live_tryon_seconds(
  uuid, uuid, text, text, text, integer, timestamptz, integer, text
) from public, anon, authenticated;
grant execute on function public.fulfill_billing_order(uuid, text, text, text, integer, text) to service_role;
grant execute on function public.refund_billing_order(uuid, text) to service_role;
grant execute on function public.sync_billing_subscription(
  uuid, text, text, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz, timestamptz
) to service_role;
grant execute on function public.consume_live_tryon_seconds(
  uuid, uuid, text, text, text, integer, timestamptz, integer, text
) to service_role;
