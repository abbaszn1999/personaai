-- Account-scoped balances and allowance-aware usage consumption.
alter table public.users
  add column live_tryon_seconds_balance integer not null default 0
    check (live_tryon_seconds_balance >= 0),
  alter column subscription_tier set default 'fixed';

update public.users
set subscription_tier = 'fixed', updated_at = now()
where subscription_tier = 'free';

drop function if exists public.consume_image_credit(uuid, varchar);

create or replace function public.consume_image_generation(
  p_user_id uuid,
  p_kind varchar,
  p_cycle_start timestamptz,
  p_included_allowance integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  account_exists boolean;
  used_this_cycle integer;
  updated_rows integer;
begin
  select true into account_exists
  from public.users where id = p_user_id for update;
  if account_exists is not true then return false; end if;

  select count(*)::integer into used_this_cycle
  from public.image_generations
  where user_id = p_user_id and created_at >= p_cycle_start;

  if used_this_cycle >= greatest(p_included_allowance, 0) then
    update public.users
    set credits = credits - 1, updated_at = now()
    where id = p_user_id and credits >= 1;
    get diagnostics updated_rows = row_count;
    if updated_rows = 0 then return false; end if;
  end if;

  insert into public.image_generations (user_id, kind) values (p_user_id, p_kind);
  return true;
end;
$$;

create or replace function public.consume_live_tryon_seconds(
  p_user_id uuid,
  p_workspace_id uuid,
  p_session_id text,
  p_product_id text,
  p_product_name text,
  p_duration_seconds integer,
  p_cycle_start timestamptz,
  p_included_allowance integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
  previous_seconds bigint;
  previous_overage bigint;
  next_overage bigint;
  seconds_to_charge integer;
  remaining_balance integer;
begin
  if p_duration_seconds <= 0 then raise exception 'duration must be positive'; end if;

  select live_tryon_seconds_balance into current_balance
  from public.users where id = p_user_id for update;
  if current_balance is null then raise exception 'account not found'; end if;

  if not exists (
    select 1 from public.workspaces
    where id = p_workspace_id and owner_id = p_user_id and mode = 'wearable'
  ) then raise exception 'wearable workspace not found'; end if;

  select coalesce(sum(e.duration_seconds), 0) into previous_seconds
  from public.realtime_tryon_events e
  join public.workspaces w on w.id = e.workspace_id
  where w.owner_id = p_user_id and e.created_at >= p_cycle_start;

  previous_overage := greatest(previous_seconds - greatest(p_included_allowance, 0), 0);
  next_overage := greatest(
    previous_seconds + p_duration_seconds - greatest(p_included_allowance, 0), 0
  );
  seconds_to_charge := least(next_overage - previous_overage, 2147483647)::integer;
  remaining_balance := greatest(current_balance - seconds_to_charge, 0);

  update public.users
  set live_tryon_seconds_balance = remaining_balance, updated_at = now()
  where id = p_user_id;

  insert into public.realtime_tryon_events (
    workspace_id, session_id, product_id, product_name, duration_seconds
  ) values (
    p_workspace_id, p_session_id, p_product_id, p_product_name, p_duration_seconds
  );
  return remaining_balance;
end;
$$;

create or replace function public.add_image_credits(p_user_id uuid, p_credits integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare next_balance integer;
begin
  if p_credits <= 0 then raise exception 'credits must be positive'; end if;
  update public.users
  set credits = credits + p_credits, updated_at = now()
  where id = p_user_id
  returning credits into next_balance;
  if next_balance is null then raise exception 'account not found'; end if;
  return next_balance;
end;
$$;

create or replace function public.add_live_tryon_seconds(p_user_id uuid, p_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare next_balance integer;
begin
  if p_seconds <= 0 then raise exception 'seconds must be positive'; end if;
  update public.users
  set live_tryon_seconds_balance = live_tryon_seconds_balance + p_seconds, updated_at = now()
  where id = p_user_id
  returning live_tryon_seconds_balance into next_balance;
  if next_balance is null then raise exception 'account not found'; end if;
  return next_balance;
end;
$$;

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
