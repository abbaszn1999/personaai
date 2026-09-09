-- Stage 2, per doc Part 3: the merchant sees the parent each SKU inherited from its category path,
-- and can correct the ones the path gets wrong.
--
-- The path mapping is right for almost every product, which is the whole reason it is asked once per
-- path instead of once per SKU. It cannot be right for all of them: a real catalog has paths like
-- "Men > Clothing" holding 604 products that are genuinely tops and bottoms and outerwear at once,
-- and no single parent is correct there. Without an escape hatch the merchant's only options are to
-- mis-size the majority or restructure their store, so this is the pressure valve on a mapping that
-- is deliberately coarse.
--
-- On `store_connections` for the same reason as `category_parent_map`: read and written whole,
-- always alongside the connection row the scan already loads.

alter table public.store_connections
  add column if not exists sku_parent_overrides jsonb not null default '{}'::jsonb;

comment on column public.store_connections.sku_parent_overrides is
  'Stage 2 corrections. Object keyed by the platform''s own product id whose value is one of the '
  'five parent sizing categories: tops, outerwear, bottoms, dresses, footwear. Overrides the parent '
  'the product would otherwise inherit from `category_parent_map` via its category ids. Expected to '
  'stay small and hand-made — a path needing hundreds of these is a path that wants splitting, or a '
  'category mapping that wants correcting, and both are cheaper than the overrides.';
