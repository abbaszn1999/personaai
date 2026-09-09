-- Categories tab, step 2: the merchant maps every category path they put in scope onto one of the
-- five parent sizing categories, and that mapping is inherited by every SKU underneath it.
--
-- This inverts where a product's sizing group comes from. It used to be inferred from the product's
-- canonical category and subcategory, which meant a synonym list decided what a garment was
-- measured on and silently dropped anything it did not recognise. The merchant knows, so the
-- merchant is asked once per path and the answer is stored here.
--
-- Both columns live on `store_connections` rather than in tables of their own because they are read
-- and written whole, always alongside the connection: the scan already loads this row for
-- `selected_category_ids` and `categories`, and a join would buy nothing. That is the same call
-- already made for those two columns.

alter table public.store_connections
  add column if not exists category_parent_map jsonb not null default '{}'::jsonb,
  add column if not exists category_tree jsonb not null default '[]'::jsonb;

comment on column public.store_connections.category_parent_map is
  'Categories step 2. Object keyed by the platform''s own category id (a WooCommerce term id, a '
  'Shopify collection id) whose value is one of the five parent sizing categories: tops, outerwear, '
  'bottoms, dresses, footwear. Keyed on the platform id rather than on a path string so renaming a '
  'collection in the store admin does not orphan the mapping, and so a collection reused in two '
  'branches of a merchant-built tree cannot end up with two conflicting parents. A path that is in '
  'scope but absent here is unmapped, and the Categories tab blocks Continue until none are.';

comment on column public.store_connections.category_tree is
  'The hierarchy the merchant built by hand, and only ever populated for platforms that do not '
  'publish one. WooCommerce terms carry a real parent id, so its tree is derived from `categories` '
  'and this stays an empty array. Shopify collections are flat with no parent links at all, so the '
  'merchant drags them into a three-level Department > Subcategory > Leaf tree and that arrangement '
  'is stored here as an array of nodes, each leaf pointing at the collection id it stands for. '
  'Purely a scoping and presentation structure: indexing still walks the collection ids underneath, '
  'and the sizing parent still attaches to the collection via `category_parent_map`.';
