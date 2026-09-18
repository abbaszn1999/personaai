-- Public avatar images for signed-in shopper profiles. Paths are unguessable
-- (`{accountId}/{profileId}.jpg`); the bucket is public so the widget can render
-- <img src> without a signed-URL refresh loop. Raw selfies never land here — only
-- the generated avatar, after the source photo has already been discarded.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shopper-avatars',
  'shopper-avatars',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

drop policy if exists "Public read shopper avatars" on storage.objects;
create policy "Public read shopper avatars"
on storage.objects
for select
using (bucket_id = 'shopper-avatars');
