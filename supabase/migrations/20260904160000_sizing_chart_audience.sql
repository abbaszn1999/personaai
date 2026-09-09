-- ─── Audience moves off the coverage key and onto the chart ───────────────────
-- 20260903130000 keyed both tables on an audience-scoped category (`mens_tops`, `girls_hats`),
-- following the doc's own Step 0 example. That shape assumes the merchant's catalog can say who a
-- product is for. A store with one flat `Clothing` category and no gender field cannot, so every
-- row fell through to the `unisex_` fallback — 100% of them, including a `unisex_bras` row — and
-- the key ended up asserting a gender nobody knew. Asking a menswear house for a "unisex bottoms"
-- chart is what produced charts merging three different size scales.
--
-- So the audience now comes from the one place it is a fact rather than a guess: the brand's own
-- published size guide, whose page says `/men/` and whose section headings separate men's from
-- women's. Coverage keeps only the garment group; the chart carries the audience.
--
-- Two consequences worth stating, because they are why the indexes below change shape:
--   1. One (brand, group) now legitimately holds several charts — men's, women's, kids'.
--   2. One (brand, group, audience) does too. Tommy Hilfiger publishes a mainline men's tops table
--      and a Tommy Jeans one, with different measurements for the same label. Both are real, so the
--      table's own title is part of a chart's identity rather than decoration.

alter table public.sizing_charts
  add column if not exists audience text not null default 'unisex'
    check (audience in ('mens', 'womens', 'boys', 'girls', 'kids', 'unisex')),
  add column if not exists source_title text not null default '';

comment on column public.sizing_charts.audience is
  'Who the source table is for, read off the brand''s own guide page rather than inferred from a product. Kept in sync with the Audience union in lib/sizing/keys.ts.';

comment on column public.sizing_charts.source_title is
  'The verbatim heading of the table this chart was transcribed from, e.g. ''TOPS, OUTERWEAR, CASUAL SHIRTS''. Shown to the merchant so a chart says what it is for, and part of the uniqueness key because a brand publishes more than one table per (group, audience).';

-- The existing research output is unusable and keyed the old way: 8 rows with pinned bounds, merged
-- scales and no source URLs. Deleted rather than migrated — there is nothing in them worth keeping,
-- and leaving them would have the registry short-circuit skip the brands most in need of a re-run.
-- Manual and merchant charts are left alone; those were typed by a human and are not ours to drop.
delete from public.sizing_charts where provenance = 'research';

-- Rebuilt to include both new columns. `source_title` is `not null default ''` specifically so it
-- can sit in a unique index: Postgres treats NULLs as distinct from each other, so a nullable title
-- would let the same table accumulate a duplicate row on every research run — the same trap the
-- original migration documented for `connection_id`.
drop index if exists public.sizing_charts_global_idx;
drop index if exists public.sizing_charts_scoped_idx;
drop index if exists public.sizing_charts_lookup_idx;

create unique index sizing_charts_global_idx
  on public.sizing_charts (brand_key, sizing_category, audience, source_title)
  where connection_id is null;

create unique index sizing_charts_scoped_idx
  on public.sizing_charts (connection_id, brand_key, sizing_category, audience, source_title)
  where connection_id is not null;

-- The resolver's hot path during an index: every chart for a brand + group, from which it picks the
-- audience variant. Deliberately not keyed down to audience — selection needs to see the
-- alternatives to choose between them, so one lookup returning all of them beats one per audience.
create index sizing_charts_lookup_idx
  on public.sizing_charts (brand_key, sizing_category);

-- ─── What the catalog itself suggested about audience ─────────────────────────
-- Un-gendering the key would otherwise throw away what `audienceFor` already works out from the
-- merchant's `genders`/`ageGroups` fields and category paths. That is nothing on the store this was
-- built against, but a real signal on a store that files products under "Women > Tops" — and losing
-- it would be a regression for exactly the merchants who had it right.
--
-- Counts rather than a single verdict, e.g. {"mens": 412, "unisex": 6}: a coverage row rolls up many
-- products, they need not agree, and a lone mislabelled product should not decide the row. Read at
-- chart selection as a tiebreak, never as the authority — the chart's own audience outranks it.
alter table public.sizing_coverage
  add column if not exists audience_hints jsonb not null default '{}'::jsonb;

comment on column public.sizing_coverage.audience_hints is
  'Per-audience product counts observed while scanning this (brand x sizing category), e.g. {"mens": 412}. A tiebreak for choosing which audience variant of a brand''s chart a product resolves against; the chart''s own audience, read from the brand''s guide, always wins.';

comment on table public.sizing_coverage is
  'Aggregate of what a store carries, one row per (brand x sizing category), with the distinct raw size strings that roll up into it. Replaces a product mirror. The category is a bare garment group — the audience lives on sizing_charts.';

comment on table public.sizing_charts is
  'Measurement bounds per (brand x sizing category x audience x source table). connection_id NULL = shared global-brand chart reused across merchants; non-null = private-label or hand-filled, scoped to one store.';
