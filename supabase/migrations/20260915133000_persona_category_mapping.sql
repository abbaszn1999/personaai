-- The Mapping page is the universal category setup for every commerce platform.
-- Store category ids stay internal fetch keys; shopper-facing paths come from Persona.

alter table public.store_connections
  add column if not exists persona_taxonomy_version integer not null default 1,
  add column if not exists persona_taxonomy_scope jsonb not null default
    '{"configured":false,"enabledDeptIds":[],"enabledLeafKeys":[],"customLeaves":[],"customCategories":[]}'::jsonb,
  add column if not exists persona_category_map jsonb not null default '{}'::jsonb,
  add column if not exists persona_mapping_updated_at timestamptz;

comment on column public.store_connections.persona_taxonomy_version is
  'Version of Persona fixed taxonomy against which persona_category_map was validated.';

comment on column public.store_connections.persona_taxonomy_scope is
  'Enabled Persona departments/leaves plus merchant-defined taxonomy extensions. Saved as one document.';

comment on column public.store_connections.persona_category_map is
  'Object keyed by immutable platform category id. Each value is mapped to one Persona path or explicitly excluded.';

comment on column public.store_connections.persona_mapping_updated_at is
  'Last successful persisted Mapping-page save; null means the production mapping has never been configured.';
