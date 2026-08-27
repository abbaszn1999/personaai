-- ─── Gemini API key (BYO-API for the conversational chat agents) ──────────────
-- Supersedes openai_api_key_encrypted from 0006. The chat agents now run on
-- Gemini, so a stored OpenAI key is dead weight — and an unused secret sitting in
-- the database is a liability rather than a fallback. It is dropped rather than
-- copied across, because the ciphertext holds an sk-... key that would only fail
-- against Gemini; existing accounts re-enter a Gemini key in Account Settings.
--
-- Same handling as before: encrypted in the app layer (AES-256-GCM) before it
-- ever reaches the database, so this column only ever holds ciphertext. The raw
-- key is never sent back to the browser — the API returns a masked preview only.
alter table public.users add column gemini_api_key_encrypted text;

alter table public.users drop column openai_api_key_encrypted;
