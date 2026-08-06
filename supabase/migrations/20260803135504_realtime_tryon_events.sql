-- One row per product actively previewed during a live camera session.
create table public.realtime_tryon_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id text not null,
  product_id text not null,
  product_name text not null,
  duration_seconds integer not null check (duration_seconds > 0),
  created_at timestamptz not null default now()
);

create index realtime_tryon_events_workspace_created_idx
  on public.realtime_tryon_events(workspace_id, created_at);

alter table public.realtime_tryon_events enable row level security;
