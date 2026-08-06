-- ─── Session start tracking ──────────────────────────────────────────────────
-- workspace_live_sessions previously only stored the latest heartbeat
-- (last_seen_at), which can answer "who's live right now" but not "how many
-- sessions opened between date A and B" — old heartbeats were overwritten,
-- never logged. started_at is set once (via the column default on the first
-- insert) and must never be included in the heartbeat upsert payload, so
-- ON CONFLICT DO UPDATE never touches it after that first row — see
-- recordHeartbeat in src/lib/db/live-sessions.ts.
alter table public.workspace_live_sessions
  add column started_at timestamptz not null default now();

create index workspace_live_sessions_started_idx
  on public.workspace_live_sessions(workspace_id, started_at);
