-- Kids departments (boys, girls, unisex kids) are asked for an age at onboarding instead of chest
-- and waist. Whole years; 0 means under one year old. Null for adult profiles. Additive and
-- nullable, so existing profiles and older widget builds are unaffected.
alter table public.shopper_profiles
  add column if not exists age_years smallint
  check (age_years is null or (age_years >= 0 and age_years <= 17));
