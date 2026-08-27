-- ─── AI Commerce Search mapping approval ───────────────────────────────────────
-- No per-connection `acs_catalog_id`: the Retail API's `projects.locations.catalogs` resource
-- has no create/delete method — catalogs are fixed per GCP project (typically just
-- `default_catalog`), confirmed against the official REST reference. True catalog-per-merchant
-- isolation would require one GCP project per merchant, which is out of scope for self-serve
-- onboarding. Isolation is instead enforced in code: every product carries a `merchant_id`
-- custom attribute (the connection's own id — no new column needed for that), and every
-- search/import call includes a mandatory, non-optional `attributes.merchant_id: ANY(...)`
-- filter clause. All connections share one catalog, configured once via env, not per-row.
--
-- The mapping-preview approval gate is still one-time per connection: the merchant sees 5 real
-- products run through `rawCatalogProductToAcsProduct()` and approves them before the first
-- backfill import ever runs. `acs_mapper_version_approved` is compared against the mapper's
-- current code version on every subsequent sync — bumping the mapper's version forces the
-- preview to be shown and re-approved again, rather than silently importing under a mapping the
-- merchant never saw.
alter table public.store_connections
  add column if not exists acs_mapping_approved_at timestamptz,
  add column if not exists acs_mapper_version_approved integer;

comment on column public.store_connections.acs_mapping_approved_at is
  'When the merchant approved the 5-sample mapping preview. Null blocks the first backfill import. Never re-shown unless acs_mapper_version_approved falls behind the mapper''s current version.';
comment on column public.store_connections.acs_mapper_version_approved is
  'The mapper version (see MAPPER_VERSION in src/lib/catalog/acs/map-product.ts) the merchant''s approval was recorded against.';
