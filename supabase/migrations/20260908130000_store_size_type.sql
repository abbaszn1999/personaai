-- Doc Part 2: the sizing system the merchant's own catalog labels are written in, declared once for
-- the store with per-brand exceptions.
--
-- A declaration, not a conversion instruction. The previous design generated US, UK and EU charts
-- for every brand simultaneously, which meant inventing two thirds of each chart from conversion
-- tables the brands themselves do not agree with, and then filtering shoppers on the invented part.
-- The merchant says which system their labels are in, and only that column of a guide is matched.
--
-- This becomes the fourth component of the resolved chart id in Phase 9 (`nike_tops_men_alpha`), so
-- two merchants carrying the same brand in different label systems resolve to different charts
-- instead of quietly sharing one.

alter table public.store_connections
  add column if not exists store_size_type text not null default 'Alpha',
  add column if not exists store_size_type_overrides jsonb not null default '{}'::jsonb;

alter table public.store_connections
  drop constraint if exists store_connections_store_size_type_check;

alter table public.store_connections
  add constraint store_connections_store_size_type_check
  check (store_size_type in ('US', 'UK', 'EU', 'Alpha', 'Numeric'));

comment on column public.store_connections.store_size_type is
  'Doc Part 2. The sizing system this catalog''s size labels are written in: US, UK, EU, Alpha or '
  'Numeric. Defaults to Alpha rather than a region because S/M/L is the one option that is not a '
  'claim about where the store is — guessing EU from a .gr domain would be a regional assertion '
  'nobody made, and a wrong one silently matches the wrong column of every chart.';

comment on column public.store_connections.store_size_type_overrides is
  'Doc Part 2. Object keyed by normalized brand key whose value is one of the same five systems, for '
  'the brands whose labels differ from the store default. Keyed on the brand key rather than the '
  'display name, matching `sizing_coverage` and `sizing_charts`, so casing or punctuation in the '
  'catalog cannot orphan an override. A brand absent here uses `store_size_type`.';
