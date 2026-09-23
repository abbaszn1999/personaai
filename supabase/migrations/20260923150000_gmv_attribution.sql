-- Persona GMV attribution. Sales the widget caused are recorded here, in USD cents,
-- and a later Stripe renewal invoice bills 3% of the unbilled Main-plan balance.
-- Refunds are negative rows. Trial and legacy-test rows are stored with billable = false
-- so the merchant can see them without being charged.

alter table public.cart_events
  add column if not exists platform text,
  add column if not exists platform_item_id text,
  add column if not exists ip_hash text,
  add column if not exists ua_hash text;

create index if not exists cart_events_owner_item_created_idx
  on public.cart_events (owner_id, platform_item_id, created_at);

alter table public.store_connections
  add column if not exists orders_access text;

alter table public.store_connections drop constraint if exists store_connections_orders_access_check;
alter table public.store_connections
  add constraint store_connections_orders_access_check
  check (orders_access is null or orders_access in ('active', 'missing'));

create table if not exists public.gmv_commission_charges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  idempotency_key text not null unique,
  stripe_invoice_id text unique,
  gmv_usd_cents integer not null default 0,
  commission_usd_cents integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'invoiced')),
  created_at timestamptz not null default now()
);

create index if not exists gmv_commission_charges_owner_idx
  on public.gmv_commission_charges (owner_id, created_at desc);

create table if not exists public.gmv_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  platform text not null check (platform in ('shopify', 'wordpress', 'woocommerce')),
  order_id text not null,
  order_name text,
  line_id text not null,
  platform_item_id text,
  product_name text not null,
  kind text not null check (kind in ('sale', 'refund')),
  source_key text not null,
  amount_original numeric not null,
  currency text not null,
  fx_rate numeric not null,
  amount_usd_cents integer not null,
  session_id text,
  match_method text not null check (match_method in ('line_tag', 'device_match')),
  billable boolean not null,
  occurred_at timestamptz not null,
  charge_id uuid references public.gmv_commission_charges(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (owner_id, platform, source_key)
);

create index if not exists gmv_ledger_owner_occurred_idx
  on public.gmv_ledger (owner_id, occurred_at desc);

create index if not exists gmv_ledger_order_idx
  on public.gmv_ledger (owner_id, platform, order_id);

create index if not exists gmv_ledger_unbilled_idx
  on public.gmv_ledger (owner_id, occurred_at)
  where charge_id is null and billable;

create table if not exists public.fx_rates_daily (
  base text not null,
  day date not null,
  rates jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (base, day)
);

alter table public.gmv_ledger enable row level security;
alter table public.gmv_commission_charges enable row level security;
alter table public.fx_rates_daily enable row level security;
