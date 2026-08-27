import type { CatalogFilter } from "@/lib/retrieval/types";
import { buildAcsProductId, escapeFilterLiteral } from "./isolation";

/**
 * Translates this app's `CatalogFilter` into an ACS filter string expression — the `extraFilter`
 * half of `searchProducts`, ANDed alongside the mandatory merchant/scope clauses a level up.
 *
 * Syntax confirmed against the official filter-and-order reference: `field: ANY("a","b")` for
 * text fields (OR-of-equals), `field: IN(lower,upper)` or a comparison operator for numerics, and
 * `NOT` for negation. There is no partial/substring match on `categories` or `productId` — both
 * require an exact stored value, which is why the mapper stores every ancestor prefix of a
 * category path (see map-product.ts) and why exclusion is done by id rather than any fuzzier
 * match.
 */
export function buildAcsFilterExpression(filter: CatalogFilter, connectionId: string): string | undefined {
  const clauses: string[] = [];

  // subcategory takes precedence when both are set — same "most specific wins" behaviour as the
  // pgvector RPCs, since a product can be exact-matched on its own subcategory string alone.
  const categoryTerm = filter.subcategory ?? filter.category;
  if (categoryTerm) {
    clauses.push(`(categories: ANY("${escapeFilterLiteral(categoryTerm)}"))`);
  }

  if (filter.brand) {
    clauses.push(`(brands: ANY("${escapeFilterLiteral(filter.brand)}"))`);
  }

  if (filter.priceMin !== undefined || filter.priceMax !== undefined) {
    const lower = filter.priceMin !== undefined ? `${filter.priceMin}i` : "*";
    const upper = filter.priceMax !== undefined ? `${filter.priceMax}i` : "*";
    clauses.push(`(price: IN(${lower}, ${upper}))`);
  }

  if (filter.inStockOnly) {
    clauses.push(`(availability: ANY("IN_STOCK"))`);
  }

  if (filter.excludeExternalIds?.length) {
    // `productId` is the ACS resource id, not the merchant's own externalId — namespaced with
    // the connection id exactly like the mapper does, or every exclusion would silently match
    // nothing. Negated per-id rather than a single NOT over an ANY(...) list, matching the
    // documented negation form (`NOT categories: ANY(...)`) rather than assuming NOT distributes.
    for (const id of filter.excludeExternalIds) {
      clauses.push(`(NOT productId: ANY("${escapeFilterLiteral(buildAcsProductId(connectionId, id))}"))`);
    }
  }

  if (filter.garmentCategory) {
    clauses.push(`(attributes.garment_category: ANY("${escapeFilterLiteral(filter.garmentCategory)}"))`);
  }
  if (filter.garmentSubcategory) {
    clauses.push(`(attributes.garment_subcategory: ANY("${escapeFilterLiteral(filter.garmentSubcategory)}"))`);
  }

  return clauses.length > 0 ? clauses.join(" AND ") : undefined;
}
