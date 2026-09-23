-- Ties a widget browser session to the shopper account signed in on it, so the usage page
-- can name the shopper by email. Billed rows only carry the browser session id; the link is
-- written when the widget resumes or completes a sign-in. The first account seen on a session
-- keeps it: the widget starts a new session id on sign-out, so a later account on the same
-- browser gets its own id instead of taking over earlier spend.

create table if not exists public.shopper_session_links (
  owner_id            uuid not null references public.users(id) on delete cascade,
  session_id          text not null,
  shopper_account_id  uuid not null references public.shopper_accounts(id) on delete cascade,
  created_at          timestamptz not null default now(),
  primary key (owner_id, session_id)
);

create index if not exists shopper_session_links_account_idx
  on public.shopper_session_links (shopper_account_id);

alter table public.shopper_session_links enable row level security;

-- Rows are now grouped by shopper: `acct:<account id>` when the session is linked, otherwise
-- the raw session id. `session_id` keeps its name so callers filter one shopper the same way.
drop function if exists public.usage_top_sessions(uuid, timestamptz, timestamptz, text, text, integer, integer, text);

create function public.usage_top_sessions(
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
      sum(keyed.chat_calls) as chat_calls,
      sum(keyed.chat_units) as chat_units,
      sum(keyed.searches) as searches,
      sum(keyed.search_units) as search_units,
      sum(keyed.try_on_count) as try_on_count,
      sum(keyed.try_on_units) as try_on_units,
      sum(keyed.avatar_count) as avatar_count,
      sum(keyed.avatar_units) as avatar_units,
      sum(keyed.live_events) as live_events,
      sum(keyed.live_seconds) as live_seconds,
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
    ranked.first_seen,
    ranked.last_seen,
    ranked.shopper_count
  from ranked
  left join public.shopper_accounts accounts on accounts.id = ranked.shopper_account_id
  order by ranked.billed_nanos desc, ranked.last_seen desc
  limit (select row_limit from params)
  offset (select row_offset from params);
$$;

revoke all on function public.usage_top_sessions(uuid, timestamptz, timestamptz, text, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.usage_top_sessions(uuid, timestamptz, timestamptz, text, text, integer, integer, text)
  to service_role;
