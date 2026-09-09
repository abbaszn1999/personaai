-- ─── Per-store field-mapping overrides ────────────────────────────────────────
-- `rawCatalogProductToAcsProduct`'s routing of a merchant's `variantOptions` groups (Color, Size,
-- Material, ...) is a fixed, global name-match. Some merchants use option names the built-in
-- match doesn't recognize ("Shade" instead of "Color"), or want a field suppressed entirely
-- (never send `description`, say). `acs_field_overrides` lets a merchant correct that per store,
-- without touching the mapper's code.
--
-- Empty (`{}`) reproduces today's mapper output exactly — every existing connection has this
-- shape until a merchant explicitly changes it, so this migration is behavior-neutral on its own.
alter table public.store_connections
  add column if not exists acs_field_overrides jsonb not null default '{}'::jsonb;

-- Fingerprint of the overrides the merchant last approved alongside `acs_mapper_version_approved`.
-- A merchant saving a new override changes this value's hash out from under the stored approval,
-- which is exactly what should re-open the mapping-approval gate — see
-- `hasApprovedCurrentMapping` in `src/lib/catalog/acs/field-overrides.ts`. Null (never approved
-- under any override set) behaves the same as a hash mismatch: gate stays closed.
alter table public.store_connections
  add column if not exists acs_field_overrides_approved_hash text;

comment on column public.store_connections.acs_field_overrides is
  'Merchant overrides on top of the mapper''s default field routing: variant-option-group -> ACS role reassignment, and fields to suppress outright. See src/lib/catalog/acs/field-overrides.ts.';

comment on column public.store_connections.acs_field_overrides_approved_hash is
  'sha256 of the acs_field_overrides the merchant last approved via the mapping-preview gate. Compared against a live hash of the current value to detect an unapproved change.';
