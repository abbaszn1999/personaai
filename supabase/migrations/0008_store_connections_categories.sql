-- Holds the store's real available category taxonomy (Shopify collections for
-- shopify connections; left empty for still-simulated platforms, which fall
-- back to the mock taxonomy on the client). Separate from `selected_category_ids`,
-- which is the subset of these the merchant has activated for the agent.
alter table public.store_connections add column if not exists categories jsonb not null default '[]';
