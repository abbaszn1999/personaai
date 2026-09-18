-- sizing_margins was provisioned for the Size Filter tab's per-category/per-brand slack
-- (see 20260903130000_sizing_intelligence.sql), but that tab only ever wired up client-side
-- mock state (`useSizingStore`'s `filterConfigs`) — nothing in the app ever reads or writes
-- this column. Dropping it rather than leaving a column nobody touches; a future Size Filter
-- persistence pass can add it back with real wiring behind it.
alter table public.store_connections
  drop column if exists sizing_margins;
