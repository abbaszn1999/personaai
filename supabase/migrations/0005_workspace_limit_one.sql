-- ─── enforce single-workspace accounts ────────────────────────────────────────
-- Product decision: every account gets exactly 1 workspace for now. The column
-- stays in place so future paid tiers can raise the limit per-user.
alter table public.users alter column workspace_limit set default 1;
update public.users set workspace_limit = 1;
