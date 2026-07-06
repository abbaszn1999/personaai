-- ─── Enable RLS on all auth tables ───────────────────────────────────────────
-- The service role (SUPABASE_SECRET_KEY) bypasses RLS automatically.
-- These policies block any direct access from the browser/anon key.

alter table public.users enable row level security;
alter table public.sessions enable row level security;

-- Deny all by default (no policies = no access for anon/authenticated roles).
-- Our server-only client uses the service role which bypasses RLS entirely,
-- so no explicit "allow service role" policy is needed.
