-- Server-side cache of the setup pipeline's expensive reads (the merchant's store products and the
-- ACS catalog mirror), so a restart or a second server instance does not repeat a full walk.
-- Private: no policies are created, so only the service role can read or write it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sizing-snapshots',
  'sizing-snapshots',
  false,
  104857600,
  array['application/gzip']::text[]
)
on conflict (id) do nothing;
