-- Try-on moves from Pruna to Gemini Nano Banana 2.1, and the garment unit moves to $0.01.
--
-- 1. The unit. Callers pass each render's real cost in nano-dollars and this function settles
--    whole units of p_unit_nanos. The default was $0.008 (8,000,000); a unit is now $0.01
--    (10,000,000), so one avatar image (a flat $0.01) is exactly one unit and a try-on settles
--    at its real token cost. The application always passes the unit explicitly; the default only
--    keeps a bare call consistent with it.
--
-- 2. The record. Each row now stores the real cost of the render it was settled by. `units` is
--    the whole units a render crossed, which hides the sub-unit remainder that stays in
--    users.image_cost_carry_nanos; cost_nanos is what the model call actually cost, so a usage
--    report can show real spend. It is null on rows written before this migration.

alter table public.image_generations
  add column if not exists cost_nanos bigint;

drop function if exists public.consume_image_generation(uuid, varchar, timestamptz, integer, bigint, bigint, integer, text, text);

create or replace function public.consume_image_generation(
  p_user_id uuid,
  p_kind varchar,
  p_cycle_start timestamptz,
  p_included_allowance integer,
  p_cost_nanos bigint,
  p_unit_nanos bigint default 10000000,
  p_balance_floor integer default 0,
  p_session_id text default null,
  p_source text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_credits integer;
  carry bigint;
  combined bigint;
  units integer;
  remainder bigint;
  used_this_cycle bigint;
  included_remaining bigint;
  from_credits integer;
begin
  if p_cost_nanos is null or p_cost_nanos < 0 then
    raise exception 'cost must be non-negative';
  end if;
  if p_unit_nanos is null or p_unit_nanos <= 0 then
    raise exception 'unit size must be positive';
  end if;
  if p_source is not null and p_source not in ('store', 'preview') then
    raise exception 'invalid usage source';
  end if;

  select credits, image_cost_carry_nanos into current_credits, carry
    from public.users where id = p_user_id for update;
  if current_credits is null then return null; end if;

  combined := coalesce(carry, 0) + p_cost_nanos;
  units := least(combined / p_unit_nanos, 2147483647::bigint)::integer;
  remainder := combined % p_unit_nanos;

  select coalesce(sum(g.units), 0) into used_this_cycle
    from public.image_generations g
    where g.user_id = p_user_id and g.created_at >= p_cycle_start;

  included_remaining := greatest(greatest(coalesce(p_included_allowance, 0), 0)::bigint - used_this_cycle, 0);
  from_credits := greatest(units::bigint - included_remaining, 0)::integer;

  -- Reject the whole render (consume nothing, keep the carry) when the balance can't cover it.
  if from_credits > 0 and current_credits - from_credits < p_balance_floor then
    return null;
  end if;

  update public.users
  set credits = credits - from_credits,
      image_cost_carry_nanos = remainder,
      updated_at = now()
  where id = p_user_id;

  if units > 0 then
    insert into public.image_generations (user_id, kind, units, cost_nanos, session_id, source)
    values (p_user_id, p_kind, units, p_cost_nanos, nullif(btrim(p_session_id), ''), p_source);
  end if;

  return current_credits - from_credits;
end;
$$;

revoke all on function public.consume_image_generation(uuid, varchar, timestamptz, integer, bigint, bigint, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_image_generation(uuid, varchar, timestamptz, integer, bigint, bigint, integer, text, text)
  to service_role;
