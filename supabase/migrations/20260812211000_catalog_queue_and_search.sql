-- ─── Queue wrappers and vector search entry points ────────────────────────────
-- PostgREST only exposes the schemas it is configured for, so `pgmq.*` and the
-- halfvec operators aren't reachable from the app client directly. These thin
-- wrappers in `public` are the surface the app calls; the real work stays in the
-- extension schemas.

-- ─── Enrichment queue ─────────────────────────────────────────────────────────
create or replace function public.catalog_queue_send_batch(payloads jsonb[])
returns setof bigint
language sql
security definer
set search_path = public, pgmq, extensions
as $$
  select pgmq.send_batch('catalog_enrichment', payloads);
$$;

create or replace function public.catalog_queue_read(qty integer, visibility_seconds integer)
returns table (msg_id bigint, read_ct integer, message jsonb)
language sql
security definer
set search_path = public, pgmq, extensions
as $$
  select m.msg_id, m.read_ct, m.message
  from pgmq.read('catalog_enrichment', visibility_seconds, qty) m;
$$;

create or replace function public.catalog_queue_delete(msg_ids bigint[])
returns setof bigint
language sql
security definer
set search_path = public, pgmq, extensions
as $$
  select pgmq.delete('catalog_enrichment', msg_ids);
$$;

-- Moves a message to the archive table instead of deleting it. Used when a message
-- has failed repeatedly: leaving it on the queue would make it retry forever and
-- block the run from ever reporting complete.
create or replace function public.catalog_queue_archive(msg_ids bigint[])
returns setof bigint
language sql
security definer
set search_path = public, pgmq, extensions
as $$
  select pgmq.archive('catalog_enrichment', msg_ids);
$$;

-- Progress is derived from remaining depth rather than hand-tracked offsets, so a
-- retried or re-queued message can't drift the reported percentage out of step.
create or replace function public.catalog_queue_depth()
returns bigint
language sql
security definer
set search_path = public, pgmq, extensions
as $$
  select coalesce((select queue_length from pgmq.metrics('catalog_enrichment')), 0);
$$;

-- ─── Vector search ────────────────────────────────────────────────────────────
-- Filter and cosine in ONE round trip against one index, never two queries against
-- two stores. `<=>` is cosine distance, so similarity is 1 - distance.
create or replace function public.search_catalog_products(
  p_connection_id uuid,
  p_embedding extensions.halfvec(768),
  p_limit integer default 10,
  p_category text default null,
  p_subcategory text default null,
  p_brand text default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_in_stock_only boolean default false,
  p_exclude_external_ids text[] default null
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
  order by p.embedding <=> p_embedding
  limit p_limit;
$$;

-- pgvector's iterative scan is a per-session GUC, not an index property, so it has
-- to be set on the function that relies on it rather than once at migration time.
alter function public.search_catalog_products(
  uuid, extensions.halfvec(768), integer, text, text, text, numeric, numeric, boolean, text[]
) set hnsw.iterative_scan = 'relaxed_order';

-- Filter mode: no vector at all, since nothing is left to rank. Ordered in-stock
-- first, then by a caller-supplied seed so the same query doesn't hand every shopper
-- an identical slice — the exact "same products every time" complaint that started
-- this rebuild.
create or replace function public.filter_catalog_products(
  p_connection_id uuid,
  p_limit integer default 10,
  p_seed double precision default 0,
  p_category text default null,
  p_subcategory text default null,
  p_brand text default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_in_stock_only boolean default false,
  p_exclude_external_ids text[] default null
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
  order by
    p.in_stock desc,
    md5(p.external_id || p_seed::text)
  limit p_limit;
$$;

-- ─── Lock these down ──────────────────────────────────────────────────────────
-- security definer plus a bounded search_path, callable only by the server's
-- service role. Nothing here should be reachable with an anon key.
revoke all on function public.catalog_queue_send_batch(jsonb[]) from public, anon, authenticated;
revoke all on function public.catalog_queue_read(integer, integer) from public, anon, authenticated;
revoke all on function public.catalog_queue_delete(bigint[]) from public, anon, authenticated;
revoke all on function public.catalog_queue_archive(bigint[]) from public, anon, authenticated;
revoke all on function public.catalog_queue_depth() from public, anon, authenticated;
revoke all on function public.search_catalog_products(
  uuid, extensions.halfvec(768), integer, text, text, text, numeric, numeric, boolean, text[]
) from public, anon, authenticated;
revoke all on function public.filter_catalog_products(
  uuid, integer, double precision, text, text, text, numeric, numeric, boolean, text[]
) from public, anon, authenticated;

grant execute on function public.catalog_queue_send_batch(jsonb[]) to service_role;
grant execute on function public.catalog_queue_read(integer, integer) to service_role;
grant execute on function public.catalog_queue_delete(bigint[]) to service_role;
grant execute on function public.catalog_queue_archive(bigint[]) to service_role;
grant execute on function public.catalog_queue_depth() to service_role;
grant execute on function public.search_catalog_products(
  uuid, extensions.halfvec(768), integer, text, text, text, numeric, numeric, boolean, text[]
) to service_role;
grant execute on function public.filter_catalog_products(
  uuid, integer, double precision, text, text, text, numeric, numeric, boolean, text[]
) to service_role;
