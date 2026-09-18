-- What a `scan`-stage run is actually doing right now.
--
-- The stage column names units of work the pipeline advances between. `scan` first walks the
-- merchant's store and then aggregates its mapped fields; these phases let the UI say which one is
-- live. Brand classification is a separate stage and one request over all distinct named brands.
--
-- Nullable throughout: a run written before this column existed, and every stage other than `scan`,
-- legitimately has no phase, and the UI falls back to the stage label for those.
alter table public.sizing_runs
  add column if not exists phase text,
  add column if not exists phase_done integer,
  add column if not exists phase_total integer;

comment on column public.sizing_runs.phase is
  'Sub-step of the current stage: walking | aggregating. Null outside the scan stage.';
comment on column public.sizing_runs.phase_done is
  'Units completed within the phase, where the phase can count them. Null when it cannot.';
comment on column public.sizing_runs.phase_total is
  'Units the phase expects in total. Null while unknown — the catalog walk has no denominator until it ends.';
