-- ─── sizing_null_records ──────────────────────────────────────────────────────
-- The `null_records` list from Documentation/persona_sizing.md, Tab 2: the products where no brand
-- could be identified, at row level.
--
-- This is the one deliberate exception to "nothing here stores a product", and the doc is explicit
-- about why: "Global and private brands only need to appear once each as unique names; only the null
-- case needs row-level detail, since there's no brand name to group by." A global brand collapses to
-- the string "Nike" however many thousand SKUs carry it. An unbranded product collapses to nothing —
-- there is no key to group it under, so the rows themselves are the only representation there is.
--
-- Bounded by MAX_NULL_RECORDS in src/lib/sizing/aggregate.ts rather than by anything here, so a
-- catalog that is overwhelmingly unbranded degrades to a truncated list plus a warning instead of
-- quietly turning this table into the product mirror the design set out to avoid.
create table public.sizing_null_records (
  id              uuid primary key default gen_random_uuid(),
  connection_id   uuid not null references public.store_connections(id) on delete cascade,

  -- The platform's own product id, so the merchant can find the row in their store admin. Unique per
  -- connection: a product filed in two selected categories is one unbranded product, not two.
  external_id     text not null,
  sku             text,
  title           text not null,

  -- Audience-scoped sizing key, matching sizing_coverage.sizing_category. Present because Tab 3
  -- routes these to "Manual-fill list directly, grouped by category instead of brand" — the category
  -- is the only grouping key an unbranded row has.
  --
  -- Products with no sizing category at all never reach this table. A scarf has no chart to fill in,
  -- so listing it as an unresolved gap would be asking the merchant for something that cannot exist.
  sizing_category text not null,

  created_at      timestamptz not null default now(),

  unique (connection_id, external_id)
);

-- Tab 5 reads these grouped by category, which is also how the gap queue is built.
create index sizing_null_records_grouping_idx
  on public.sizing_null_records (connection_id, sizing_category);

alter table public.sizing_null_records enable row level security;
