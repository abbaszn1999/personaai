-- Phase 8 step 1: give `users` its own store_name/store_status, backfilled from `workspaces`,
-- so the workspaces table can be dropped later in this migration set without losing data.
alter table public.users
  add column if not exists store_name varchar,
  add column if not exists store_status varchar not null default 'draft';

update public.users u
set store_name = w.name,
    store_status = w.status
from public.workspaces w
where w.owner_id = u.id;
