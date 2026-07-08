-- ─── store connections (account-level, one per owner) ─────────────────────────
-- The e-commerce store connection is account-level (survives project delete /
-- recreate), so it lives in its own table keyed by owner_id rather than on
-- workspaces. Category selection is derived from the synced catalog, so it
-- belongs here too rather than on the project shell.
create table public.store_connections (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.users(id) on delete cascade unique,
  platform              varchar not null,
  store_name            varchar not null,
  store_url             varchar not null,
  api_key_encrypted     text,
  status                varchar not null default 'connected',
  selected_category_ids jsonb not null default '[]',
  product_count         integer not null default 0,
  synced_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.store_connections enable row level security;

-- ─── drop now-redundant workspace columns ──────────────────────────────────────
alter table public.workspaces drop column if exists selected_category_ids;
alter table public.workspaces drop column if exists store_connection;
