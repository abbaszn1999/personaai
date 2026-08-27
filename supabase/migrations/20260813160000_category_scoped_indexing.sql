-- ─── Category-scoped indexing ─────────────────────────────────────────────────
-- Indexing used to walk a merchant's whole catalog. On a 100,000-product store where
-- only a handful of categories are in scope, that is two paid Gemini calls per product
-- to index a slice of them — the cost scales with the store instead of with what the
-- agent is actually allowed to sell.
--
-- Products are now enqueued per selected category, which means each row has to remember
-- which of the merchant's categories brought it in: a product can arrive via several,
-- so deselecting one must not remove a product another still covers.
alter table public.catalog_products
  add column if not exists source_category_ids text[] not null default '{}';

-- Array containment is the access check on every retrieval query, so it needs an index
-- rather than a sequential scan per search.
create index if not exists catalog_products_source_categories_idx
  on public.catalog_products using gin (source_category_ids);

comment on column public.catalog_products.source_category_ids is
  'Merchant category/collection ids this product was indexed under. Retrieval requires an overlap with the merchant''s current selection, so deselecting a category hides its products immediately without waiting for a re-index.';

-- ─── Retrieval honours the selection ──────────────────────────────────────────
-- Dropped rather than overloaded: appending a defaulted parameter would leave two
-- candidate signatures, and PostgREST resolves RPC calls by argument name, so an
-- ambiguous pair fails at call time rather than here.
drop function if exists public.search_catalog_products(
  uuid, extensions.halfvec(768), integer, text, text, text, numeric, numeric, boolean, text[]
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
  p_source_category_ids text[] default null
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
  -- Iterative index scans matter specifically here. This is filtered vector search:
  -- a plain HNSW scan walks the graph first and applies the WHERE afterwards, which
  -- can return far fewer rows than requested — silently, reading as a thin catalog
  -- rather than a bug. Iterative scanning keeps walking until the filter is satisfied.
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
    and (p_category is null or p.category = p_category)
    and (p_subcategory is null or p.subcategory = p_subcategory)
    and (p_brand is null or lower(p.brand) = lower(p_brand))
    and (p_price_min is null or p.price >= p_price_min)
    and (p_price_max is null or p.price <= p_price_max)
    and (not p_in_stock_only or p.in_stock)
    and (p_exclude_external_ids is null or not (p.external_id = any(p_exclude_external_ids)))
    -- The merchant's active selection. Distinct from p_category, which is the agent's own
    -- filter: this one is a permission boundary the agent cannot widen.
    and (p_source_category_ids is null or p.source_category_ids && p_source_category_ids)
  order by p.embedding <=> p_embedding
  limit p_limit;
$$;

-- pgvector's iterative scan is a per-session GUC, not an index property, so it has
-- to be set on the function that relies on it rather than once at migration time.
alter function public.search_catalog_products(
  uuid, extensions.halfvec(768), integer, text, text, text, numeric, numeric, boolean, text[], text[]
) set hnsw.iterative_scan = 'relaxed_order';

drop function if exists public.filter_catalog_products(
  uuid, integer, double precision, text, text, text, numeric, numeric, boolean, text[]
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
  p_source_category_ids text[] default null
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
    and (p_category is null or p.category = p_category)
    and (p_subcategory is null or p.subcategory = p_subcategory)
    and (p_brand is null or lower(p.brand) = lower(p_brand))
    and (p_price_min is null or p.price >= p_price_min)
    and (p_price_max is null or p.price <= p_price_max)
    and (not p_in_stock_only or p.in_stock)
    and (p_exclude_external_ids is null or not (p.external_id = any(p_exclude_external_ids)))
    and (p_source_category_ids is null or p.source_category_ids && p_source_category_ids)
  order by
    p.in_stock desc,
    md5(p.external_id || p_seed::text)
  limit p_limit;
$$;

-- ─── Pruning after a deselection ──────────────────────────────────────────────
-- Removes products the merchant's current selection no longer covers. A product reached
-- through several categories survives while any one of them is still selected, which is
-- what makes deselecting safe: it never deletes something another category still needs.
--
-- An empty selection deletes nothing, so accidentally clearing every checkbox can't wipe
-- an entire index in one request.
create or replace function public.prune_uncovered_catalog_products(
  p_connection_id uuid,
  p_selected_category_ids text[]
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  removed bigint;
begin
  if p_selected_category_ids is null or cardinality(p_selected_category_ids) = 0 then
    return 0;
  end if;

  with deleted as (
    delete from public.catalog_products
    where connection_id = p_connection_id
      and not (source_category_ids && p_selected_category_ids)
    returning id
  )
  select count(*) into removed from deleted;

  return removed;
end;
$$;

-- ─── Lock these down ──────────────────────────────────────────────────────────
revoke all on function public.search_catalog_products(
  uuid, extensions.halfvec(768), integer, text, text, text, numeric, numeric, boolean, text[], text[]
) from public, anon, authenticated;
revoke all on function public.filter_catalog_products(
  uuid, integer, double precision, text, text, text, numeric, numeric, boolean, text[], text[]
) from public, anon, authenticated;
revoke all on function public.prune_uncovered_catalog_products(uuid, text[]) from public, anon, authenticated;

grant execute on function public.search_catalog_products(
  uuid, extensions.halfvec(768), integer, text, text, text, numeric, numeric, boolean, text[], text[]
) to service_role;
grant execute on function public.filter_catalog_products(
  uuid, integer, double precision, text, text, text, numeric, numeric, boolean, text[], text[]
) to service_role;
grant execute on function public.prune_uncovered_catalog_products(uuid, text[]) to service_role;
