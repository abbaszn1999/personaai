-- ─── Local, enriched, vector-indexed product catalog ──────────────────────────
-- Retrieval stops hitting the merchant's live store API on every shopper turn and
-- runs against a synced local copy instead. That is what makes semantic search
-- possible at all: a query like "something for a backyard BBQ" has no literal
-- overlap with any product title, so it can only be answered by ranking against
-- embeddings of the whole catalog rather than keyword-matching a 100-product slice.

-- ─── Extensions ───────────────────────────────────────────────────────────────
-- pgvector 0.8.2 clears both floors this design needs: halfvec requires 0.7.0+
-- and iterative index scans require 0.8.0+.
create extension if not exists vector with schema extensions;

-- Backfill and reconciliation run entirely inside Postgres so they don't depend on
-- the hosting platform's scheduler: pg_cron fires, pg_net calls an internal route,
-- and the route drains a batch off a pgmq queue.
create extension if not exists pgmq;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ─── catalog_products ─────────────────────────────────────────────────────────
create table public.catalog_products (
  id                   uuid primary key default gen_random_uuid(),
  connection_id        uuid not null references public.store_connections(id) on delete cascade,

  -- Identity. external_id is the platform's own product id; the unique constraint
  -- with connection_id is what makes every sync path an idempotent upsert.
  external_id          text not null,
  -- Groups colourways and sizes of the same product. The whole basis of variant
  -- lookups ("does that come in navy") resolving without an API round trip.
  product_group_id     text,
  sku                  text,

  -- Merchant-supplied and filterable. Filters run on these columns only —
  -- deliberately no colour/material/formality/fit columns. Anything descriptive
  -- lives in enriched_description and is reached through cosine, not WHERE, so a
  -- query naming a colour routes to semantic search instead of an exact match
  -- against a field the merchant may never have populated consistently.
  title                text not null,
  brand                text,
  -- Canonical taxonomy values mapped at sync time, never the merchant's raw
  -- strings — "sneakers", "trainers" and "shoes" must not coexist as three values.
  category             text,
  subcategory          text,
  price                numeric(12,2),
  currency             text,
  in_stock             boolean not null default true,
  product_url          text,
  image_url            text,
  images               jsonb not null default '[]',
  -- Colours and sizes with their platform ids, so a variant swap needs no API call.
  variant_options      jsonb not null default '{}',

  -- Generated at index time. One vision-written description per product, and one
  -- vector fusing that description with the product image.
  enriched_description text,
  embedding            extensions.halfvec(768),

  -- Covers text *and* image, so swapping a photo re-enriches and re-embeds while a
  -- price or stock edit costs nothing. Without the image in the hash, a product
  -- would keep a vector describing a picture it no longer uses — a silent failure
  -- that ranks wrong rather than erroring.
  content_hash         text,
  synced_at            timestamptz,
  enriched_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (connection_id, external_id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
-- Creating this index *is* the ANN configuration: with no index, pgvector falls
-- back to exact brute-force sequential scan, which is fine at 20k SKUs and not
-- fine at the several-hundred-thousand this is designed for.
--
-- m and ef_construction are set deliberately rather than left implicit. Both sit
-- above pgvector's defaults (16/64) because retrieval here is filter-then-cosine,
-- and recall on a heavily filtered graph walk degrades faster than on an
-- unfiltered one. The cost is index build time and size, paid once at backfill.
create index catalog_products_embedding_idx
  on public.catalog_products
  using hnsw (embedding extensions.halfvec_cosine_ops)
  with (m = 24, ef_construction = 100);

-- Every query is scoped to one connection, so connection_id leads both indexes.
create index catalog_products_scope_idx
  on public.catalog_products (connection_id, category, subcategory);

create index catalog_products_group_idx
  on public.catalog_products (connection_id, product_group_id);

-- Reconciliation walks by cursor to find what changed since the last pull.
create index catalog_products_synced_at_idx
  on public.catalog_products (connection_id, synced_at);

-- Deny-all by default, matching 0002 — the server-only service role bypasses RLS,
-- and nothing should reach this table from the browser.
alter table public.catalog_products enable row level security;

-- ─── store_connections: client instructions and sync state ────────────────────
alter table public.store_connections
  -- Typed, machine-executable rules (exclude_items, never_pair, max_price_spread).
  -- Stored structured rather than as prose precisely so they are never handed to a
  -- model to interpret: a "never" from a client is a constraint compiled into the
  -- query, not a suggestion weighed against other considerations.
  add column if not exists hard_rules jsonb not null default '[]',
  -- Soft, subjective taste guidance. Woven into the cosine query statement and the
  -- bundle model's context, but never excludes anything on its own.
  add column if not exists style_guide text,
  add column if not exists catalog_sync_status text not null default 'idle',
  -- Percentage 0-100, derived from remaining queue depth against the total
  -- enqueued at the start of the run rather than hand-tracked chunk offsets.
  add column if not exists catalog_sync_progress integer not null default 0,
  add column if not exists catalog_sync_total integer not null default 0;

-- The existing `categories` jsonb gains canonical mappings per entry
-- ({ id, name, productCount, canonicalCategory, canonicalSubcategory }) instead of
-- a new column, so the merchant's raw taxonomy and its canonical form stay together.
comment on column public.store_connections.categories is
  'Store''s own category taxonomy. Each entry: { id, name, productCount, canonicalCategory?, canonicalSubcategory? } — the canonical fields map the merchant''s raw label onto the controlled vocabulary in src/lib/retrieval/taxonomy.ts.';

-- ─── Enrichment queue ─────────────────────────────────────────────────────────
-- One shared queue across all connections. Failed messages stay on the queue and
-- retry after their visibility timeout, so a Gemini outage costs one batch rather
-- than the whole run.
select pgmq.create('catalog_enrichment');
