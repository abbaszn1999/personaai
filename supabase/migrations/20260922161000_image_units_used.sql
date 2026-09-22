-- PostgREST on this project rejects aggregate selects, so the billing read goes through a
-- function. The sum is the same figure consume_image_generation uses when it splits a charge.

create or replace function public.image_units_used(p_user_id uuid, p_since timestamptz)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(units), 0)
  from public.image_generations
  where user_id = p_user_id and created_at >= p_since;
$$;

revoke all on function public.image_units_used(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.image_units_used(uuid, timestamptz)
  to service_role;
