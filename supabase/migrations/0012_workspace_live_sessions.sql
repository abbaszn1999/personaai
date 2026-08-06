-- ─── Live embed sessions ─────────────────────────────────────────────────────
-- One row per (workspace, shopper session) that's currently viewing an embedded
-- widget. Shoppers "heartbeat" this row every ~15s while the widget is mounted
-- (see /api/embed/heartbeat); a row is only considered "live" while its
-- last_seen_at is recent — no cleanup job needed, stale rows are just ignored
-- by the count query and get overwritten if that shopper comes back.
create table public.workspace_live_sessions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id text not null,
  last_seen_at timestamptz not null default now(),
  primary key (workspace_id, session_id)
);

create index workspace_live_sessions_workspace_idx
  on public.workspace_live_sessions(workspace_id, last_seen_at);

-- All access goes through the service-role client (embed routes resolve the
-- workspace server-side via the embed token; the dashboard route checks
-- ownership itself), never directly from a shopper's or merchant's browser.
alter table public.workspace_live_sessions enable row level security;
