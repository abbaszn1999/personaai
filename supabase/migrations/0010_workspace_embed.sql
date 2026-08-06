-- ─── Public embed token ──────────────────────────────────────────────────────
-- Identifies which workspace a shopper-facing widget.js/embed request belongs
-- to, without requiring the shopper to log in. This is a separate opaque value
-- from `id` (which is already used all over the dashboard for routing) so a
-- merchant can regenerate it — invalidating any leaked/scraped snippet — without
-- touching the workspace's internal id or anything that references it.
alter table public.workspaces add column embed_token text unique;
alter table public.workspaces add column embed_enabled boolean not null default false;

-- Backfill existing rows so every workspace has a token immediately.
update public.workspaces
set embed_token = encode(gen_random_bytes(24), 'hex')
where embed_token is null;

alter table public.workspaces alter column embed_token set not null;

create unique index workspaces_embed_token_idx on public.workspaces(embed_token);
