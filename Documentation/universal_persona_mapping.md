# Universal Persona category mapping

The Store **Mapping** screen is the only category setup surface.

## Persisted contract

- `store_connections.persona_taxonomy_version` identifies the fixed taxonomy contract.
- `persona_taxonomy_scope` stores enabled departments/leaves and merchant-created extensions.
- `persona_category_map` is keyed by immutable store category ID.
- A map entry is either `mapped` to one Persona path or explicitly `excluded`.
- Store category walk scope is derived directly from mapped entries; the retired
  `selected_category_ids`, `category_selection_granularity`, `category_parent_map`, and
  `category_tree` columns have been dropped.

## Product rules

- A product receives every valid Persona path resolved from its store-category memberships.
- Duplicate Persona paths are collapsed.
- Products with no valid mapped path are excluded from ACS and sizing.
- Store category IDs, names, and breadcrumbs are never published to ACS.
- Custom Persona categories must declare one of the five sizing families.
- Sizing coverage and chart assignments use stable Persona path keys.

## Cutover behavior

Saving Mapping deactivates the connection's old ACS products. The merchant then reviews the updated
field preview (mapper version 5) and runs the final Setup index. That full index republishes only
mapped products with Persona paths. Requests attempting to write the retired Categories payload to
`PATCH /api/store-connection` receive HTTP 410.

Auto-Match sends up to 30 unmapped store categories per request to Gemini, including their store
breadcrumbs and up to five live product-title samples. Model output is constrained to the currently
enabled Persona targets, validated server-side, merged into the Mapping screen, and saved
automatically. Uncertain categories remain unmapped.
