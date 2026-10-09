-- What the agents' path config reads off each PRIMARY document (`pathConfigDocument`), so it is
-- rebuilt from this store's rows instead of a walk through every store's ACS catalog. Null for
-- variants, and for rows written before this column existed; a rebuild that meets one walks ACS,
-- and that walk's reconciliation fills it.
alter table public.acs_catalog_mirror add column if not exists document jsonb;
