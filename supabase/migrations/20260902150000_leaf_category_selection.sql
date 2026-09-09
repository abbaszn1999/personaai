-- ─── Leaf-level category selection ────────────────────────────────────────────
-- The category picker moves from "tick a top-level category, the server fans out downward" to
-- "tick individual leaves". The UI change alone would be destructive: PATCH /api/store-connection
-- diffs the incoming selection against the stored one and treats every id no longer present as a
-- prune, so a merchant stored as ['women'] saving ['women-tops-tees', 'women-tops-blouses', ...]
-- reads as one removal plus dozens of additions — a full catalog prune followed by a full reindex,
-- from a single click.
--
-- So the stored value is migrated first, to exactly the set the server already treats as in scope
    10|-- (`expandCategorySelection`). After this runs, the first save from the leaf UI diffs to an empty
-- add set and an empty remove set: no prune, no reindex, no mapping-approval 409.
--
-- Only WooCommerce is actually affected. Shopify collections carry no parent, so the expansion is
-- a no-op there and top level already equals leaf level.

alter table public.store_connections
  add column if not exists category_selection_granularity text not null default 'top_level';

-- Expand every stored selection downward through the category hierarchy held in `categories`.
    20|--
-- Ids absent from `categories` are kept rather than dropped, matching `expandCategorySelection`:
-- a term deleted in the store admin must not silently widen the scope of what remains selected.
-- That is why the seed rows are unioned in rather than only their resolved descendants.
with recursive selected as (
  select
    sc.id                                                  as connection_id,
    jsonb_array_elements_text(sc.selected_category_ids)    as category_id
  from public.store_connections sc
  where jsonb_array_length(sc.selected_category_ids) > 0
    30|),
child_edges as (
  select
    sc.id                                as connection_id,
    element ->> 'id'                     as category_id,
    nullif(element ->> 'parentId', '')   as parent_id
  from public.store_connections sc
  cross join lateral jsonb_array_elements(sc.categories) as element
),
expanded as (
    40|  select connection_id, category_id from selected
  union  -- dedupes, which also terminates a self-parenting or cyclic term
  select edge.connection_id, edge.category_id
  from child_edges edge
  join expanded parent
    on parent.connection_id = edge.connection_id
   and parent.category_id   = edge.parent_id
)
update public.store_connections sc
set selected_category_ids = leaves.category_ids
    50|from (
  select connection_id, jsonb_agg(distinct category_id) as category_ids
  from expanded
  group by connection_id
) leaves
where sc.id = leaves.connection_id;

update public.store_connections
set category_selection_granularity = 'leaf';

    60|-- New connections start empty, but they will be filled by the leaf UI.
alter table public.store_connections
  alter column category_selection_granularity set default 'leaf';

alter table public.store_connections
  drop constraint if exists store_connections_category_selection_granularity_check;

alter table public.store_connections
  add constraint store_connections_category_selection_granularity_check
  check (category_selection_granularity in ('top_level', 'leaf'));

    70|comment on column public.store_connections.category_selection_granularity is
  'Whether selected_category_ids holds top-level ids the server expands, or the already-expanded leaf set the category picker writes directly.';
