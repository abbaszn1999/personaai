alter table public.sizing_product_records
  add column raw_size_format text;

comment on column public.sizing_product_records.raw_size_format is
  'Deduplicated merchant size labels captured during the sizing scan. Used to resolve this product against its covered chart without re-reading the commerce platform.';
