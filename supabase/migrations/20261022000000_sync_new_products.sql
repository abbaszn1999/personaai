-- ─── Sync: products added after the first Setup publish ───────────────────────
--
-- After a store's first publish, a product created in the store is no longer written to ACS on
-- arrival. It is recorded here as `pending` and waits until the merchant runs Sync, which reads
-- only these products, classifies only the brands they introduce, and publishes only them.
--
-- One row per product the store sells that ACS has never held. The row is the Sync queue, the
-- record of which delta run (`sizing_runs.kind = 'delta'`) took the product, and the source of the
-- per-run counts in Sync History.
--
-- Display fields are copied at detection so the queue renders without reading the store. The chart
-- inputs (`sizing_category`, `leaf_key`, `raw_size_format`) are what the dashboard resolves against
-- the current charts to say whether a pending product is ready, from a new brand, or needs a chart.
create table public.sync_new_products (
  connection_id    uuid not null references public.store_connections(id) on delete cascade,
  external_id      text not null,
  sku              text,
  title            text not null,
  image_url        text,
  price            text,
  brand_label      text,
  -- Normalised as everywhere else; '' is the No-brand sentinel (`UNKNOWN_BRAND_KEY`).
  brand_key        text not null default '',
  -- Empty when the merchant's category mapping gives the product no sizing family.
  sizing_category  text not null default '',
  leaf_key         text,
  raw_size_format  text,
  source           text not null check (source in ('webhook', 'reconcile', 'manual')),
  status           text not null default 'pending'
                     check (status in ('pending', 'syncing', 'published', 'removed')),
  sync_run_id      uuid references public.sizing_runs(id) on delete set null,
  -- Frozen during the run, because both change meaning afterwards: once a sync classifies a brand
  -- it is no longer new, and a chart added later does not change what a past sync published.
  brand_was_new    boolean,
  chart_status     text check (chart_status in ('matched', 'unresolved', 'unsized', 'excluded', 'unavailable')),
  detected_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  published_at     timestamptz,
  primary key (connection_id, external_id)
);

create index sync_new_products_queue_idx
  on public.sync_new_products (connection_id, status, detected_at desc);

create index sync_new_products_run_idx
  on public.sync_new_products (sync_run_id);

alter table public.sync_new_products enable row level security;

comment on table public.sync_new_products is
  'Products added to a store after its first Setup publish. Held out of ACS until the merchant runs Sync.';
