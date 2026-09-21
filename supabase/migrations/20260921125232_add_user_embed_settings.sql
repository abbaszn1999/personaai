-- Phase 5 of the workspace-flattening plan: additive-only. Each account has at most one
-- workspace already (enforced since 0005_workspace_limit_one), so embed/branding settings
-- are moving onto `users` directly ahead of the workspaces table being retired. Both old
-- (workspaces.*) and new (users.*) columns are kept in sync by the app during phase 7's
-- code cutover, then the old columns/table are dropped in phase 8.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS embed_token text,
  ADD COLUMN IF NOT EXISTS embed_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS branding jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill from each owner's single existing workspace.
UPDATE public.users u
SET embed_token = w.embed_token,
    embed_enabled = w.embed_enabled,
    branding = w.branding
FROM public.workspaces w
WHERE w.owner_id = u.id;

-- Mirrors the uniqueness already enforced on workspaces.embed_token; NULLs (accounts that
-- haven't completed onboarding yet) are each distinct under a standard UNIQUE constraint.
ALTER TABLE public.users ADD CONSTRAINT users_embed_token_key UNIQUE (embed_token);

COMMENT ON COLUMN public.users.embed_token IS 'Opaque public credential for the widget snippet. Mirrors workspaces.embed_token during the phase 7 code cutover; workspaces is the source of truth until then.';
COMMENT ON COLUMN public.users.branding IS 'Mirrors workspaces.branding during the phase 7 code cutover; workspaces is the source of truth until then.';
