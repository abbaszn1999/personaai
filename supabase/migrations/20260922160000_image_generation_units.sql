-- A try-on row charges one unit per garment image sent to Pruna. An avatar row stays one
-- unit per successful image. Historical rows default to 1, so a sum matches the old row count.

alter table public.image_generations
  add column if not exists units integer not null default 1 check (units > 0);

-- Postgres treats a new argument list as a different function, so the old signature has to go.
drop function if exists public.consume_image_generation(uuid, varchar, timestamptz, integer);

-- Included allowance is consumed first. The purchased balance moves only for the remainder,
-- and only when it covers that remainder in full. The split matches allocateImageUnits.
create or replace function public.consume_image_generation(
  p_user_id uuid,
  p_kind varchar,
  p_cycle_start timestamptz,
  p_included_allowance integer,
  p_units integer default 1
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  account_exists boolean;
  used_this_cycle bigint;
  included_remaining bigint;
  from_credits integer;
  updated_rows integer;
begin
  if p_units is null or p_units < 1 then
    raise exception 'units must be positive';
  end if;

  select true into account_exists
    from public.users where id = p_user_id for update;
  if account_exists is not true then return false; end if;

  select coalesce(sum(units), 0) into used_this_cycle
  from public.image_generations
  where user_id = p_user_id and created_at >= p_cycle_start;

  included_remaining := greatest(greatest(coalesce(p_included_allowance, 0), 0)::bigint - used_this_cycle, 0);
  from_credits := greatest(p_units::bigint - included_remaining, 0)::integer;

  if from_credits > 0 then
    update public.users
    set credits = credits - from_credits, updated_at = now()
    where id = p_user_id and credits >= from_credits;
    get diagnostics updated_rows = row_count;
    if updated_rows = 0 then return false; end if;
  end if;

  insert into public.image_generations (user_id, kind, units)
  values (p_user_id, p_kind, p_units);
  return true;
end;
$$;

revoke all on function public.consume_image_generation(uuid, varchar, timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_image_generation(uuid, varchar, timestamptz, integer, integer)
  to service_role;
