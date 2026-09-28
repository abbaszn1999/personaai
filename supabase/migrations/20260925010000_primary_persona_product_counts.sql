-- Mapping hierarchy counts must use the same deduplicated product snapshot as Stage 2.
-- One primary leaf gives each product exactly one place in department/category totals, while
-- sizing_path_coverage remains the intentionally multi-leaf source for Stage 5 assignments.
alter table public.sizing_product_records
  add column primary_persona_leaf_key text;

create index sizing_product_records_primary_leaf_idx
  on public.sizing_product_records (connection_id, primary_persona_leaf_key);

create view public.sizing_product_primary_leaf_counts
with (security_invoker = true)
as
select
  connection_id,
  primary_persona_leaf_key,
  count(*)::integer as product_count,
  max(created_at) as scanned_at
from public.sizing_product_records
group by connection_id, primary_persona_leaf_key;

comment on column public.sizing_product_records.primary_persona_leaf_key is
  'The one Persona taxonomy leaf chosen first during the sizing scan. Used only for deduplicated Mapping hierarchy counts; Stage 5 continues to use every mapped leaf in sizing_path_coverage.';

comment on view public.sizing_product_primary_leaf_counts is
  'Exact deduplicated Stage 2 product counts grouped by each product''s one primary Persona leaf.';
