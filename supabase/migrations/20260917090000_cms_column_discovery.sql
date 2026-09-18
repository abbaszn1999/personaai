-- ─── Full-catalog CMS column discovery ─────────────────────────────────────
-- Stage 1's dropdowns used to answer "what column exists on this store" from a
-- 25-product sample alone. That is fine for *naming* a column (the native
-- registries plus platform-declared metafield/attribute definitions already
-- cover that — see `cms-columns.ts` and `cms-column-discovery.ts`) but wrong
-- for *coverage*: "how many of your products actually have SKU tables filled
-- in for this field" needs the whole catalog, not 25 items of it.
--
-- Walking a whole catalog takes minutes, same reasoning as the sync backfill
-- and the sizing scan — far too long for one request, so the walk is a
-- resumable background job (`discover-cms-columns.ts`) and this migration adds
-- its state.

-- One discovery walk's progress per connection, alongside the sync fields the
-- table already carries (`catalog_sync_status` and friends) rather than a
-- second status table — it is exactly the same shape of fact.
alter table public.store_connections
  add column if not exists cms_column_discovery_status text not null default 'idle',
  add column if not exists cms_column_discovery_group_index integer not null default 0,
  add column if not exists cms_column_discovery_cursor text,
  add column if not exists cms_column_discovery_scanned integer not null default 0,
  add column if not exists cms_column_discovery_error text,
  add column if not exists cms_column_discovery_updated_at timestamptz;

alter table public.store_connections
  drop constraint if exists store_connections_cms_column_discovery_status_check;
alter table public.store_connections
  add constraint store_connections_cms_column_discovery_status_check
  check (cms_column_discovery_status in ('idle', 'running', 'done', 'error'));

-- The actual snapshot: one row per column this connection's full walk has seen
-- evidence for, keyed by the same `columnKey(ref)` string Stage 1 already uses
-- everywhere else. A dedicated row per column (rather than one growing JSON
-- blob on `store_connections`) is what lets a large catalog's discovery write
-- incrementally, page by page, instead of holding the whole result in memory
-- until a walk finishes.
create table if not exists public.store_cms_columns (
  connection_id uuid not null references public.store_connections(id) on delete cascade,
  column_key text not null,
  label text not null,
  "group" text not null,
  scope text not null,
  value_type text not null,
  sample text,
  presence integer not null default 0,
  sampled integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (connection_id, column_key)
);

create index if not exists store_cms_columns_connection_id_idx
  on public.store_cms_columns (connection_id);

alter table public.store_cms_columns enable row level security;

-- Read/write goes through the service role only (the discovery job and the
-- `mapping-options` route both run server-side with `db`, same as every other
-- store-connection-scoped table in this schema) — no policy grants access to
-- `anon`/`authenticated` directly.
