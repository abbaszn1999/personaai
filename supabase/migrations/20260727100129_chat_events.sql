-- One row per chat turn logged by wearable and unwearable assistant surfaces.
create table public.chat_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id text not null,
  role text not null check (role in ('user', 'assistant')),
  topic text,
  created_at timestamptz not null default now()
);

create index chat_events_workspace_created_idx
  on public.chat_events(workspace_id, created_at);

alter table public.chat_events enable row level security;
