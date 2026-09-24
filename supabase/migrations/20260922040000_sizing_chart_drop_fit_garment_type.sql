-- `variant_fit_type` and `variant_garment_type` were split apart in `20260922010000` on a real
-- distinction — whose body a block was cut for versus what the garment itself is — but both were
-- already fully restated in `variant_name` by the naming rule research and every seed have followed
-- since `20260908140000`: "put both in the name... so the two stay distinguishable", because two
-- variants in one sizing_category can never share a name. That rule was never optional; a name
-- collision silently overwrites one chart with the other on write. So every fit or garment word that
-- ever reached either column was already sitting in `variant_name` too, confirmed against the live
-- table and every seed before this migration was written.
--
-- Both columns are dropped rather than kept as decoration for two different reasons:
--   - `variant_garment_type` is read nowhere. Its one real job — deciding which of a brand's several
    10|--     tables for one sizing_category a leaf belongs to — moved onto `covers_leaves` entirely in
--     `20260922020000`. What was left was one caption fragment in Stage 5 (`, Tailored`, `, Denim`)
--     that already duplicates the variant name shown one line above it.
--   - `variant_fit_type` still feeds a real guard — `variantTags` -> `withoutFitClass` in
--     `variant-match.ts`, which stops a fit-only table like `Men Tailored Long` from being
--     auto-picked over the plain `Men Tailored`. But the naming rule above means `variant_name` alone
--     already carries every fit word `variant_fit_type` ever did, so the guard loses nothing reading
--     the name by itself — see the code change accompanying this migration.

alter table public.sizing_charts
  drop column if exists variant_fit_type,
  drop column if exists variant_garment_type;
