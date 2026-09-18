-- Persona Mapping is now the only category source of truth.
-- Internal store category ids are derived from persona_category_map when a catalog walk needs them.

alter table public.store_connections
  drop column if exists selected_category_ids,
  drop column if exists category_selection_granularity,
  drop column if exists category_parent_map,
  drop column if exists category_tree;
