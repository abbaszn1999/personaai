alter table public.sizing_product_records
  add column leaf_source_category_ids text[],
  add column brand_label text;

comment on column public.sizing_product_records.leaf_source_category_ids is
  'Store collection ids the product sits in that are mapped to its primary Persona subcategory. A list because one product can sit in several collections mapped to the same subcategory. Null until the product is rescanned.';
comment on column public.sizing_product_records.brand_label is
  'The brand exactly as the store spells it. brand_key is normalised and lowercased; a storefront filter link needs the store''s own spelling. Null until the product is rescanned.';

create index sizing_product_records_leaf_sources_idx
  on public.sizing_product_records using gin (leaf_source_category_ids);

-- Everything the Stage 2 filters and Stage 4 source lists need, counted in one round trip. One row per
-- distinct (brand, spelling, subcategory, family, collection); a product in two collections counts once
-- under each. The caller folds these into dropdowns and per-brand collection lists.
create or replace function public.sizing_product_facets(p_connection_id uuid)
returns table (
  brand_key text,
  brand_label text,
  primary_persona_leaf_key text,
  sizing_category text,
  source_category_id text,
  product_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.brand_key,
    r.brand_label,
    r.primary_persona_leaf_key,
    r.sizing_category,
    s.source_category_id,
    count(*)::bigint
  from public.sizing_product_records r
  left join lateral unnest(r.leaf_source_category_ids) as s(source_category_id) on true
  where r.connection_id = p_connection_id
  group by r.brand_key, r.brand_label, r.primary_persona_leaf_key, r.sizing_category, s.source_category_id
  order by r.brand_key, r.brand_label nulls first, r.primary_persona_leaf_key nulls first, r.sizing_category, s.source_category_id nulls first;
$$;

revoke all on function public.sizing_product_facets(uuid) from public, anon, authenticated;
