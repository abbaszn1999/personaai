-- ─── sizing_product_records ───────────────────────────────────────────────────
-- Deduplicated product ids behind the Stage 2 table.
--
-- Coverage is deliberately aggregate-only, but an aggregate cannot page "100 private-brand
-- products" exactly. The previous implementation searched the live Woo catalog twelve pages at a
-- time, returned short UI pages when matches were sparse, and repeated products found through two
-- category-query chunks. This compact, scan-scoped snapshot gives every filter one stable unique
-- sequence; the table still fetches price, image, stock and sizes live from the merchant's store.
create table public.sizing_product_records (
  id                uuid primary key default gen_random_uuid(),
  connection_id     uuid not null references public.store_connections(id) on delete cascade,
  external_id       text not null,
  sku               text,
  title             text not null,
  brand_key         text not null default '',
  sizing_category   text not null,
  created_at        timestamptz not null default now(),

  unique (connection_id, external_id)
);

-- Stable pagination and exact filters used by Stage 2.
create index sizing_product_records_page_idx
  on public.sizing_product_records (connection_id, title, external_id);
create index sizing_product_records_brand_idx
  on public.sizing_product_records (connection_id, brand_key);
create index sizing_product_records_category_idx
  on public.sizing_product_records (connection_id, sizing_category);

alter table public.sizing_product_records enable row level security;
