-- One row per store: the merchant path config the Persona agent reads as the tail of its cached
-- prompt prefix. Built from the store's indexed ACS catalog at sync, rewritten only when its
-- fingerprint changes, so the prompt stays byte-identical (and cacheable) between catalog changes.
create table if not exists public.persona_path_configs (
  connection_id uuid primary key references public.store_connections(id) on delete cascade,
  config jsonb not null,
  rendered_text text not null,
  fingerprint text not null,
  taxonomy_version integer not null,
  leaf_count integer not null default 0,
  in_stock_count integer not null default 0,
  built_at timestamptz not null default now(),
  -- Set when the mapping or catalog changed after `built_at`; chat keeps serving the last built
  -- config until the next rebuild clears it.
  stale_at timestamptz,
  gemini_cache_name text,
  gemini_cache_key text,
  gemini_cache_expires_at timestamptz
);

alter table public.persona_path_configs enable row level security;

create index if not exists persona_path_configs_stale_idx
  on public.persona_path_configs (stale_at)
  where stale_at is not null;
