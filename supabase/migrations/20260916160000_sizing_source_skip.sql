-- Lets a store that already keeps a per-product size chart skip the stages that would have produced
-- one. Stages 2 to 5 exist to discover brands, research published guides, fill the gaps and assign
-- the result; a merchant whose products each carry their own chart has all of that already, so
-- walking them through it spends model calls to arrive where they started.
--
-- Two columns rather than one because they answer different questions. `sizing_source` is where the
-- charts a shopper eventually sees come from, which the recommendation path needs regardless of how
-- setup went. `sizing_stages_skipped_at` is whether the merchant took the shortcut, which only setup
-- navigation cares about — and being a timestamp rather than a boolean, it also says when, which is
-- what makes "skipped before you added those 4,000 unmapped products" answerable later.

alter table public.store_connections
  add column if not exists sizing_source text not null default 'ai_pipeline',
  add column if not exists sizing_stages_skipped_at timestamptz;

alter table public.store_connections
  drop constraint if exists store_connections_sizing_source_check;

alter table public.store_connections
  add constraint store_connections_sizing_source_check
  check (sizing_source in ('ai_pipeline', 'merchant_charts'));

comment on column public.store_connections.sizing_source is
  'Where per-product size charts come from. ''ai_pipeline'' (default): produced by setup stages 2-5. '
  '''merchant_charts'': the merchant already stores one per product, bound to the sizeChartData row of '
  'Stage 1''s mapping. Set together with sizing_stages_skipped_at when the merchant takes the skip.';

comment on column public.store_connections.sizing_stages_skipped_at is
  'When the merchant skipped setup stages 2-5 on the strength of their own per-product charts. Null '
  'means they did not. Read by `stageForRun` to land a returning merchant on stage 6, and cleared if '
  'they unbind the size chart column — at which point the pipeline has work to do again.';
