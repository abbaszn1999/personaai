-- Restore the database to its pre-brand-mapping schema.
-- Dropping the column also removes its validation constraint and saved mapping documents.
alter table public.store_connections
  drop column if exists sizing_brand_mapping;
