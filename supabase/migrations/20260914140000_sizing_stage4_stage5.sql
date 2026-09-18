-- ─── Stage 4 becomes explicit, Stage 5 becomes real ───────────────────────────
--
-- Two independent changes that have to land together, because Stage 5 reads what Stage 4 produces.
--
-- 1. Research stops being an automatic bulk pass. The merchant asks for one brand or for all of
--    them, and the request has to survive a worker tick — so the scope lives on the run row rather
--    than in the request that started it.
-- 2. Chart Assignment gets the two tables it needs: what the store carries per merchant category
--    path, and which chart variant the merchant bound that path to.

-- ─── sizing_runs: the persisted research scope ─────────────────────────────────
--
-- Null and empty mean different things, and the difference is the whole point of the column.
-- NULL is "no scoped request has been made" — the state a run parks in, where the worker must do
-- nothing. A non-empty array is the brands the merchant actually asked for. There is deliberately no
-- "everything outstanding" sentinel: Generate All resolves to a real brand list at request time, so
-- a brand added by a later rescan can never be researched by a request that predates it.
alter table public.sizing_runs
  add column if not exists research_brand_keys text[],
  add column if not exists research_current_brand_key text,
  add column if not exists research_force boolean not null default false;

comment on column public.sizing_runs.research_brand_keys is
  'Brand keys this run is authorised to research, drained as each finishes. Null or empty means the '
  'research stage must do nothing — Stage 4 now starts on merchant request, never automatically.';
comment on column public.sizing_runs.research_current_brand_key is
  'The brand a research tick is inside right now, so Stage 4 can name it. Null between brands.';
comment on column public.sizing_runs.research_force is
  'Regenerate rather than Generate: skip the registry short-circuit and re-search a brand that already '
  'holds a chart. Persisted beside the scope because a scoped pass can span several worker ticks.';

-- `assign` is Stage 5's own stage, so a refresh returns the merchant to Chart Assignment rather than
-- to the research screen they already finished with.
alter table public.sizing_runs drop constraint if exists sizing_runs_stage_check;
alter table public.sizing_runs add constraint sizing_runs_stage_check
  check (stage in ('scan', 'classify', 'research', 'gap_fill', 'assign', 'resolve', 'publish'));

-- ─── sizing_path_coverage ─────────────────────────────────────────────────────
-- What the store carries per (brand x merchant category path x sizing parent), as counts only.
--
-- Stage 5 assigns a chart to a *merchant* category path, so it needs to know which paths exist and
-- how much stock hangs off each. That is a different grouping from `sizing_coverage`, which knows
-- only the sizing parent — "Tommy Hilfiger tops" cannot tell the merchant apart from
-- `Men > T-Shirts` and `Women > Tops`, and those two legitimately want different chart variants.
--
-- Aggregate on purpose: there are no SKUs, ids, prices or images here. Storing the merchant's
-- catalog is exactly what this pipeline is built to avoid, and a count per path is all an assignment
-- screen can act on. `category_id` is the platform's own stable term id — the deepest mapped one the
-- product sits on — so a merchant renaming a category keeps their assignment. `category_path` is the
-- breadcrumb for display, refreshed on every scan.
create table public.sizing_path_coverage (
  id                uuid primary key default gen_random_uuid(),
  connection_id     uuid not null references public.store_connections(id) on delete cascade,
  -- Empty string is the No-brand sentinel, matching `sizing_coverage`. See `UNKNOWN_BRAND_KEY`.
  brand_key         text not null default '',
  brand_name        text,
  category_id       text not null,
  category_path     text[] not null default '{}',
  sizing_category   text not null,
  sku_count         integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (connection_id, brand_key, category_id, sizing_category)
);

create index sizing_path_coverage_connection_idx
  on public.sizing_path_coverage (connection_id, sku_count desc);

alter table public.sizing_path_coverage enable row level security;

-- ─── sizing_chart_assignments ─────────────────────────────────────────────────
-- Which discovered chart variant governs a merchant category path.
--
-- Keyed identically to `sizing_path_coverage` so the join is exact, but kept as its own table
-- because the two have opposite lifecycles: coverage is replaced wholesale by every scan, while an
-- assignment is a merchant decision that has to survive one.
--
-- Stores `variant_name`, not a chart id. Writing a chart deletes and re-inserts the row for that
-- published table, so a re-run of research mints new uuids for the same guide, and a uuid here would
-- dangle the moment a merchant re-researched the brand they had just finished assigning. The name is
-- what the brand publishes and what `sizing_charts` is itself keyed on.
--
-- A row with `variant_name is null` is a real answer: the merchant looked at this path and decided
-- it gets no chart. That is deliberately distinct from having no row at all, which means undecided.
create table public.sizing_chart_assignments (
  id                uuid primary key default gen_random_uuid(),
  connection_id     uuid not null references public.store_connections(id) on delete cascade,
  brand_key         text not null default '',
  category_id       text not null,
  sizing_category   text not null,
  variant_name      text,
  -- 'auto' rows may be replaced by later auto-matching; 'merchant' rows never are.
  source            text not null default 'merchant' check (source in ('merchant', 'auto')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (connection_id, brand_key, category_id, sizing_category)
);

create index sizing_chart_assignments_connection_idx
  on public.sizing_chart_assignments (connection_id);

alter table public.sizing_chart_assignments enable row level security;
