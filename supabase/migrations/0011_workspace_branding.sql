-- Persists what was previously unsaved local state in ws-branding-editor.tsx
-- (agent name, welcome message, colors, font, radius, position, display mode).
-- Kept as a single jsonb blob since it's read/written as one unit from a single
-- settings form and has no fields that need to be queried or indexed on their own.
alter table public.workspaces add column branding jsonb not null default '{}'::jsonb;
