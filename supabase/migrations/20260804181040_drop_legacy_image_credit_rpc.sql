-- Mirrors the remote cleanup migration. The allowance-aware RPC supersedes this legacy entry.
drop function if exists public.consume_image_credit(uuid, varchar);
