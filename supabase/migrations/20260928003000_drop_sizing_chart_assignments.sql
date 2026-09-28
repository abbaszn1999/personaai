-- Chart routing now has one source of truth: sizing_charts.covers_leaves.
-- The former per-store assignment table is empty and no runtime path reads it.
drop table if exists public.sizing_chart_assignments;
