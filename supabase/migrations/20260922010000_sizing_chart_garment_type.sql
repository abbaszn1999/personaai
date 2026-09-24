-- `variant_fit_type` was documented as fit-only ("Regular, Tall, Petite, Slim") in 20260908140000,
-- but real data never respected that: Tommy Hilfiger's own seeds store `Tailored`, `Denim` and
-- `Wired` in it too. Those describe what the garment IS — cut on a different block, a different
-- fabric class — not whose body it was cut for, and `variant-match.ts` already had to read the
-- column expecting both because of it (see `variantTags`'s comment on the "defect" this fixes).
--
-- Splitting them keeps `variant_fit_type` true to its own doc comment: a fit class is the thing a
-- shopper's body decides and a merchant alone may pick between (`withoutFitClass` never auto-picks
-- one), while a garment type is the thing a Persona leaf already decides (`LEAF_GARMENT_TAGS`) and
-- may be auto-matched on. Conflating the two column made the doc comment wrong, not the code that
-- reads it — `variantTags` unions both fields' patterns today because it has to.

alter table public.sizing_charts
  add column if not exists variant_garment_type text;

comment on column public.sizing_charts.variant_garment_type is
  'The garment-type component of variant_name -- Denim, Tailored, Wired -- split out from '
  'variant_fit_type in 20260922010000 because the two were being stored as one column: a fact '
  'about what the item is (cut on a different block, a different fabric class) was mixed with a '
  'fact about whose body it fits (Big & Tall, Long, Short). Null when the brand publishes only its '
  'base cut for this variant.';

-- Backfill: these three values are the only ones ever written to variant_fit_type that name a
-- garment rather than a fit -- confirmed against every seed and the live table before this migration
-- was written. Moving them clears variant_fit_type down to true fit classes plus `Regular`, which
-- names the *absence* of a fit class rather than one, matching `FitTag`'s own doc comment.
update public.sizing_charts
set variant_garment_type = variant_fit_type,
    variant_fit_type = null
where variant_fit_type in ('Tailored', 'Denim', 'Wired');

comment on column public.sizing_charts.variant_fit_type is
  'The fit component of variant_name -- Regular, Long, Short, Big & Tall, Tall, Petite, Slim, '
  'Curve, Maternity, Husky. Null when the brand publishes only one fit line for this parent. '
  'Garment-type distinctions (Denim, Tailored, Wired) live in variant_garment_type instead, as of '
  '20260922010000 -- see that migration for why the two were split.';
