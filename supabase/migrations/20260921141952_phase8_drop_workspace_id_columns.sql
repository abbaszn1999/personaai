-- Phase 8 step 2: every read/write path has been cut over to owner_id (see the code-cutover
-- commit) — drop workspace_id from the seven event/session tables, replacing the indexes
-- that were keyed on it with owner_id-keyed equivalents.

-- cart_events
alter table public.cart_events drop constraint cart_events_workspace_id_fkey;
create index if not exists cart_events_owner_created_idx on public.cart_events (owner_id, created_at);
drop index if exists public.cart_events_workspace_created_idx;
alter table public.cart_events drop column workspace_id;

-- chat_events
alter table public.chat_events drop constraint chat_events_workspace_id_fkey;
create index if not exists chat_events_owner_created_idx on public.chat_events (owner_id, created_at);
drop index if exists public.chat_events_workspace_created_idx;
alter table public.chat_events drop column workspace_id;

-- realtime_tryon_events
alter table public.realtime_tryon_events drop constraint realtime_tryon_events_workspace_id_fkey;
create index if not exists realtime_tryon_events_owner_created_idx on public.realtime_tryon_events (owner_id, created_at);
drop index if exists public.realtime_tryon_events_workspace_created_idx;
alter table public.realtime_tryon_events drop column workspace_id;

-- try_on_events
alter table public.try_on_events drop constraint try_on_events_workspace_id_fkey;
create index if not exists try_on_events_owner_created_idx on public.try_on_events (owner_id, created_at);
drop index if exists public.try_on_events_workspace_created_idx;
alter table public.try_on_events drop column workspace_id;

-- shopper_accounts (owner_id, email) unique already exists from phase 6
alter table public.shopper_accounts drop constraint shopper_accounts_workspace_id_email_key;
alter table public.shopper_accounts drop constraint shopper_accounts_workspace_id_fkey;
drop index if exists public.shopper_accounts_workspace_idx;
alter table public.shopper_accounts drop column workspace_id;

-- shopper_login_codes
alter table public.shopper_login_codes drop constraint shopper_login_codes_workspace_id_fkey;
create index if not exists shopper_login_codes_owner_lookup_idx on public.shopper_login_codes (owner_id, email, created_at desc);
drop index if exists public.shopper_login_codes_lookup_idx;
alter table public.shopper_login_codes drop column workspace_id;

-- workspace_live_sessions: primary key was (workspace_id, session_id). Drop it and the
-- pre-existing (owner_id, session_id) unique constraint from phase 6, then add one fresh
-- primary key on (owner_id, session_id) before dropping workspace_id.
alter table public.workspace_live_sessions drop constraint workspace_live_sessions_workspace_id_fkey;
alter table public.workspace_live_sessions drop constraint workspace_live_sessions_pkey;
alter table public.workspace_live_sessions drop constraint workspace_live_sessions_owner_session_key;
alter table public.workspace_live_sessions add constraint workspace_live_sessions_pkey primary key (owner_id, session_id);
create index if not exists workspace_live_sessions_owner_started_idx on public.workspace_live_sessions (owner_id, started_at);
drop index if exists public.workspace_live_sessions_started_idx;
drop index if exists public.workspace_live_sessions_workspace_idx;
alter table public.workspace_live_sessions drop column workspace_id;
