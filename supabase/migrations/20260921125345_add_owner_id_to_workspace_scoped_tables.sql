-- Phase 6 of the workspace-flattening plan: additive-only. Adds owner_id alongside the
-- existing workspace_id on every table that's scoped to a workspace, backfilled from each
-- row's workspace, so the app can start reading/writing by owner_id ahead of workspace_id
-- (and the workspaces table itself) being dropped in phase 8.

ALTER TABLE public.cart_events ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.chat_events ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.realtime_tryon_events ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.shopper_accounts ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.shopper_login_codes ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.try_on_events ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.workspace_live_sessions ADD COLUMN IF NOT EXISTS owner_id uuid;

UPDATE public.cart_events t SET owner_id = w.owner_id FROM public.workspaces w WHERE w.id = t.workspace_id AND t.owner_id IS NULL;
UPDATE public.chat_events t SET owner_id = w.owner_id FROM public.workspaces w WHERE w.id = t.workspace_id AND t.owner_id IS NULL;
UPDATE public.realtime_tryon_events t SET owner_id = w.owner_id FROM public.workspaces w WHERE w.id = t.workspace_id AND t.owner_id IS NULL;
UPDATE public.shopper_accounts t SET owner_id = w.owner_id FROM public.workspaces w WHERE w.id = t.workspace_id AND t.owner_id IS NULL;
UPDATE public.shopper_login_codes t SET owner_id = w.owner_id FROM public.workspaces w WHERE w.id = t.workspace_id AND t.owner_id IS NULL;
UPDATE public.try_on_events t SET owner_id = w.owner_id FROM public.workspaces w WHERE w.id = t.workspace_id AND t.owner_id IS NULL;
UPDATE public.workspace_live_sessions t SET owner_id = w.owner_id FROM public.workspaces w WHERE w.id = t.workspace_id AND t.owner_id IS NULL;

-- Every row backfilled cleanly (workspace_id is itself NOT NULL with a FK to workspaces),
-- so owner_id can be required from here on.
ALTER TABLE public.cart_events ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.chat_events ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.realtime_tryon_events ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.shopper_accounts ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.shopper_login_codes ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.try_on_events ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.workspace_live_sessions ALTER COLUMN owner_id SET NOT NULL;

ALTER TABLE public.cart_events ADD CONSTRAINT cart_events_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.chat_events ADD CONSTRAINT chat_events_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.realtime_tryon_events ADD CONSTRAINT realtime_tryon_events_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.shopper_accounts ADD CONSTRAINT shopper_accounts_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.shopper_login_codes ADD CONSTRAINT shopper_login_codes_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.try_on_events ADD CONSTRAINT try_on_events_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_live_sessions ADD CONSTRAINT workspace_live_sessions_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS cart_events_owner_idx ON public.cart_events (owner_id);
CREATE INDEX IF NOT EXISTS chat_events_owner_idx ON public.chat_events (owner_id);
CREATE INDEX IF NOT EXISTS realtime_tryon_events_owner_idx ON public.realtime_tryon_events (owner_id);
CREATE INDEX IF NOT EXISTS shopper_accounts_owner_idx ON public.shopper_accounts (owner_id);
CREATE INDEX IF NOT EXISTS shopper_login_codes_owner_idx ON public.shopper_login_codes (owner_id);
CREATE INDEX IF NOT EXISTS try_on_events_owner_idx ON public.try_on_events (owner_id);
CREATE INDEX IF NOT EXISTS workspace_live_sessions_owner_idx ON public.workspace_live_sessions (owner_id, last_seen_at);

-- New owner-scoped uniqueness, parallel to the existing workspace-scoped constraints (which
-- are dropped in phase 8 once the app and every read path is fully cut over to owner_id).
ALTER TABLE public.shopper_accounts ADD CONSTRAINT shopper_accounts_owner_id_email_key UNIQUE (owner_id, email);
ALTER TABLE public.workspace_live_sessions ADD CONSTRAINT workspace_live_sessions_owner_session_key UNIQUE (owner_id, session_id);
