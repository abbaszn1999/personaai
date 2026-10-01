-- Conversion logging for the three chat agents: which agent, action, search and look produced
-- an assistant turn, and — copied onto the cart add — which one surfaced the product added.
-- Shape: { agent, action, path, query, lookIds, lookId? }. Null for rows written before this.
alter table public.chat_events add column if not exists attribution jsonb;
alter table public.cart_events add column if not exists attribution jsonb;
