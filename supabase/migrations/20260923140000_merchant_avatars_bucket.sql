-- Merchant account photos. The path is the email (`name_at_domain.tld/avatar.jpg`),
-- public so the sidebar can render it with a plain <img>. Uploads go through the
-- service role from /api/account/avatar; there is no client write policy.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'merchant-avatars',
  'merchant-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

drop policy if exists "Public read merchant avatars" on storage.objects;
create policy "Public read merchant avatars"
on storage.objects
for select
using (bucket_id = 'merchant-avatars');
