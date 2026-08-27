-- ─── Full category chains, and no more scalar columns to fall out of sync ─────
-- `category_paths` used to store at most two levels per path — a selected category and one
-- child — collapsing anything deeper ("Men > Clothing > Shirts") down to just the ends
-- ("Men" / "Shirts"). It now keeps the whole chain, root-first: `["Men", "Clothing", "Shirts"]`.
--
-- The `category`/`subcategory` columns were always just `category_paths[0]` for display. Every
-- reader has been moved onto `category_paths` directly, so they're dropped for good rather than
-- kept in sync with a shape that no longer matches what they'd need to show.

-- Reshape existing rows from the old `{category, subcategory}` object form to the new ordered
-- array form before anything reads them as arrays. Rows already in the new shape (empty, or
-- written by app code deployed after this migration) are left alone.
update public.catalog_products
set category_paths = (
  select coalesce(
    jsonb_agg(
      case
        when elem->>'subcategory' is null then jsonb_build_array(elem->>'category')
        else jsonb_build_array(elem->>'category', elem->>'subcategory')
      end
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(category_paths) elem
)
where jsonb_typeof(category_paths) = 'array'
  and jsonb_array_length(category_paths) > 0
  and jsonb_typeof(category_paths -> 0) = 'object';

comment on column public.catalog_products.category_paths is
  'Every selected category this product belongs to, in the merchant''s own names, ordered root-first: [["Men", "Clothing", "Shirts"], ["Shoes & Bags"]]. There is no separate scalar column — this is the only place category data lives.';

-- ─── Retrieval matches on category_paths; category = path[0], subcategory = any deeper level ──
drop function if exists public.search_catalog_products(
  uuid, extensions.halfvec(768), integer, text, text, text, numeric, numeric, boolean, text[], text[], text, text
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
  category_paths jsonb,
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
    p.category_paths,
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
        select 1 from jsonb_array_elements(p.category_paths) path
        -- path->>0 is the selected root; a subcategory naming any deeper level of the same
        -- chain still counts as a match, whether that's the immediate child or a leaf several
        -- levels down.
        where path ->> 0 = p_category
          and (p_subcategory is null or path ? p_subcategory)
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
  uuid, integer, double precision, text, text, text, numeric, numeric, boolean, text[], text[], text, text
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
  category_paths jsonb,
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
    p.category_paths,
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
        select 1 from jsonb_array_elements(p.category_paths) path
        where path ->> 0 = p_category
          and (p_subcategory is null or path ? p_subcategory)
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

-- ─── Drop the scalars and the index that only ever served them ────────────────
drop index if exists public.catalog_products_scope_idx;

alter table public.catalog_products
  drop column if exists category,
  drop column if exists subcategory;
