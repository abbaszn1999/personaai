-- ─── Close a gap in catalog_queue_purge_connection's grants ────────────────────
-- Every other queue RPC (send_batch/read/delete/archive/depth, all in
-- 20260812211000_catalog_queue_and_search.sql) explicitly revokes execute from
-- public/anon/authenticated and grants it only to service_role. This one was defined in its own
-- later migration and that lockdown was missed — as a `security definer` function reachable via
-- PostgREST, it was callable by anyone holding the anon key, who could purge another merchant's
-- queued indexing work simply by guessing/enumerating a connection id.
revoke all on function public.catalog_queue_purge_connection(uuid) from public, anon, authenticated;
grant execute on function public.catalog_queue_purge_connection(uuid) to service_role;
