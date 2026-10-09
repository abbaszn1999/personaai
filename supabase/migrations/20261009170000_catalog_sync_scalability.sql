-- ─── Catalog sync scalability ─────────────────────────────────────────────────
-- Three independent additions that stop the cost of syncing one store from growing with
-- every other store on the platform.

-- 1. Content hashes of what each store's products looked like when they were last written to
--    ACS. The hourly reconcile compares the store's current products against these and only
--    re-imports what changed, instead of rewriting the whole catalog every hour.
create table if not exists public.catalog_source_hashes (
  connection_id uuid not null references public.store_connections(id) on delete cascade,
  external_id text not null,
  content_hash text not null,
  imported_at timestamptz not null default now(),
  primary key (connection_id, external_id)
);

alter table public.catalog_source_hashes enable row level security;

-- 2. The publish run that wrote each mirrored document, so retiring the previous catalog is a
--    query on one store's rows instead of a walk of ACS's whole shared catalog.
alter table public.acs_catalog_mirror add column if not exists publish_id text;

create index if not exists acs_catalog_mirror_publish_idx
  on public.acs_catalog_mirror (connection_id, publish_id);

-- 3. How much indexing work one store still has queued (claimed-but-unacknowledged messages
--    included), so a store settles when its own work is done rather than when the shared queue,
--    holding every other store's work too, happens to be empty.
create or replace function public.catalog_queue_depth_for_connection(p_connection_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pgmq, extensions
as $$
declare
  pending bigint;
begin
  select count(*) into pending
  from pgmq.q_catalog_enrichment
  where message ->> 'connectionId' = p_connection_id::text;

  return pending;
end;
$$;

revoke all on function public.catalog_queue_depth_for_connection(uuid) from public, anon, authenticated;
grant execute on function public.catalog_queue_depth_for_connection(uuid) to service_role;
