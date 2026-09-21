-- Final step of the wearable/unwearable-mode removal: the billing tables were the last
-- place the concept survived, kept through phase 4 only so historical rows stayed readable.
-- Every row is 'wearable' (6 orders, 0 subscriptions), so the column carries no information.

drop function if exists public.sync_billing_subscription(uuid, text, text, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz, timestamptz);

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
  if p_tier_id not in ('fixed', 'hybrid') then raise exception 'invalid tier'; end if;
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
  if updated_rows > 0 then
    update public.users set subscription_tier = p_tier_id, updated_at = now() where id = p_user_id;
  end if;
  return updated_rows > 0;
end;
$function$;

alter table public.billing_subscriptions drop column workspace_mode;
alter table public.billing_orders drop column workspace_mode;
