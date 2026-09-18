-- ─── Size intelligence: aggregates only, no product mirror ────────────────────
-- Persona resolves "which sizes of this product fit this shopper" from each brand's real published
-- size chart instead of a BMI guess. See Documentation/persona_sizing.md.
--
-- The rule that shapes all three tables: cost and row count scale with the number of distinct
-- brands, categories and raw size formats — never with SKU count. So nothing here stores a product.
-- A store's per-product `final_chart` is not persisted at all: it is a pure function of
-- (brand, sizing category, raw size string), every one of which is an aggregate below, so it is
-- resolved during the ACS index pass and lives only on the ACS document. For a 10,000-SKU store
-- these three tables hold roughly 1,200 rows between them.

-- ─── sizing_runs ──────────────────────────────────────────────────────────────
-- One row per pipeline run. Exists so the setup pipeline resumes from the server rather than from
-- browser state: today a refresh mid-pipeline loses every stage's progress, because "which stage am
-- I on" only exists in a Zustand store. It is also the gate the final index reads — a merchant
-- cannot publish sizing attributes from a run that never finished.
create table public.sizing_runs (
  id                uuid primary key default gen_random_uuid(),
  connection_id     uuid not null references public.store_connections(id) on delete cascade,

  -- 'delta' is unused for now (daily sync is deliberately out of scope) but the column costs
  -- nothing today and avoids a migration when it lands.
  kind              text not null default 'setup' check (kind in ('setup', 'delta')),

  -- 'blocked' is distinct from 'running' on purpose: it means the run is waiting on the merchant to
  -- fill a gap template, not on a job. That distinction is what lets the UI block "Continue"
  -- server-side instead of trusting an in-memory list of open gaps.
  status            text not null default 'pending'
                      check (status in ('pending', 'running', 'blocked', 'complete', 'failed')),
  stage             text not null default 'scan'
                      check (stage in ('scan', 'classify', 'research', 'gap_fill', 'resolve', 'publish')),

  -- The one counter kept here rather than derived. Brand and chart totals are deliberately *not*
  -- stored: they are a group-by over the two tables below, and duplicating them as counters only
  -- creates a second number that can disagree with the rows it claims to count.
  products_scanned  integer not null default 0,

  error             text,
  -- Set once the index carrying sizing attributes finishes. Phase 8's Size Filter tab unlocks off
  -- this instead of an ephemeral client flag.
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- At most one live run per connection, so a double-clicked "Start" can't fork two scans writing the
-- same coverage rows. Completed and failed runs stay as history.
create unique index sizing_runs_active_idx
  on public.sizing_runs (connection_id)
  where status in ('pending', 'running', 'blocked');

create index sizing_runs_connection_idx
  on public.sizing_runs (connection_id, created_at desc);

-- ─── sizing_coverage ──────────────────────────────────────────────────────────
-- What this store actually carries, one row per (brand x audience-scoped sizing category). This is
-- the aggregate that replaces a product table.
--
-- Read in three places: as the `categories_needed` input to the chart research prompt (doc Tab 4
-- Step 0), at index time to decode this store's own raw size strings into the brand's real labels,
-- and by a future delta sync to tell a genuinely new brand from an already-covered one.
create table public.sizing_coverage (
  id                    uuid primary key default gen_random_uuid(),
  connection_id         uuid not null references public.store_connections(id) on delete cascade,

  -- Normalized by `normalizeBrandKey` (src/lib/sizing/keys.ts). Empty string is the sentinel for
  -- the doc's `null_records` — rows where no brand could be identified. Not nullable, because
  -- Postgres treats NULLs as distinct in a unique constraint, so a nullable column would let one
  -- unbranded row per scan accumulate instead of upserting onto itself.
  brand_key             text not null,
  -- The brand as the merchant writes it, for display only. Null for the unbranded sentinel row.
  brand_name            text,
  -- 'unclassified' until Phase 3's Gemini pass runs. 'none' means no brand exists on these rows,
  -- which is a different thing from "not yet classified" — routing reads this column directly, so
  -- collapsing the two would send unbranded rows to the web-search queue.
  brand_type            text not null default 'unclassified'
                          check (brand_type in ('unclassified', 'global', 'private', 'none')),

  -- Audience-scoped sizing key, e.g. 'mens_tops', 'girls_hats' — see `sizingCategoryFor` in
  -- src/lib/sizing/keys.ts. Deliberately *not* the bare 12-bucket `garment_category` written to
  -- ACS: a men's and a women's top with the same 'M' label have different chest ranges, and a hat
  -- and a belt share no measurement at all, so both the audience and the measurement set have to be
  -- part of the key a chart is stored against.
  sizing_category       text not null,

  sku_count             integer not null default 0,
  -- The merchant's own category paths that rolled up into this row, so the UI can speak the
  -- store's taxonomy while charts stay keyed on the canonical one.
  store_category_paths  jsonb not null default '[]'::jsonb,
  -- 2-3 products purely for gap-template thumbnails. The only SKU-level strings persisted anywhere
  -- in this feature.
  sample_skus           jsonb not null default '[]'::jsonb,

  -- Step 5b-i, free: { "<raw size string>": { "count": n, "canonical": ["S","M"] | null } }.
  -- Deduplicating here is what makes the size-resolution LLM call scale with distinct formats
  -- instead of rows — the store writing "S,M,L" on 940 products is one entry, not 940.
  raw_formats           jsonb not null default '{}'::jsonb,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (connection_id, brand_key, sizing_category)
);

-- Routing and the stage tables both read "all rows of this type for this store".
create index sizing_coverage_routing_idx
  on public.sizing_coverage (connection_id, brand_type);

-- ─── sizing_charts ────────────────────────────────────────────────────────────
-- The measurement bounds themselves: one row per (brand x sizing category). This is the artifact
-- the GPT-5.6 web-search pass is paid to produce, and the only table whose contents are expensive.
create table public.sizing_charts (
  id               uuid primary key default gen_random_uuid(),

  -- NULL means a shared, cross-merchant chart. A global brand's chart is a transcription of a
  -- public manufacturer size guide and contains no merchant data, so the second store to sell Nike
  -- inherits it for free rather than paying to research it again. Private-label and unbranded
  -- charts always carry a real connection_id and are never visible to another store, so a
  -- merchant's hand-filled template stays theirs.
  connection_id    uuid references public.store_connections(id) on delete cascade,

  brand_key        text not null,
  sizing_category  text not null,

  -- Which regional label set `size` values are drawn from (EU 38 vs US 8). Never a unit: all bounds
  -- are cm/kg, converted at normalization time, so no consumer has to convert.
  region           text,
  -- SizeChartRow[] in the flat `<measurement>_min`/`_max` shape from
  -- src/lib/sizing/chart-schema.ts. Named chart_rows because `rows` is a SQL keyword.
  chart_rows       jsonb not null default '[]'::jsonb,

  confidence       numeric(3, 2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source_url       text,
  provenance       text not null check (provenance in ('research', 'manual', 'merchant')),
  -- Bumped on revision. Written into each product's ACS `sizing_chart_key` so everything still
  -- carrying a superseded chart is findable with one filter, making a targeted republish possible
  -- instead of a full reindex.
  version          integer not null default 1,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Uniqueness needs two partial indexes rather than one constraint. A plain
-- `unique (connection_id, brand_key, sizing_category)` would not constrain the shared rows at all,
-- because every NULL connection_id counts as distinct — so the global registry would silently
-- accumulate a duplicate Nike chart per research run.
create unique index sizing_charts_global_idx
  on public.sizing_charts (brand_key, sizing_category)
  where connection_id is null;

create unique index sizing_charts_scoped_idx
  on public.sizing_charts (connection_id, brand_key, sizing_category)
  where connection_id is not null;

-- The resolver's hot path during an index: look up a chart by brand + category, preferring this
-- store's own row over the shared one.
create index sizing_charts_lookup_idx
  on public.sizing_charts (brand_key, sizing_category);

-- ─── Access ───────────────────────────────────────────────────────────────────
-- Deny-all by default, matching catalog_products and 0002. The server-only service role bypasses
-- RLS; nothing here should ever be reachable from a browser, and that matters more than usual for
-- sizing_charts, whose shared rows are the one place data crosses a merchant boundary.
alter table public.sizing_runs enable row level security;
alter table public.sizing_coverage enable row level security;
alter table public.sizing_charts enable row level security;

-- ─── store_connections: Size Filter margins ───────────────────────────────────
-- Owner-set per-category slack in cm, widening each size's range before the exclusion filter checks
-- whether a shopper can wear it — final_chart doesn't know about cut or fabric, so without margin a
-- shopper near a boundary is wrongly told nothing fits. A column rather than a table, matching the
-- existing hard_rules/style_guide precedent: it is a handful of numbers read on every shopper query
-- and never queried independently of its connection.
--
-- Per the doc, this affects the exclusion filter and nothing else — it never modifies a stored
-- chart, and Persona never reads it directly, only ever seeing what survived.
alter table public.store_connections
  add column if not exists sizing_margins jsonb not null default '{}'::jsonb;

comment on column public.store_connections.sizing_margins is
  'Size Filter config: per-sizing-category slack in cm plus per-brand overrides, applied only by the pre-Persona exclusion filter. Shape: { "categories": { "mens_tops": { "increase": 2, "decrease": 1 } }, "brands": { "nike": { ... } } }. See Documentation/persona_sizing.md.';

comment on table public.sizing_runs is
  'One row per size-intelligence pipeline run. Server-side stage/status so the setup pipeline resumes across refreshes and the final index can be gated on completion.';

comment on table public.sizing_coverage is
  'Aggregate of what a store carries, one row per (brand x audience-scoped sizing category), with the distinct raw size strings that roll up into it. Replaces a product mirror.';

comment on table public.sizing_charts is
  'Measurement bounds per (brand x sizing category). connection_id NULL = shared global-brand chart reused across merchants; non-null = private-label or hand-filled, scoped to one store.';
