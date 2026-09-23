-- Attributes each billed event to a shopper session and a surface (store widget or the
-- merchant's own preview), then aggregates spend in the database. Summing rows in the app
-- stops at PostgREST's 1,000-row page, so the usage page calls these functions instead.
--
-- Unit prices below match src/lib/billing/pricing.ts:
--   session unit  2,500,000 nanos  ($0.0025)
--   garment unit  8,000,000 nanos  ($0.008)
--   live second  20,000,000 nanos  ($1.20 / 60)
-- A session turn that contains both chat and search splits its billed units in proportion
-- to nano cost. Carry that completes a unit with no new cost follows the calls on that row.

alter table public.image_generations
  add column if not exists session_id text,
  add column if not exists source text;

alter table public.image_generations drop constraint if exists image_generations_source_check;
alter table public.image_generations
  add constraint image_generations_source_check
  check (source is null or source in ('store', 'preview'));

alter table public.session_usage_events
  add column if not exists source text;

alter table public.session_usage_events drop constraint if exists session_usage_events_source_check;
alter table public.session_usage_events
  add constraint session_usage_events_source_check
  check (source is null or source in ('store', 'preview'));

alter table public.realtime_tryon_events
  add column if not exists source text;

alter table public.realtime_tryon_events drop constraint if exists realtime_tryon_events_source_check;
alter table public.realtime_tryon_events
  add constraint realtime_tryon_events_source_check
  check (source is null or source in ('store', 'preview'));

-- Preview chat is keyed by the merchant's own account id. Everything else that already
-- has a session id is a store shopper. Image rows have no session yet, so they stay
-- unattributed until new generations record one.
update public.session_usage_events
set source = case when session_id = owner_id::text then 'preview' else 'store' end
where source is null;

update public.realtime_tryon_events
set source = case when session_id = owner_id::text then 'preview' else 'store' end
where source is null;

create index if not exists image_generations_user_id_created_at_idx
  on public.image_generations (user_id, created_at);

create index if not exists session_usage_events_owner_created_idx
  on public.session_usage_events (owner_id, created_at);

create index if not exists realtime_tryon_events_owner_created_idx
  on public.realtime_tryon_events (owner_id, created_at);

drop function if exists public.consume_image_generation(uuid, varchar, timestamptz, integer, integer, integer);

create or replace function public.consume_image_generation(
  p_user_id uuid,
  p_kind varchar,
  p_cycle_start timestamptz,
  p_included_allowance integer,
  p_units integer default 1,
  p_balance_floor integer default 0,
  p_session_id text default null,
  p_source text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_credits integer;
  used_this_cycle bigint;
  included_remaining bigint;
  from_credits integer;
begin
  if p_units is null or p_units < 1 then
    raise exception 'units must be positive';
  end if;
  if p_source is not null and p_source not in ('store', 'preview') then
    raise exception 'invalid usage source';
  end if;

  select credits into current_credits
    from public.users where id = p_user_id for update;
  if current_credits is null then return false; end if;

  select coalesce(sum(units), 0) into used_this_cycle
    from public.image_generations
    where user_id = p_user_id and created_at >= p_cycle_start;

  included_remaining := greatest(greatest(coalesce(p_included_allowance, 0), 0)::bigint - used_this_cycle, 0);
  from_credits := greatest(p_units::bigint - included_remaining, 0)::integer;

  if from_credits > 0 and current_credits - from_credits < p_balance_floor then
    return false;
  end if;

  if from_credits > 0 then
    update public.users
    set credits = credits - from_credits, updated_at = now()
    where id = p_user_id;
  end if;

  insert into public.image_generations (user_id, kind, units, session_id, source)
  values (p_user_id, p_kind, p_units, nullif(btrim(p_session_id), ''), p_source);
  return true;
end;
$$;

revoke all on function public.consume_image_generation(uuid, varchar, timestamptz, integer, integer, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_image_generation(uuid, varchar, timestamptz, integer, integer, integer, text, text)
  to service_role;

drop function if exists public.consume_live_tryon_seconds(uuid, text, text, text, integer, timestamptz, integer, text, boolean, integer);

create or replace function public.consume_live_tryon_seconds(
  p_user_id uuid,
  p_session_id text,
  p_product_id text,
  p_product_name text,
  p_duration_seconds integer,
  p_cycle_start timestamptz,
  p_included_allowance integer,
  p_idempotency_key text default null,
  p_billable boolean default true,
  p_balance_floor integer default 0,
  p_source text default null
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
  if p_source is not null and p_source not in ('store', 'preview') then
    raise exception 'invalid usage source';
  end if;

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
    remaining_balance := current_balance - seconds_to_charge;
    if remaining_balance < p_balance_floor then
      remaining_balance := p_balance_floor;
    end if;
    update public.users set live_tryon_seconds_balance = remaining_balance, updated_at = now()
    where id = p_user_id;
  else
    remaining_balance := current_balance;
  end if;

  insert into public.realtime_tryon_events (
    owner_id, session_id, product_id, product_name, duration_seconds, idempotency_key, billable, source
  ) values (
    p_user_id, p_session_id, p_product_id, p_product_name, p_duration_seconds, p_idempotency_key, p_billable, p_source
  );

  return remaining_balance;
end;
$$;

revoke all on function public.consume_live_tryon_seconds(uuid, text, text, text, integer, timestamptz, integer, text, boolean, integer, text)
  from public, anon, authenticated;
grant execute on function public.consume_live_tryon_seconds(uuid, text, text, text, integer, timestamptz, integer, text, boolean, integer, text)
  to service_role;

drop function if exists public.consume_session_units(uuid, text, bigint, integer, integer, timestamptz, integer, text, bigint, integer);

create or replace function public.consume_session_units(
  p_user_id uuid,
  p_session_id text,
  p_cost_nanos bigint,
  p_acs_searches integer,
  p_gemini_calls integer,
  p_cycle_start timestamptz,
  p_included_allowance integer,
  p_idempotency_key text,
  p_unit_nanos bigint default 2500000,
  p_balance_floor integer default 0,
  p_source text default null
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  current_balance integer;
  carry bigint;
  combined bigint;
  units integer;
  remainder bigint;
  previous_units bigint;
  previous_overage bigint;
  next_overage bigint;
  units_to_charge integer;
  remaining_balance integer;
begin
  if p_cost_nanos < 0 then raise exception 'cost must be non-negative'; end if;
  if p_unit_nanos <= 0 then raise exception 'unit size must be positive'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'idempotency key is required';
  end if;
  if p_source is not null and p_source not in ('store', 'preview') then
    raise exception 'invalid usage source';
  end if;

  select session_units_balance, session_cost_carry_nanos
    into current_balance, carry
  from public.users
  where id = p_user_id
  for update;

  if current_balance is null then raise exception 'account not found'; end if;

  if exists (
    select 1 from public.session_usage_events where idempotency_key = p_idempotency_key
  ) then
    return current_balance;
  end if;

  combined := carry + p_cost_nanos;
  units := least(combined / p_unit_nanos, 2147483647::bigint)::integer;
  remainder := combined % p_unit_nanos;

  select coalesce(sum(e.units_charged), 0) into previous_units
  from public.session_usage_events e
  where e.owner_id = p_user_id and e.created_at >= p_cycle_start;

  previous_overage := greatest(previous_units - greatest(p_included_allowance, 0), 0);
  next_overage := greatest(previous_units + units - greatest(p_included_allowance, 0), 0);
  units_to_charge := least(greatest(next_overage - previous_overage, 0), 2147483647)::integer;
  remaining_balance := current_balance - units_to_charge;
  if remaining_balance < p_balance_floor then
    remaining_balance := p_balance_floor;
  end if;

  update public.users
  set session_units_balance = remaining_balance,
      session_cost_carry_nanos = remainder,
      updated_at = now()
  where id = p_user_id;

  insert into public.session_usage_events (
    owner_id, session_id, cost_nanos, acs_searches, gemini_calls, units_charged, idempotency_key, source
  ) values (
    p_user_id, p_session_id, p_cost_nanos, p_acs_searches, p_gemini_calls, units, p_idempotency_key, p_source
  );

  return remaining_balance;
end;
$$;

revoke all on function public.consume_session_units(uuid, text, bigint, integer, integer, timestamptz, integer, text, bigint, integer, text)
  from public, anon, authenticated;
grant execute on function public.consume_session_units(uuid, text, bigint, integer, integer, timestamptz, integer, text, bigint, integer, text)
  to service_role;

-- One row per local day (or week) and tool. `nanos` is the billed amount, so it matches
-- units × the price above. An invalid source or an empty range returns no rows.
create or replace function public.usage_report(
  p_owner uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text,
  p_tz text,
  p_source text
) returns table (
  bucket date,
  tool text,
  quantity bigint,
  units bigint,
  nanos bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      case
        when exists (select 1 from pg_timezone_names n where n.name = p_tz) then p_tz
        else 'UTC'
      end as tz,
      case when p_bucket = 'week' then 'week' else 'day' end as unit,
      case
        when p_source is null or p_source = 'all' then 'all'
        when p_source in ('store', 'preview') then p_source
        else 'invalid'
      end as source_filter
  ),
  session_final as (
    select
      split.bucket,
      split.acs_searches,
      split.gemini_calls,
      split.cost_nanos - split.search_nanos as chat_nanos,
      split.search_nanos,
      split.search_units,
      split.units_charged - split.search_units as chat_units
    from (
      select
        rows.bucket,
        rows.acs_searches,
        rows.gemini_calls,
        rows.units_charged,
        rows.cost_nanos,
        rows.search_nanos,
        case
          when rows.cost_nanos > 0 then (rows.units_charged * rows.search_nanos) / rows.cost_nanos
          when rows.acs_searches > 0 and rows.gemini_calls = 0 then rows.units_charged
          else 0
        end as search_units
      from (
        select
          (date_trunc(params.unit, e.created_at at time zone params.tz))::date as bucket,
          e.acs_searches,
          e.gemini_calls,
          e.units_charged::bigint as units_charged,
          e.cost_nanos,
          least(e.acs_searches::bigint * 2500000, e.cost_nanos) as search_nanos
        from public.session_usage_events e
        cross join params
        where p_to > p_from
          and params.source_filter <> 'invalid'
          and e.owner_id = p_owner
          and e.created_at >= p_from
          and e.created_at < p_to
          and (params.source_filter = 'all' or e.source = params.source_filter)
      ) rows
    ) split
  ),
  image_rows as (
    select
      (date_trunc(params.unit, g.created_at at time zone params.tz))::date as bucket,
      g.kind,
      g.units::bigint as units
    from public.image_generations g
    cross join params
    where p_to > p_from
      and params.source_filter <> 'invalid'
      and g.user_id = p_owner
      and g.created_at >= p_from
      and g.created_at < p_to
      and (params.source_filter = 'all' or g.source = params.source_filter)
  ),
  live_rows as (
    select
      (date_trunc(params.unit, e.created_at at time zone params.tz))::date as bucket,
      e.duration_seconds::bigint as seconds
    from public.realtime_tryon_events e
    cross join params
    where p_to > p_from
      and params.source_filter <> 'invalid'
      and e.billable
      and e.owner_id = p_owner
      and e.created_at >= p_from
      and e.created_at < p_to
      and (params.source_filter = 'all' or e.source = params.source_filter)
  )
  select session_final.bucket, 'chat'::text, sum(session_final.gemini_calls)::bigint,
         sum(session_final.chat_units), sum(session_final.chat_units) * 2500000
  from session_final
  group by session_final.bucket
  having sum(session_final.gemini_calls) > 0 or sum(session_final.chat_units) > 0
  union all
  select session_final.bucket, 'search'::text, sum(session_final.acs_searches)::bigint,
         sum(session_final.search_units), sum(session_final.search_units) * 2500000
  from session_final
  group by session_final.bucket
  having sum(session_final.acs_searches) > 0 or sum(session_final.search_units) > 0
  union all
  select image_rows.bucket, image_rows.kind::text, count(*)::bigint,
         sum(image_rows.units), sum(image_rows.units) * 8000000
  from image_rows
  group by image_rows.bucket, image_rows.kind
  union all
  select live_rows.bucket, 'live'::text, count(*)::bigint,
         sum(live_rows.seconds), sum(live_rows.seconds) * 20000000
  from live_rows
  group by live_rows.bucket;
$$;

revoke all on function public.usage_report(uuid, timestamptz, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.usage_report(uuid, timestamptz, timestamptz, text, text, text)
  to service_role;

-- Shoppers ordered by billed nanos. `p_session_id` of `__unattributed__` is the bucket of
-- image rows that predate session tracking. `shopper_count` is the filtered total, repeated
-- on every row so a page still knows how many shoppers exist.
create or replace function public.usage_top_sessions(
  p_owner uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_source text,
  p_tool text,
  p_limit integer,
  p_offset integer,
  p_session_id text default null
) returns table (
  session_id text,
  source text,
  chat_calls bigint,
  chat_units bigint,
  searches bigint,
  search_units bigint,
  try_on_count bigint,
  try_on_units bigint,
  avatar_count bigint,
  avatar_units bigint,
  live_events bigint,
  live_seconds bigint,
  first_seen timestamptz,
  last_seen timestamptz,
  shopper_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      case
        when p_source is null or p_source = 'all' then 'all'
        when p_source in ('store', 'preview') then p_source
        else 'invalid'
      end as source_filter,
      case
        when p_tool is null or p_tool = 'all' then 'all'
        when p_tool in ('chat', 'search', 'try_on', 'avatar', 'live') then p_tool
        else 'invalid'
      end as tool_filter,
      least(greatest(coalesce(p_limit, 25), 1), 1000) as row_limit,
      greatest(coalesce(p_offset, 0), 0) as row_offset
  ),
  session_final as (
    select
      split.session_id,
      split.source,
      split.created_at,
      split.acs_searches,
      split.gemini_calls,
      split.search_units,
      split.units_charged - split.search_units as chat_units
    from (
      select
        rows.session_id,
        rows.source,
        rows.created_at,
        rows.acs_searches,
        rows.gemini_calls,
        rows.units_charged,
        case
          when rows.cost_nanos > 0 then (rows.units_charged * rows.search_nanos) / rows.cost_nanos
          when rows.acs_searches > 0 and rows.gemini_calls = 0 then rows.units_charged
          else 0
        end as search_units
      from (
        select
          e.session_id,
          e.source,
          e.created_at,
          e.acs_searches,
          e.gemini_calls,
          e.units_charged::bigint as units_charged,
          e.cost_nanos,
          least(e.acs_searches::bigint * 2500000, e.cost_nanos) as search_nanos
        from public.session_usage_events e
        cross join params
        where p_to > p_from
          and params.source_filter <> 'invalid'
          and params.tool_filter <> 'invalid'
          and e.owner_id = p_owner
          and e.created_at >= p_from
          and e.created_at < p_to
          and (params.source_filter = 'all' or e.source = params.source_filter)
      ) rows
    ) split
  ),
  slices as (
    select
      session_final.session_id,
      session_final.source,
      session_final.created_at,
      session_final.gemini_calls::bigint as chat_calls,
      session_final.chat_units,
      session_final.acs_searches::bigint as searches,
      session_final.search_units,
      0::bigint as try_on_count,
      0::bigint as try_on_units,
      0::bigint as avatar_count,
      0::bigint as avatar_units,
      0::bigint as live_events,
      0::bigint as live_seconds
    from session_final
    union all
    select
      g.session_id,
      g.source,
      g.created_at,
      0::bigint, 0::bigint, 0::bigint, 0::bigint,
      case when g.kind = 'try_on' then 1 else 0 end::bigint,
      case when g.kind = 'try_on' then g.units else 0 end::bigint,
      case when g.kind = 'avatar' then 1 else 0 end::bigint,
      case when g.kind = 'avatar' then g.units else 0 end::bigint,
      0::bigint, 0::bigint
    from public.image_generations g
    cross join params
    where p_to > p_from
      and params.source_filter <> 'invalid'
      and params.tool_filter <> 'invalid'
      and g.user_id = p_owner
      and g.created_at >= p_from
      and g.created_at < p_to
      and (params.source_filter = 'all' or g.source = params.source_filter)
    union all
    select
      e.session_id,
      e.source,
      e.created_at,
      0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
      1::bigint,
      e.duration_seconds::bigint
    from public.realtime_tryon_events e
    cross join params
    where p_to > p_from
      and params.source_filter <> 'invalid'
      and params.tool_filter <> 'invalid'
      and e.billable
      and e.owner_id = p_owner
      and e.created_at >= p_from
      and e.created_at < p_to
      and (params.source_filter = 'all' or e.source = params.source_filter)
  ),
  grouped as (
    select
      slices.session_id,
      slices.source,
      sum(slices.chat_calls) as chat_calls,
      sum(slices.chat_units) as chat_units,
      sum(slices.searches) as searches,
      sum(slices.search_units) as search_units,
      sum(slices.try_on_count) as try_on_count,
      sum(slices.try_on_units) as try_on_units,
      sum(slices.avatar_count) as avatar_count,
      sum(slices.avatar_units) as avatar_units,
      sum(slices.live_events) as live_events,
      sum(slices.live_seconds) as live_seconds,
      min(slices.created_at) as first_seen,
      max(slices.created_at) as last_seen
    from slices
    where p_session_id is null
      or (p_session_id = '__unattributed__' and slices.session_id is null)
      or slices.session_id = p_session_id
    group by slices.session_id, slices.source
  ),
  filtered as (
    select grouped.*
    from grouped
    cross join params
    where case params.tool_filter
      when 'chat' then grouped.chat_calls > 0 or grouped.chat_units > 0
      when 'search' then grouped.searches > 0 or grouped.search_units > 0
      when 'try_on' then grouped.try_on_units > 0
      when 'avatar' then grouped.avatar_units > 0
      when 'live' then grouped.live_seconds > 0
      else true
    end
  ),
  ranked as (
    select
      filtered.*,
      count(*) over () as shopper_count,
      (
        filtered.chat_units * 2500000
        + filtered.search_units * 2500000
        + filtered.try_on_units * 8000000
        + filtered.avatar_units * 8000000
        + filtered.live_seconds * 20000000
      ) as billed_nanos
    from filtered
  )
  select
    ranked.session_id,
    ranked.source,
    ranked.chat_calls,
    ranked.chat_units,
    ranked.searches,
    ranked.search_units,
    ranked.try_on_count,
    ranked.try_on_units,
    ranked.avatar_count,
    ranked.avatar_units,
    ranked.live_events,
    ranked.live_seconds,
    ranked.first_seen,
    ranked.last_seen,
    ranked.shopper_count
  from ranked
  cross join params
  order by ranked.billed_nanos desc, ranked.last_seen desc
  limit (select row_limit from params)
  offset (select row_offset from params);
$$;

revoke all on function public.usage_top_sessions(uuid, timestamptz, timestamptz, text, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.usage_top_sessions(uuid, timestamptz, timestamptz, text, text, integer, integer, text)
  to service_role;
