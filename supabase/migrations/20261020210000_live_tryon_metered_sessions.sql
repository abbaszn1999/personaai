-- Server-metered live try-on sessions: the signaling proxy reports Decart's cumulative
-- generation seconds per upstream session, possibly several times (progress + final, retries,
-- out of order). Each report sets the session's total to the highest value seen and charges
-- only the increase, with the same included-allowance / purchased-balance split as
-- consume_live_tryon_seconds.

create or replace function public.record_live_tryon_session_seconds(
  p_user_id uuid,
  p_session_id text,
  p_idempotency_key text,
  p_total_seconds integer,
  p_cycle_start timestamptz,
  p_included_allowance integer,
  p_source text
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  current_balance integer;
  existing_id uuid;
  existing_owner uuid;
  existing_seconds integer;
  delta integer;
  previous_seconds bigint;
  previous_overage bigint;
  next_overage bigint;
  seconds_to_charge integer;
  remaining_balance integer;
begin
  if p_total_seconds is null or p_total_seconds < 0 then raise exception 'total seconds must be non-negative'; end if;
  if p_source is null or p_source not in ('store', 'preview') then raise exception 'invalid usage source'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'idempotency key is required';
  end if;

  select live_tryon_seconds_balance into current_balance from public.users
  where id = p_user_id for update;
  if current_balance is null then raise exception 'account not found'; end if;

  select id, owner_id, duration_seconds into existing_id, existing_owner, existing_seconds
  from public.realtime_tryon_events
  where idempotency_key = p_idempotency_key
  for update;

  if existing_id is not null and existing_owner <> p_user_id then
    raise exception 'idempotency key belongs to another account';
  end if;

  delta := p_total_seconds - coalesce(existing_seconds, 0);
  if delta <= 0 then
    return current_balance;
  end if;

  select coalesce(sum(e.duration_seconds), 0) into previous_seconds
  from public.realtime_tryon_events e
  where e.owner_id = p_user_id and e.created_at >= p_cycle_start and e.billable;

  previous_overage := greatest(previous_seconds - greatest(p_included_allowance, 0), 0);
  next_overage := greatest(previous_seconds + delta - greatest(p_included_allowance, 0), 0);
  seconds_to_charge := least(next_overage - previous_overage, 2147483647)::integer;
  remaining_balance := greatest(current_balance - seconds_to_charge, 0);

  update public.users set live_tryon_seconds_balance = remaining_balance, updated_at = now()
  where id = p_user_id;

  if existing_id is not null then
    update public.realtime_tryon_events set duration_seconds = p_total_seconds where id = existing_id;
  else
    insert into public.realtime_tryon_events (
      owner_id, session_id, product_id, product_name, duration_seconds, idempotency_key, billable, source
    ) values (
      p_user_id, p_session_id, '__session__', 'Live session', p_total_seconds, p_idempotency_key, true, p_source
    );
  end if;

  return remaining_balance;
end;
$$;

revoke all on function public.record_live_tryon_session_seconds(uuid, text, text, integer, timestamptz, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_live_tryon_session_seconds(uuid, text, text, integer, timestamptz, integer, text)
  to service_role;
