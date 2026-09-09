-- Doc Parts 5 and 6: a brand does not have one chart per parent category. It has however many
-- variants it actually publishes, and research discovers them rather than fitting them to a list.
--
--   Tom Ford  └─ Outerwear  ├─ Men          Brand X  └─ Bottoms  ├─ Men Regular
--                           └─ Women                             ├─ Men Tall
--                                                                ├─ Women Regular
--                                                                └─ Women Petite
--
-- So chart identity becomes (brand_key, sizing_category, variant_name). It was
-- (brand_key, sizing_category, audience, source_title), which addressed the same need by accident:
-- `source_title` is the verbatim heading of the table a chart was transcribed from, which is
-- provenance, not identity. Two headings can name one variant and one heading can be reused across
-- parents, so the old key both split variants apart and, for a guide that repeats a heading,
-- collided them.
--
-- `audience` is demoted from identity to a hint. It stays on the row and stays populated — Phase 5's
-- auto-match reads it to propose a variant for `Men > Blazers` — but it no longer distinguishes two
-- rows, because `variant_name` already carries the gender when the brand puts it there.
--
-- `sizing_category` keeps its name even though it now holds one of the five parents and the plan
-- calls the concept `parent_category`. Renaming it here and not on `sizing_coverage`, which holds
-- the same five values, would buy accuracy in one table at the cost of two names for one vocabulary.

alter table public.sizing_charts
  add column if not exists variant_name text not null default '',
  add column if not exists variant_gender text,
  add column if not exists variant_fit_type text;

-- Nullable rather than defaulted: a guide that never says which gender a chart is for is a fact
-- worth keeping, and defaulting it to 'unisex' would present a guess as something the page said.
alter table public.sizing_charts
  drop constraint if exists sizing_charts_variant_gender_check;

alter table public.sizing_charts
  add constraint sizing_charts_variant_gender_check
  check (variant_gender is null or variant_gender in ('mens', 'womens', 'boys', 'girls', 'kids', 'unisex'));

-- A variant must be named. The default above exists only so the ALTER can add a NOT NULL column;
-- an empty name would make two of a brand's variants collide under the new key.
alter table public.sizing_charts
  drop constraint if exists sizing_charts_variant_name_check;

alter table public.sizing_charts
  add constraint sizing_charts_variant_name_check
  check (length(trim(variant_name)) > 0);

drop index if exists sizing_charts_global_idx;
drop index if exists sizing_charts_scoped_idx;

-- Still two partial indexes rather than one over a nullable column: Postgres treats NULLs as
-- distinct, so a single index would let a global brand's chart be written twice.
create unique index sizing_charts_global_idx
  on public.sizing_charts (brand_key, sizing_category, variant_name)
  where connection_id is null;

create unique index sizing_charts_scoped_idx
  on public.sizing_charts (connection_id, brand_key, sizing_category, variant_name)
  where connection_id is not null;

comment on column public.sizing_charts.variant_name is
  'Doc Part 5. The chart line this row is, verbatim from the brand''s own guide: Men, Men Tall, '
  'Women Petite, Unisex. Free-form by design — the doc is explicit that we do not maintain a fixed '
  'universal list every brand must satisfy. Part of the row''s identity.';

comment on column public.sizing_charts.variant_gender is
  'The gender component of `variant_name`, split out for Phase 5 auto-match so `Men > Blazers` can '
  'propose the men''s variant. Null when the guide does not say.';

comment on column public.sizing_charts.variant_fit_type is
  'The fit component of `variant_name` — Regular, Tall, Petite, Slim. Null when the brand publishes '
  'only one fit line for this parent.';

comment on column public.sizing_charts.audience is
  'Demoted from identity to a Phase 5 auto-match hint in 20260908140000. Still read off the source '
  'page, but `variant_name` is what distinguishes two of a brand''s charts.';

comment on column public.sizing_charts.source_title is
  'Provenance, not identity: the verbatim heading of the table this chart was transcribed from, kept '
  'so a merchant can trace a variant back to the page it came from.';
