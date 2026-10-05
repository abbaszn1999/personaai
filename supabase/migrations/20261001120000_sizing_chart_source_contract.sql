-- Rich chart identity and routing metadata. Existing rows receive deterministic backfill values so
-- deployments remain backward compatible; future publishers provide verified values explicitly.

alter table public.sizing_charts
  add column if not exists source_table_id text not null default '',
  add column if not exists applicability jsonb not null default '{}'::jsonb,
  add column if not exists deciding_measurements text[] not null default '{}'::text[],
  add column if not exists source_verification jsonb not null default '{}'::jsonb;

alter table public.sizing_charts_private
  add column if not exists source_table_id text not null default '',
  add column if not exists applicability jsonb not null default '{}'::jsonb,
  add column if not exists deciding_measurements text[] not null default '{}'::text[],
  add column if not exists source_verification jsonb not null default '{}'::jsonb;

update public.sizing_charts
set source_table_id = trim(both '-' from regexp_replace(
  lower(sizing_category || '-' || variant_name),
  '[^a-z0-9]+',
  '-',
  'g'
))
where source_table_id = '';

update public.sizing_charts_private
set source_table_id = trim(both '-' from regexp_replace(
  lower(sizing_category || '-' || variant_name),
  '[^a-z0-9]+',
  '-',
  'g'
))
where source_table_id = '';

alter table public.sizing_charts
  add constraint sizing_charts_applicability_object
  check (jsonb_typeof(applicability) = 'object'),
  add constraint sizing_charts_source_verification_object
  check (jsonb_typeof(source_verification) = 'object');

alter table public.sizing_charts_private
  add constraint sizing_charts_private_applicability_object
  check (jsonb_typeof(applicability) = 'object'),
  add constraint sizing_charts_private_source_verification_object
  check (jsonb_typeof(source_verification) = 'object');

create index if not exists sizing_charts_source_table_idx
  on public.sizing_charts (brand_key, source_table_id);

create index if not exists sizing_charts_applicability_idx
  on public.sizing_charts using gin (applicability);

comment on column public.sizing_charts.source_table_id is
  'Stable identity of the exact official source table, independent of the display variant name.';
comment on column public.sizing_charts.applicability is
  'Structured productLine, fitClass, ageBand, and market routing constraints.';
comment on column public.sizing_charts.deciding_measurements is
  'Measurements the source table uses to choose a row; absent fields are not globally required.';
comment on column public.sizing_charts.source_verification is
  'Verification date/status/locale/evidence/snapshot metadata for the official source.';
