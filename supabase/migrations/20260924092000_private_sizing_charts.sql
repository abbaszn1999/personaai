-- Keep the shared global chart registry physically separate from charts entered for one store's
-- private-label or unbranded products. A private chart must never become evidence that a brand is
-- global, short-circuit global research, or become visible to another merchant.

create table public.sizing_charts_private (
  id               uuid primary key default gen_random_uuid(),
  connection_id    uuid not null references public.store_connections(id) on delete cascade,
  brand_key        text not null,
  sizing_category  text not null,
  chart_rows       jsonb not null default '[]'::jsonb,
  confidence       numeric(3, 2)
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source_url       text,
  provenance       text not null
    check (provenance in ('research', 'manual', 'merchant')),
  version          integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  audience         text not null default 'unisex'
    check (audience in ('mens', 'womens', 'boys', 'girls', 'kids', 'unisex')),
  source_title     text not null default '',
  variant_name     text not null
    check (length(trim(variant_name)) > 0),
  covers_leaves    text[] not null default '{}'::text[]
);

create unique index sizing_charts_private_identity_idx
  on public.sizing_charts_private
    (connection_id, brand_key, sizing_category, variant_name);

create index sizing_charts_private_lookup_idx
  on public.sizing_charts_private
    (connection_id, brand_key, sizing_category);

create index sizing_charts_private_covers_leaves_idx
  on public.sizing_charts_private using gin (covers_leaves);

alter table public.sizing_charts_private enable row level security;

comment on table public.sizing_charts_private is
  'Connection-scoped charts entered for private-label and unbranded products. Never used as global '
  'brand proof or shared chart research.';

-- Preserve every existing merchant chart exactly, including ids and timestamps. Chart assignments
-- reference variant_name rather than chart id, but retaining ids also keeps logs and diagnostics
-- stable across the split.
insert into public.sizing_charts_private (
  id,
  connection_id,
  brand_key,
  sizing_category,
  chart_rows,
  confidence,
  source_url,
  provenance,
  version,
  created_at,
  updated_at,
  audience,
  source_title,
  variant_name,
  covers_leaves
)
select
  id,
  connection_id,
  brand_key,
  sizing_category,
  chart_rows,
  confidence,
  source_url,
  provenance,
  version,
  created_at,
  updated_at,
  audience,
  source_title,
  variant_name,
  covers_leaves
from public.sizing_charts
where connection_id is not null;

delete from public.sizing_charts
where connection_id is not null;

drop index if exists public.sizing_charts_scoped_idx;

-- Keep connection_id for row-shape compatibility, but make the old table provably global-only.
alter table public.sizing_charts
  add constraint sizing_charts_global_only
  check (connection_id is null);

comment on table public.sizing_charts is
  'Shared global-brand sizing chart registry only. Store-private and unbranded charts are stored in '
  'sizing_charts_private.';
