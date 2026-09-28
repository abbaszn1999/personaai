-- Materialize unambiguous leaf coverage for private charts moved by the table split. Existing
-- merchant decisions win: ON CONFLICT does nothing, matching autoMatchAssignments' rule that an
-- explicit choice (including "no chart") is never overwritten.
with candidates as (
  select
    paths.connection_id,
    paths.brand_key,
    paths.category_id,
    paths.sizing_category,
    min(charts.variant_name) as variant_name
  from public.sizing_path_coverage as paths
  join public.sizing_charts_private as charts
    on charts.connection_id = paths.connection_id
   and charts.brand_key = paths.brand_key
   and charts.sizing_category = paths.sizing_category
   and paths.category_id = any(charts.covers_leaves)
  group by
    paths.connection_id,
    paths.brand_key,
    paths.category_id,
    paths.sizing_category
  having count(*) = 1
)
insert into public.sizing_chart_assignments (
  connection_id,
  brand_key,
  category_id,
  sizing_category,
  variant_name,
  source,
  updated_at
)
select
  connection_id,
  brand_key,
  category_id,
  sizing_category,
  variant_name,
  'auto',
  now()
from candidates
on conflict (connection_id, brand_key, category_id, sizing_category)
do nothing;
