-- Merges store_size_type + store_size_type_overrides (added in 20260908130000_store_size_type.sql)
-- into a single store_size_settings jsonb column. The two were always read and written together —
-- `sizeTypeFor` takes both, Stage 1's SizeTypePanel edits both — so splitting them across two
-- columns bought nothing and cost `rowToConnection`/`updateStoreConnection` two fields to keep in
-- sync instead of one. Shape: { "default": "Alpha", "overrides": { "nike": "EU" } }.

alter table public.store_connections
  add column if not exists store_size_settings jsonb not null default '{"default":"Alpha","overrides":{}}'::jsonb;

-- Backfill from the two existing columns before they're dropped, for any row already carrying real
-- settings.
update public.store_connections
set store_size_settings = jsonb_build_object(
  'default', coalesce(store_size_type, 'Alpha'),
  'overrides', coalesce(store_size_type_overrides, '{}'::jsonb)
)
where store_size_type is not null or store_size_type_overrides is not null;

alter table public.store_connections
  drop constraint if exists store_connections_store_size_type_check;

alter table public.store_connections
  drop column if exists store_size_type,
  drop column if exists store_size_type_overrides;

comment on column public.store_connections.store_size_settings is
  'Doc Part 2, merged. { "default": SizeType, "overrides": Record<normalizedBrandKey, SizeType> }. '
  'SizeType is one of US, UK, EU, Alpha or Numeric. `default` is the sizing system this catalog''s '
  'size labels are written in; `overrides` names the brands whose labels differ from it. See '
  '`src/lib/sizing/size-types.ts` (`parseSizeSettings`, `sizeTypeFor`) for the single reader/writer.';
