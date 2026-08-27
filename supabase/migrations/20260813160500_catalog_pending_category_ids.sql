-- ─── Incremental category additions ───────────────────────────────────────────
-- When a merchant adds a category to a catalog that is already indexed, only the addition needs
-- walking. Without somewhere to record which categories those are, the scheduled job would have to
-- re-walk the entire selection to find them — cheap in model calls thanks to content hashing, but
-- it re-pages the merchant's whole store and reports progress against the wrong total.
--
-- Empty while catalog_sync_status is 'pending' means "walk the whole selection", which is the
-- first-time case. Cleared only after a successful walk, so a failure part-way through doesn't
-- lose the list and leave those categories silently unindexed.
alter table public.store_connections
  add column if not exists catalog_pending_category_ids text[] not null default '{}';

comment on column public.store_connections.catalog_pending_category_ids is
  'Categories awaiting their first index walk. Empty while catalog_sync_status is pending means index the whole selection.';
