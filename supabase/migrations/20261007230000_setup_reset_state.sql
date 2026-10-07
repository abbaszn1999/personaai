-- "Start from scratch" in Setup and Mapping. The database half of a reset is immediate; removing the
-- store's products from the shared ACS catalog walks every tenant's documents and can take minutes,
-- so it runs after the response and reports here. Stage 5 publish is refused while it runs, so a new
-- catalog is never written into a cleanup that would delete it again.
alter table public.store_connections
  add column if not exists setup_reset_status text not null default 'idle',
  add column if not exists setup_reset_scope text,
  add column if not exists setup_reset_started_at timestamptz,
  add column if not exists setup_reset_finished_at timestamptz,
  add column if not exists setup_reset_deleted integer not null default 0,
  add column if not exists setup_reset_error text;

alter table public.store_connections
  drop constraint if exists store_connections_setup_reset_status_check;

alter table public.store_connections
  add constraint store_connections_setup_reset_status_check
  check (setup_reset_status in ('idle', 'running', 'done', 'failed'));

alter table public.store_connections
  drop constraint if exists store_connections_setup_reset_scope_check;

alter table public.store_connections
  add constraint store_connections_setup_reset_scope_check
  check (setup_reset_scope is null or setup_reset_scope in ('setup', 'mapping'));

comment on column public.store_connections.setup_reset_status is
  'Start-from-scratch ACS cleanup: running while the store''s products are being deleted from ACS.';
