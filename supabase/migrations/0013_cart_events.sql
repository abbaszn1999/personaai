-- ─── Persona-attributed cart events ─────────────────────────────────────────
-- One row per add-to-cart the embedded widget actually caused (or attempted),
-- logged by the shopper's own browser right after the real WooCommerce Store
-- API call resolves — so `success` reflects WooCommerce's real response, not
-- a guess. Powers the analytics page's cart-value/top-products metrics. Never
-- represents a completed purchase — see src/lib/db/analytics.ts for how this
-- is aggregated and clearly labeled.
create table public.cart_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id text not null,
  product_id text not null,
  product_name text not null,
  price numeric not null,
  currency text not null default 'USD',
  quantity integer not null default 1,
  success boolean not null,
  created_at timestamptz not null default now()
);

create index cart_events_workspace_created_idx on public.cart_events(workspace_id, created_at);

alter table public.cart_events enable row level security;
