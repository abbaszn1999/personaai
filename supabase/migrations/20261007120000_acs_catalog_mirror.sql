-- One row per ACS document this app wrote, per store, so Setup's Stage 5 table pages its own
-- catalog in the database instead of listing the whole shared ACS branch (every tenant) to find it.
-- Written alongside every ACS import, availability patch and delete; reconciled against ACS by a
-- full walk now and then, which is what `acs_catalog_mirror_state.complete_at` records.
-- Private: RLS on with no policies, so only the service role reads or writes it.
create table if not exists public.acs_catalog_mirror (
  connection_id uuid not null references public.store_connections(id) on delete cascade,
  acs_id text not null,
  -- The parent's id for a variant, the product's own id otherwise: the table lists a parent and
  -- then its variants.
  primary_id text not null,
  product_type text not null,
  availability text not null,
  brand_key text not null default '',
  haystack text not null default '',
  record jsonb not null,
  written_at timestamptz not null default now(),
  primary key (connection_id, acs_id)
);

create index if not exists acs_catalog_mirror_order_idx
  on public.acs_catalog_mirror (connection_id, primary_id, product_type, acs_id);

alter table public.acs_catalog_mirror enable row level security;

create table if not exists public.acs_catalog_mirror_state (
  connection_id uuid primary key references public.store_connections(id) on delete cascade,
  -- When a full ACS walk last matched the mirror to ACS. Null means the mirror is not trusted yet
  -- (never reconciled, or a mirror write failed since) and readers walk ACS instead.
  complete_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.acs_catalog_mirror_state enable row level security;

-- The table's summary chips, counted over the whole store in one round trip.
create or replace function public.acs_catalog_mirror_counts(p_connection_id uuid)
returns table (product_type text, availability text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select product_type, availability, count(*)::bigint
  from public.acs_catalog_mirror
  where connection_id = p_connection_id
  group by product_type, availability;
$$;

revoke all on function public.acs_catalog_mirror_counts(uuid) from public, anon, authenticated;
