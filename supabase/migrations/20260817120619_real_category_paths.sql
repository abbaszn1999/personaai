-- ─── Real store categories, not a fixed vocabulary ────────────────────────────
-- `category`/`subcategory` used to hold values forced onto a fixed made-up taxonomy
-- (tops/bottoms/trousers) so different merchants' labels would compare consistently.
-- That guessing step is what misfiled a wallet under "bottoms" because its WooCommerce
-- category happened to contain the word "pants". Filtering now runs on the merchant's
-- own category names instead, taken verbatim from their store.
--
-- A product can carry more than one of the merchant's selected categories at once (a
-- product filed under both "mens pants" and "Shoes & Bags"), so this is an array of
-- every selected category the product belongs to, not a single winner.
alter table public.catalog_products
  add column if not exists category_paths jsonb not null default '[]'::jsonb;

comment on column public.catalog_products.category_paths is
  'Every selected category this product belongs to, in the merchant''s own names: [{"category": "Men", "subcategory": "mens pants"}, ...]. category/subcategory below are just category_paths[0], kept for display.';

-- Try-on and the bundle finder still need a fixed notion of "this is a top / bottom /
-- shoe" — arbitrary store category names say nothing about what a garment physically
-- occupies. That is computed from the title alone at index time, independent of the
-- merchant's own category names above, and never shown to the shopper as a filter value.
alter table public.catalog_products
  add column if not exists garment_category text;
alter table public.catalog_products
  add column if not exists garment_subcategory text;

comment on column public.catalog_products.garment_category is
  'Internal-only bucket (tops/bottoms/footwear/...) derived from the title, used solely for try-on layering and the bundle finder -- never exposed as a filterable value.';

-- ─── Retrieval matches on category_paths, not the scalar columns ──────────────
drop function if exists public.search_catalog_products(
  uuid, extensions.halfvec(768), integer, text, text, text, numeric, numeric, boolean, text[], text[]
);

create function public.search_catalog_products(
  p_connection_id uuid,
  p_embedding extensions.halfvec(768),
  p_limit integer default 10,
  p_category text default null,
  p_subcategory text default null,
  p_brand text default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_in_stock_only boolean default false,
  p_exclude_external_ids text[] default null,
  p_source_category_ids text[] default null,
  p_garment_category text default null,
  p_garment_subcategory text default null
)
returns table (
  external_id text,
  product_group_id text,
  title text,
  brand text,
  category text,
  subcategory text,
  price numeric,
  currency text,
  in_stock boolean,
  product_url text,
  image_url text,
  enriched_description text,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    p.external_id,
    p.product_group_id,
    p.title,
    p.brand,
    p.category,
    p.subcategory,
    p.price,
    p.currency,
    p.in_stock,
    p.product_url,
    p.image_url,
    p.enriched_description,
    1 - (p.embedding <=> p_embedding) as similarity
  from public.catalog_products p
  where p.connection_id = p_connection_id
    and p.embedding is not null
    and (
      p_category is null
      or exists (
        select 1 from jsonb_array_elements(p.category_paths) e
        where e->>'category' = p_category
          and (p_subcategory is null or e->>'subcategory' = p_subcategory)
      )
    )
    and (p_brand is null or lower(p.brand) = lower(p_brand))
    and (p_price_min is null or p.price >= p_price_min)
    and (p_price_max is null or p.price <= p_price_max)
    and (not p_in_stock_only or p.in_stock)
    and (p_exclude_external_ids is null or not (p.external_id = any(p_exclude_external_ids)))
    and (p_source_category_ids is null or p.source_category_ids && p_source_category_ids)
    -- Internal slot filter for the bundle finder, orthogonal to the merchant-facing category.
    and (p_garment_category is null or p.garment_category = p_garment_category)
    and (p_garment_subcategory is null or p.garment_subcategory = p_garment_subcategory)
  order by p.embedding <=> p_embedding
  limit p_limit;
$$;

alter function public.search_catalog_products(
  uuid, extensions.halfvec(768), integer, text, text, text, numeric, numeric, boolean, text[], text[], text, text
) set hnsw.iterative_scan = 'relaxed_order';

drop function if exists public.filter_catalog_products(
  uuid, integer, double precision, text, text, text, numeric, numeric, boolean, text[], text[]
);

create function public.filter_catalog_products(
  p_connection_id uuid,
  p_limit integer default 10,
  p_seed double precision default 0,
  p_category text default null,
  p_subcategory text default null,
  p_brand text default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_in_stock_only boolean default false,
  p_exclude_external_ids text[] default null,
  p_source_category_ids text[] default null,
  p_garment_category text default null,
  p_garment_subcategory text default null
)
returns table (
  external_id text,
  product_group_id text,
  title text,
  brand text,
  category text,
  subcategory text,
  price numeric,
  currency text,
  in_stock boolean,
  product_url text,
  image_url text,
  enriched_description text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    p.external_id,
    p.product_group_id,
    p.title,
    p.brand,
    p.category,
    p.subcategory,
    p.price,
    p.currency,
    p.in_stock,
    p.product_url,
    p.image_url,
    p.enriched_description
  from public.catalog_products p
  where p.connection_id = p_connection_id
    and (
      p_category is null
      or exists (
        select 1 from jsonb_array_elements(p.category_paths) e
        where e->>'category' = p_category
          and (p_subcategory is null or e->>'subcategory' = p_subcategory)
      )
    )
    and (p_brand is null or lower(p.brand) = lower(p_brand))
    and (p_price_min is null or p.price >= p_price_min)
    and (p_price_max is null or p.price <= p_price_max)
    and (not p_in_stock_only or p.in_stock)
    and (p_exclude_external_ids is null or not (p.external_id = any(p_exclude_external_ids)))
    and (p_source_category_ids is null or p.source_category_ids && p_source_category_ids)
    and (p_garment_category is null or p.garment_category = p_garment_category)
    and (p_garment_subcategory is null or p.garment_subcategory = p_garment_subcategory)
  order by
    p.in_stock desc,
    md5(p.external_id || p_seed::text)
  limit p_limit;
$$;

-- ─── Lock these down ──────────────────────────────────────────────────────────
revoke all on function public.search_catalog_products(
  uuid, extensions.halfvec(768), integer, text, text, text, numeric, numeric, boolean, text[], text[], text, text
) from public, anon, authenticated;
revoke all on function public.filter_catalog_products(
  uuid, integer, double precision, text, text, text, numeric, numeric, boolean, text[], text[], text, text
) from public, anon, authenticated;

grant execute on function public.search_catalog_products(
  uuid, extensions.halfvec(768), integer, text, text, text, numeric, numeric, boolean, text[], text[], text, text
) to service_role;
grant execute on function public.filter_catalog_products(
  uuid, integer, double precision, text, text, text, numeric, numeric, boolean, text[], text[], text, text
) to service_role;
