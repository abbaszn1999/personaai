-- Last trace of the retired workspace concept in the schema: this table was never about
-- multiple projects (it holds shopper heartbeats, keyed by owner + session), so the prefix
-- only misleads now. Renaming the constraints/indexes too so nothing still spells it.
alter table public.workspace_live_sessions rename to live_sessions;

alter table public.live_sessions rename constraint workspace_live_sessions_owner_id_fkey to live_sessions_owner_id_fkey;
alter index public.workspace_live_sessions_pkey rename to live_sessions_pkey;
alter index public.workspace_live_sessions_owner_idx rename to live_sessions_owner_idx;
alter index public.workspace_live_sessions_owner_started_idx rename to live_sessions_owner_started_idx;
