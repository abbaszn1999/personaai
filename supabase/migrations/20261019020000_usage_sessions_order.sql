-- Lets the shoppers list be ordered by recency instead of cost. Merchants whose costs are hidden
-- must not get a list ranked by what each shopper cost, so they are served 'recent'.
-- The old 8-argument signature is dropped so callers cannot hit an ambiguous overload.
drop function if exists public.usage_top_sessions(uuid, timestamptz, timestamptz, text, text, integer, integer, text);


create function public.usage_top_sessions(
  p_owner uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_source text,
  p_tool text,
  p_limit integer,
  p_offset integer,
  p_session_id text default null,
  p_order text default 'cost'
) returns table (
  session_id text,
  source text,
  shopper_email text,
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
  cost_nanos bigint,
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
  slices as (
    select
      rows.session_id,
      rows.source,
      rows.created_at,
      rows.gemini_calls as chat_calls,
      rows.acs_searches as searches,
      rows.units_charged as session_units,
      case
        when rows.cost_nanos > 0 then rows.units_charged::numeric * rows.search_nanos / rows.cost_nanos
        when rows.acs_searches > 0 and rows.gemini_calls = 0 then rows.units_charged::numeric
        else 0::numeric
      end as search_share,
      0::bigint as try_on_count,
      0::bigint as try_on_units,
      0::bigint as avatar_count,
      0::bigint as avatar_units,
      0::bigint as live_events,
      0::bigint as live_seconds,
      rows.cost_nanos as nanos
    from (
      select
        e.session_id,
        e.source,
        e.created_at,
        e.gemini_calls::bigint as gemini_calls,
        e.acs_searches::bigint as acs_searches,
        e.units_charged::bigint as units_charged,
        e.cost_nanos::bigint as cost_nanos,
        least(e.acs_searches::bigint * 2500000, e.cost_nanos::bigint) as search_nanos
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
    union all
    select
      g.session_id,
      g.source,
      g.created_at,
      0::bigint, 0::bigint, 0::bigint, 0::numeric,
      case when g.kind = 'try_on' then 1 else 0 end::bigint,
      case when g.kind = 'try_on' then g.units else 0 end::bigint,
      case when g.kind = 'avatar' then 1 else 0 end::bigint,
      case when g.kind = 'avatar' then g.units else 0 end::bigint,
      0::bigint, 0::bigint,
      case when coalesce(g.cost_nanos, 0) > 0 then g.cost_nanos::bigint else g.units::bigint * 10000000 end
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
      0::bigint, 0::bigint, 0::bigint, 0::numeric, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
      1::bigint,
      e.duration_seconds::bigint,
      e.duration_seconds::bigint * 20000000
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
  keyed as (
    select
      case
        when links.shopper_account_id is not null then 'acct:' || links.shopper_account_id::text
        else slices.session_id
      end as shopper_key,
      links.shopper_account_id,
      slices.*
    from slices
    left join public.shopper_session_links links
      on links.owner_id = p_owner and links.session_id = slices.session_id
  ),
  grouped as (
    select
      keyed.shopper_key,
      keyed.source,
      keyed.shopper_account_id,
      sum(keyed.chat_calls)::bigint as chat_calls,
      sum(keyed.session_units)::bigint - round(sum(keyed.search_share))::bigint as chat_units,
      sum(keyed.searches)::bigint as searches,
      round(sum(keyed.search_share))::bigint as search_units,
      sum(keyed.try_on_count)::bigint as try_on_count,
      sum(keyed.try_on_units)::bigint as try_on_units,
      sum(keyed.avatar_count)::bigint as avatar_count,
      sum(keyed.avatar_units)::bigint as avatar_units,
      sum(keyed.live_events)::bigint as live_events,
      sum(keyed.live_seconds)::bigint as live_seconds,
      sum(keyed.nanos)::bigint as cost_nanos,
      min(keyed.created_at) as first_seen,
      max(keyed.created_at) as last_seen
    from keyed
    where p_session_id is null
      or (p_session_id = '__unattributed__' and keyed.shopper_key is null)
      or keyed.shopper_key = p_session_id
    group by keyed.shopper_key, keyed.source, keyed.shopper_account_id
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
    select filtered.*, count(*) over () as shopper_count
    from filtered
  )
  select
    ranked.shopper_key,
    ranked.source,
    accounts.email::text,
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
    ranked.cost_nanos,
    ranked.first_seen,
    ranked.last_seen,
    ranked.shopper_count
  from ranked
  left join public.shopper_accounts accounts on accounts.id = ranked.shopper_account_id
  order by case when p_order = 'recent' then 0 else ranked.cost_nanos end desc, ranked.last_seen desc
  limit (select row_limit from params)
  offset (select row_offset from params);
$$;

revoke all on function public.usage_top_sessions(uuid, timestamptz, timestamptz, text, text, integer, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.usage_top_sessions(uuid, timestamptz, timestamptz, text, text, integer, integer, text, text)
  to service_role;
