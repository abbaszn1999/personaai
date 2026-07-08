-- ─── OpenAI API key (BYO-API for the conversational chat agent) ───────────────
-- The client's OpenAI key is encrypted in the app layer (AES-256-GCM) before it
-- ever reaches the database — this column only ever holds ciphertext, never a
-- plaintext key. The raw key is also never sent back to the browser after the
-- initial save; the API only returns a masked preview (e.g. "sk-...ab12").
alter table public.users add column openai_api_key_encrypted text;
