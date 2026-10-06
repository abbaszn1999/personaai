alter table public.store_connections
  add column if not exists store_currency text;

comment on column public.store_connections.store_currency is
  'ISO 4217 currency the store sells in. Read from WooCommerce settings, which has no per-product currency; Shopify reports its own on every product and leaves this null.';
