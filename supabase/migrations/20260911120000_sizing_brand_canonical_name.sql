-- ─── The brand's real name, as opposed to the string the store files it under ──
-- Classification asks a model whether a brand is global, and stores only the verdict. What the model
-- had to work out to answer — *which company this is* — was thrown away, and Phase 4 then went to the
-- web with the merchant's raw string instead.
--
-- On one live catalog that string was "CLAUDIE" for Claudie Pierlot (the store's brand field is
-- truncated; the product descriptions say "Claudie Pierlot logo") and "On Cloud" for On, whose
-- products here are the Cloudleap and Cloud Sky models. Both are correctly `global`, and both were
-- about to be researched under a name that cannot find a size guide — a paid search per brand that
-- could only come back empty, followed by a merchant being asked to hand-fill a chart that is
-- published on a public website.
--
-- Nullable, and only ever set for `global`: a house label has no canonical name to resolve to, and an
-- absent value means "search under `brand_name`", which is the previous behaviour. `brand_key` is
-- deliberately still derived from the store's string, because that is what joins coverage to the
-- products the merchant is looking at — renaming the key would orphan the charts already researched
-- under it.
--
-- Carried across a re-scan alongside `brand_type`, for the same reason: it is the output of a
-- classification that has already been paid for, and re-reading the catalog does not change which
-- company a brand is.
alter table public.sizing_coverage
  add column if not exists brand_canonical_name text;

comment on column public.sizing_coverage.brand_canonical_name is
  'The established brand this row''s brand_name refers to, as the classifier identified it — "Claudie Pierlot" for a store filing it as "CLAUDIE". Phase 4 searches under this when set, and under brand_name when not. Null for private and unbranded rows, which have no canonical name. Survives a re-scan like brand_type.';
