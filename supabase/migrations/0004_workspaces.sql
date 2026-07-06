-- ─── workspaces ───────────────────────────────────────────────────────────────
create table public.workspaces (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.users(id) on delete cascade,
  name                  varchar not null,
  mode                  varchar not null default 'unwearable',
  status                varchar not null default 'draft',
  selected_category_ids jsonb not null default '[]',
  store_connection      jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.workspaces enable row level security;

create index workspaces_owner_id_idx on public.workspaces(owner_id);
