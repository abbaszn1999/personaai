alter table public.sizing_charts
  add column if not exists covers_leaves text[] not null default '{}'::text[];

create index if not exists sizing_charts_covers_leaves_idx
  on public.sizing_charts using gin (covers_leaves);

comment on column public.sizing_charts.covers_leaves is
  'The Persona leaf keys ("women:top:blouse") this exact chart row is the authoritative chart for. '
  'Replaces name/tag-based guessing (LEAF_GARMENT_TAGS, VARIANT_GARMENT_PATTERNS in variant-match.ts, '
  'removed in this migration''s companion code change) as of 20260922020000: a brand publishes '
  'however many "tops" charts it wants, and only this explicit list says which leaf each one governs '
  '-- inferring it from the brand''s own wording does not scale past a handful of hand-seeded brands. '
  'Populated by the research prompt (one call per brand, no extra request) and by hand for seeds and '
  'manual charts. Empty only for a chart nothing has been assigned to yet.';
