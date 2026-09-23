-- Canonical brand alias decisions belong to one store connection and are always read/written as
-- one configuration document. Keeping them here makes the connection row the sole merchant-scoped
-- source of truth while shared sizing_charts.brand_key remains the cross-merchant chart identity.
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
  'Merchant-reviewed raw brand aliases to canonical sizing_charts.brand_key targets. The document '
  'also retains observed store spellings, confirmation time, and the confirmed raw-brand fingerprint.';

-- Seed unconfirmed self-mappings from current global coverage. Nothing is silently approved: the
-- Phase 4 interstitial still requires the merchant to review these decisions before research.
with global_brands as (
  select
    connection_id,
    brand_key,
    coalesce(max(brand_name) filter (where brand_name is not null), brand_key) as brand_name,
    coalesce(max(brand_canonical_name) filter (where brand_canonical_name is not null),
             max(brand_name) filter (where brand_name is not null),
             brand_key) as canonical_name
  from public.sizing_coverage
  where brand_type = 'global' and brand_key <> ''
  group by connection_id, brand_key
),
documents as (
  select
    connection_id,
    jsonb_build_object(
      'version', 1,
      'confirmedAt', null,
      'sourceFingerprint', '',
      'observed', jsonb_object_agg(brand_key, jsonb_build_array(brand_name)),
      'aliases', jsonb_object_agg(
        brand_key,
        jsonb_build_object(
          'canonicalKey', brand_key,
          'canonicalName', canonical_name,
          'labels', jsonb_build_array(brand_name)
        )
      )
    ) as document
  from global_brands
  group by connection_id
)
update public.store_connections as connection
set sizing_brand_mapping = documents.document
from documents
where connection.id = documents.connection_id
  and connection.sizing_brand_mapping =
    '{"version":1,"confirmedAt":null,"sourceFingerprint":"","observed":{},"aliases":{}}'::jsonb;
