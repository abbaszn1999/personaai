-- Mirrors the already-applied remote hardening migration so local migration history remains
-- complete. Billing RPCs accept arbitrary account ids and are service-role-only.
revoke all on function public.consume_image_generation(uuid, varchar, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.consume_live_tryon_seconds(uuid, uuid, text, text, text, integer, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.add_image_credits(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.add_live_tryon_seconds(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.consume_image_generation(uuid, varchar, timestamptz, integer)
  to service_role;
grant execute on function public.consume_live_tryon_seconds(uuid, uuid, text, text, text, integer, timestamptz, integer)
  to service_role;
grant execute on function public.add_image_credits(uuid, integer)
  to service_role;
grant execute on function public.add_live_tryon_seconds(uuid, integer)
  to service_role;
