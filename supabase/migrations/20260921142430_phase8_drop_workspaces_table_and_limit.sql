-- Phase 8 step 4 (final): the workspaces table has no remaining dependents — every owner-
-- scoped table now carries owner_id directly, and store settings live on `users`
-- (store_name/store_status/embed_token/embed_enabled/branding). workspace_limit is dropped
-- too: every account gets at most one project now (enforced in app code, not by this column).
drop table public.workspaces;
alter table public.users drop column workspace_limit;
