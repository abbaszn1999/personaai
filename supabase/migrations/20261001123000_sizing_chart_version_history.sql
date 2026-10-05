create table if not exists public.sizing_chart_versions (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null,
  brand_key text not null,
  sizing_category text not null,
  variant_name text not null,
  version integer not null,
  snapshot jsonb not null,
  archived_at timestamptz not null default now(),
  unique (chart_id, version)
);

create index if not exists sizing_chart_versions_brand_idx
  on public.sizing_chart_versions (brand_key, archived_at desc);

alter table public.sizing_chart_versions enable row level security;

comment on table public.sizing_chart_versions is
  'Immutable pre-publication snapshots of shared global charts, retained for brand-scoped rollback.';
