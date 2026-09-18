-- AI Auto-Match is a one-time action per mapping configuration: once it has successfully run
-- and saved verdicts, the merchant must clear their mapping (or fix categories manually) rather
-- than re-run it, so a re-run can never silently overwrite a merchant's own manual corrections.

alter table public.store_connections
  add column if not exists persona_auto_match_completed_at timestamptz;

comment on column public.store_connections.persona_auto_match_completed_at is
  'When AI Auto-Match last successfully classified and saved this store''s categories. Null means it has never run (or the mapping was cleared since); non-null blocks further Auto-Match runs until a clear.';
