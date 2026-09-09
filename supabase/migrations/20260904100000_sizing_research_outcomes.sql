-- ─── Why a coverage row has no chart ──────────────────────────────────────────
-- Phase 4 already worked this out and then threw it away: `runChartResearch` counted "not found"
-- and "not covered" into a return value and a log line, so the moment the run ended the only thing
-- left was an absent `sizing_charts` row. Absence has several very different causes, though, and
-- they need different actions from the merchant:
--
--   not_found    the finder could not locate this brand's guide at all — often a retry, or a brand
--                that genuinely publishes nothing and has to be hand-filled
--   not_covered  the guide was found and read, but says nothing about this category (a brand that
--                publishes men's tops and no boys' hats) — always a hand-fill
--   failed       the research call itself errored — a retry, never a merchant's problem
--
-- Collapsing those into one blank cell is what made the last run unreadable without SQL. Stage 4's
-- review table reads these two columns as its "reason" column.
--
-- Columns on sizing_coverage rather than a `sizing_research_attempts` table: this is exactly one
-- fact per coverage row, born and deleted with that row, and never read except alongside it. A
-- separate table would mean one extra row and one extra join per coverage row to store a status.
--
-- 'pending' covers both "no research pass has run yet" and "this row is never researched at all" —
-- `private` and `none` brands never reach the web search by design (doc Tab 3), so their reason is
-- read off `brand_type` instead and no status is written for them. Storing a 'skipped' here would
-- mean classify had to write to every row it touches to keep the two columns agreeing.
alter table public.sizing_coverage
  add column if not exists research_status text not null default 'pending'
    check (research_status in ('pending', 'found', 'not_found', 'not_covered', 'failed')),
  add column if not exists research_note text;

comment on column public.sizing_coverage.research_status is
  'Why this (brand x sizing category) does or does not have a chart: pending (not researched, or a private/unbranded row that never will be), found, not_found (finder located no guide), not_covered (guide found but silent on this category), failed (research errored). Reset to pending by a re-scan, since replaceSizingCoverage rebuilds these rows.';

comment on column public.sizing_coverage.research_note is
  'Human-readable detail behind research_status — the finder''s own reason, or an error message. Display only; nothing branches on it.';
