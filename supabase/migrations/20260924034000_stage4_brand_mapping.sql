-- Phase 4-only routing aliases. This is the mapping feature's sole persisted state:
-- catalog products, scan coverage, taxonomy and classifications remain untouched.
alter table public.store_connections
  add column if not exists sizing_brand_mapping jsonb not null default
    '{"version":1,"confirmedAt":null,"sourceFingerprint":"","observed":{},"aliases":{}}'::jsonb;

alter table public.store_connections
  drop constraint if exists store_connections_sizing_brand_mapping_object_check;

alter table public.store_connections
  add constraint store_connections_sizing_brand_mapping_object_check
  check (
    jsonb_typeof(sizing_brand_mapping) = 'object'
    and sizing_brand_mapping->>'version' = '1'
    and jsonb_typeof(coalesce(sizing_brand_mapping->'observed', '{}'::jsonb)) = 'object'
    and jsonb_typeof(coalesce(sizing_brand_mapping->'aliases', '{}'::jsonb)) = 'object'
  );

comment on column public.store_connections.sizing_brand_mapping is
  'Phase 4-only raw global-brand aliases to canonical sizing chart keys. Does not rewrite catalog or sizing coverage data.';
