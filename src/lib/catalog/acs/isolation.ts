/**
 * The entire tenant-isolation boundary for the shared ACS catalog.
 *
 * Catalogs have no create/delete API (confirmed against the official REST reference — see the
 * plan's "Multi-tenant isolation model" section), so every merchant's products live in one
 * catalog together. Isolation is enforced entirely here: every product the mapper produces
 * carries this attribute, and every read/write call must include the matching filter clause.
 * There is deliberately no code path that skips this — a missing clause on any call site is a
 * real cross-merchant data leak, not just a bad result.
 */
export const MERCHANT_ID_ATTRIBUTE = "merchant_id";

/** Value is the connection's own id — already unique, already the primary key, no new identifier
 *  needed. Kept as a named function rather than inlined so every write site derives it the same
 *  way. */
export function merchantAttributeValue(connectionId: string): string {
  return connectionId;
}

/**
 * The mandatory filter clause, built once and reused by every search/import/patch call site.
 * Combine with other clauses via `AND` — never issue a call that filters on anything else
 * without this clause also present.
 */
export function merchantFilterClause(connectionId: string): string {
  return `(attributes.${MERCHANT_ID_ATTRIBUTE}: ANY("${merchantAttributeValue(connectionId)}"))`;
}

/**
 * ACS product ids must be unique catalog-wide. `RawCatalogProduct.externalId` is only unique
 * *per connection* — Shopify and WooCommerce both hand out small numeric ids, so two different
 * merchants' stores can easily both have a product `123`. In a per-merchant catalog that would
 * never collide; in the shared catalog this decision requires, it would silently overwrite one
 * merchant's product with another's. Namespacing by connection id closes that gap.
 *
 * `connectionId` is always a UUID (36 chars, hyphens only), so splitting on a fixed offset is
 * lossless and needs no escaping even though `externalId` itself is untrusted.
 */
const CONNECTION_ID_LENGTH = 36;

export function buildAcsProductId(connectionId: string, externalId: string): string {
  if (connectionId.length !== CONNECTION_ID_LENGTH) {
    throw new Error(`buildAcsProductId: expected a 36-char uuid connectionId, got "${connectionId}"`);
  }
  return `${connectionId}_${externalId}`;
}

export function parseAcsProductId(acsId: string): { connectionId: string; externalId: string } {
  const connectionId = acsId.slice(0, CONNECTION_ID_LENGTH);
  const externalId = acsId.slice(CONNECTION_ID_LENGTH + 1);
  return { connectionId, externalId };
}

/** Escapes a literal for embedding in an ACS filter string — backslash and double-quote are the
 *  only two characters the filter grammar requires escaped. Exported for other filter-clause
 *  builders (see filter-expression.ts) so every call site escapes the same way. */
export function escapeFilterLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * The second half of the isolation boundary, alongside `merchantFilterClause`: without it, a
 * merchant's deselected category would only leave search once its products are marked out of
 * stock, which is indistinguishable from a genuinely sold-out item to any query that isn't
 * scoped by `inStockOnly`. Mirrors pgvector's `.overlaps(source_category_ids, scope)` — "the
 * product belongs to at least one of these ids" — via the `source_category_ids` custom attribute
 * every mapped product carries (see map-product.ts).
 *
 * Returns `null` for an empty scope, same as the pgvector reads: "nothing selected" must return
 * nothing, and an omitted filter clause would do the opposite.
 */
export function categoryScopeFilterClause(scope: readonly string[]): string | null {
  if (scope.length === 0) return null;
  const literals = scope.map((id) => `"${escapeFilterLiteral(id)}"`).join(",");
  return `(categories: ANY(${literals}))`;
}

/**
 * Namespaces a raw per-shopper id (the embed session id, or the merchant's own user id for the
 * dashboard preview) by connection, the same reason `buildAcsProductId` namespaces external ids —
 * ACS's user-event model is catalog-wide, and a shared catalog means two merchants' visitor ids
 * could otherwise coincide. Unlike `buildAcsProductId`, this never throws on the raw id's shape:
 * visitor ids come from several different sources (uuid, session token, user id) and none of
 * ACS's own constraints on `visitorId` require a fixed length.
 */
export function buildAcsVisitorId(connectionId: string, rawVisitorId: string): string {
  return `${connectionId}:${rawVisitorId}`;
}
