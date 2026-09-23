-- `variant_gender` and `audience` have carried the same fact on every row this table has ever held.
-- `20260908140000` split them apart on a real distinction — `audience` is read off the page a chart
-- sat on (the URL, the section heading), `variant_gender` off the chart's own `variant_name` text —
-- and kept `variant_gender` nullable specifically for a guide that names no gender at all. That
-- distinction never once produced a different value: every seeded chart, and everything research
-- has written since, states its own gender in `variant_name` exactly where `audience` already says
-- it sat. Two columns asserting one fact double the ways a future write can disagree with itself for
-- no signal gained.
--
-- `audience` is the one kept, not `variant_gender`, because it is the one nothing already depends on
-- being absent: not null, always populated (`unisex` is a real answer, not a missing one), and
-- already what every reader outside `assignments.ts`'s own audience guard used directly. That guard
-- read `variant_gender ?? audience` as a "stronger signal first" preference; with the two never
-- disagreeing, the fallback was the whole rule, so the code drops the preference along with the
-- column rather than keeping a coalesce with only one side left.

alter table public.sizing_charts
  drop constraint if exists sizing_charts_variant_gender_check;

alter table public.sizing_charts
  drop column if exists variant_gender;

comment on column public.sizing_charts.audience is
  'Who the source table is for, read off the brand''s own guide page rather than inferred from a '
  'product. The row''s only gender/audience signal as of 20260922030000, which dropped the '
  'redundant variant_gender column -- see that migration for why. Kept in sync with the Audience '
  'union in lib/sizing/keys.ts.';
