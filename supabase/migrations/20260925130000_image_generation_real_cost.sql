-- Charge image generation at Pruna's real per-render cost instead of a flat $0.008 unit.
--
-- Pruna prices p-image-edit (avatar) at $0.010 per output image, and p-image-try-on at $0.015
-- for the first garment then $0.008 for each additional garment (turbo on). The old function
-- took a whole-unit count and treated every image/garment as one $0.008 unit, which undercharged
-- every avatar image by $0.002 and every try-on's first garment by $0.007.
--
-- Callers now pass the render's real cost in nano-dollars. This function folds it into a
-- per-account carry (mirroring consume_session_units / session_cost_carry_nanos), settles whole
-- $0.008 units, and keeps the remainder for the next render — so no fractional cost is lost or
-- over-collected. It returns the remaining purchased credit balance (or NULL when the balance
-- cannot cover the charge, in which case nothing is consumed).

alter table public.users
  add column if not exists image_cost_carry_nanos bigint not null default 0;

drop function if exists public.consume_image_generation(uuid, varchar, timestamptz, integer, integer, integer, text, text);

create or replace function public.consume_image_generation(
  p_user_id uuid,
  p_kind varchar,
  p_cycle_start timestamptz,
  p_included_allowance integer,
  p_cost_nanos bigint,
  p_unit_nanos bigint default 8000000,
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
    insert into public.image_generations (user_id, kind, units, session_id, source)
    values (p_user_id, p_kind, units, nullif(btrim(p_session_id), ''), p_source);
  end if;

  return current_credits - from_credits;
end;
$$;

revoke all on function public.consume_image_generation(uuid, varchar, timestamptz, integer, bigint, bigint, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_image_generation(uuid, varchar, timestamptz, integer, bigint, bigint, integer, text, text)
  to service_role;
