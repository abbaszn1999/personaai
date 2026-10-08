-- AI matching on the Mapping page runs on the server and saves its own result. Reading product titles
-- and the AI call take minutes, so the page starts a run and follows it here instead of holding a
-- request open; a dropped request used to lose the whole run. Every write is tied to the run's job id,
-- so a run that was cleared or replaced cannot overwrite newer data.
alter table public.store_connections
  add column if not exists persona_auto_match_status text not null default 'idle',
  add column if not exists persona_auto_match_job_id uuid,
  add column if not exists persona_auto_match_phase text,
  add column if not exists persona_auto_match_started_at timestamptz,
  add column if not exists persona_auto_match_heartbeat_at timestamptz,
  add column if not exists persona_auto_match_finished_at timestamptz,
  add column if not exists persona_auto_match_sampled integer not null default 0,
  add column if not exists persona_auto_match_total integer not null default 0,
  add column if not exists persona_auto_match_result jsonb,
  add column if not exists persona_auto_match_error text;

alter table public.store_connections
  drop constraint if exists store_connections_persona_auto_match_status_check;

alter table public.store_connections
  add constraint store_connections_persona_auto_match_status_check
  check (persona_auto_match_status in ('idle', 'running', 'done', 'failed'));

alter table public.store_connections
  drop constraint if exists store_connections_persona_auto_match_phase_check;

alter table public.store_connections
  add constraint store_connections_persona_auto_match_phase_check
  check (persona_auto_match_phase is null or persona_auto_match_phase in ('sampling', 'classifying', 'saving'));

comment on column public.store_connections.persona_auto_match_status is
  'Mapping AI match run: running while product titles are read, the AI classifies, and the result is saved.';
