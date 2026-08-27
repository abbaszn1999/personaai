-- ─── Purge a connection's queued indexing work ────────────────────────────────
-- Disconnecting a store cascades its `catalog_products` rows away, but the enrichment
-- queue is shared across every merchant, so whatever was already enqueued for that
-- connection survives it. Those messages can never be indexed — there is no parent row
-- left for the upsert's foreign key — yet a drain would still enrich and embed each one
-- first, at two paid Gemini calls apiece, before failing.
--
-- `pgmq` has no conditional delete, so this filters the queue table directly. Deleting
-- rather than archiving is deliberate: an archived message is kept to be inspected, and
-- there is nothing to inspect about work whose owner is gone.
create or replace function public.catalog_queue_purge_connection(p_connection_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pgmq, extensions
as $$
declare
  purged bigint;
begin
  with removed as (
    delete from pgmq.q_catalog_enrichment
    where message ->> 'connectionId' = p_connection_id::text
    returning msg_id
  )
  select count(*) into purged from removed;

  return purged;
end;
$$;
