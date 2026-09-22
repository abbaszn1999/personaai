-- One billable row per live session (Decart generation seconds). Garment previews stay
-- in the table for analytics but no longer move the included allowance or the purchased balance.
-- Existing rows default to billable so history already charged stays in the usage sum.

alter table public.realtime_tryon_events
  add column if not exists billable boolean not null default true;

drop function if exists public.consume_live_tryon_seconds(uuid, text, text, text, integer, timestamptz, integer, text);
drop function if exists public.consume_live_tryon_seconds(uuid, text, text, text, integer, timestamptz, integer, text, boolean);

create or replace function public.consume_live_tryon_seconds(
  p_user_id uuid,
  p_session_id text,
  p_product_id text,
  p_product_name text,
  p_duration_seconds integer,
  p_cycle_start timestamptz,
  p_included_allowance integer,
  p_idempotency_key text default null,
  p_billable boolean default true
) returns integer
language plpgsql
security definer
set search_path to 'public'
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

  select live_tryon_seconds_balance into current_balance from public.users
  where id = p_user_id for update;
  if current_balance is null then raise exception 'account not found'; end if;

  if p_idempotency_key is not null then
    if length(trim(p_idempotency_key)) < 8 then
      raise exception 'idempotency key is required';
    end if;
    if exists (select 1 from public.realtime_tryon_events where idempotency_key = p_idempotency_key) then
      return current_balance;
    end if;
  end if;

  select coalesce(sum(e.duration_seconds), 0) into previous_seconds
  from public.realtime_tryon_events e
  where e.owner_id = p_user_id and e.created_at >= p_cycle_start and e.billable;

  if p_billable then
    previous_overage := greatest(previous_seconds - greatest(p_included_allowance, 0), 0);
    next_overage := greatest(previous_seconds + p_duration_seconds - greatest(p_included_allowance, 0), 0);
    seconds_to_charge := least(next_overage - previous_overage, 2147483647)::integer;
    remaining_balance := greatest(current_balance - seconds_to_charge, 0);
    update public.users set live_tryon_seconds_balance = remaining_balance, updated_at = now()
    where id = p_user_id;
  else
    remaining_balance := current_balance;
  end if;

  insert into public.realtime_tryon_events (
    owner_id, session_id, product_id, product_name, duration_seconds, idempotency_key, billable
  ) values (
    p_user_id, p_session_id, p_product_id, p_product_name, p_duration_seconds, p_idempotency_key, p_billable
  );

  return remaining_balance;
end;
$$;

revoke all on function public.consume_live_tryon_seconds(uuid, text, text, text, integer, timestamptz, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.consume_live_tryon_seconds(uuid, text, text, text, integer, timestamptz, integer, text, boolean)
  to service_role;
