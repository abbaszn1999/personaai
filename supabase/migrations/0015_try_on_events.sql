-- ─── Persona-attributed try-on events ───────────────────────────────────────
-- One row per garment included in a virtual try-on render the widget itself generated
-- (button-triggered or agent chat-triggered) — logged client-side right after the recommended
-- size for that garment is computed (see recommendSizesForProducts / tools/try-on.ts), so this
-- captures exactly what the shopper saw, never a guess. Powers the "Virtual Try-On Insights"
-- card (most tried-on products, top recommended sizes, avg try-ons per session).
create table public.try_on_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id text not null,
  -- Shared by every garment row logged from the same try-on render, so "avg try-ons per
  -- session" can count distinct renders rather than distinct garments.
  generation_id uuid not null,
  product_id text not null,
  product_name text not null,
  recommended_size text not null,
  created_at timestamptz not null default now()
);

create index try_on_events_workspace_created_idx on public.try_on_events(workspace_id, created_at);

alter table public.try_on_events enable row level security;
