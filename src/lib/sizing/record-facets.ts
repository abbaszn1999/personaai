/**
 * Folds the `sizing_product_facets` rows into the shapes the Stage 2 filters and the Stage 4 source
 * lists read. Pure so both callers, and the tests, share one definition of what a count means.
 *
 * A product in two collections yields two rows, one per collection. Counts here are therefore
 * "products in that collection", which is exact per collection but must never be summed across
 * collections to get a total; totals come from coverage and the leaf-count view.
 */

import type { ResolvedPersonaPath } from "@/lib/catalog/persona-mapping";

/**
 * Every store collection a product sits in that is mapped to its primary Persona subcategory.
 *
 * A list rather than the primary path's single collection: one product can sit in "women t-shirt
 * s26" and "women basic offers" at once, both mapped to the same subcategory, and the merchant
 * wants to find it in either.
 */
export function leafSourceCategoryIds(
  personaPaths: Array<Pick<ResolvedPersonaPath, "key" | "sourceCategoryId">>,
  primaryLeafKey: string | null,
): string[] {
  if (!primaryLeafKey) return [];
  const ids = new Set<string>();
  for (const path of personaPaths) {
    if (path.key === primaryLeafKey && path.sourceCategoryId) ids.add(path.sourceCategoryId);
  }
  return [...ids];
}

export interface SizingFacetRow {
  brandKey: string;
  /** The brand as the store spells it. Null for records written before labels were saved. */
  brandLabel: string | null;
  leafKey: string | null;
  sizingCategory: string;
  /** One store collection the product sits in under its subcategory; null when none was saved. */
  sourceCategoryId: string | null;
  count: number;
}

export interface FacetCount {
  key: string;
  count: number;
}

export interface BrandLeafSource {
  categoryId: string;
  /** Products of this brand in this collection, under this subcategory. */
  count: number;
  /** Every spelling of the brand present there; a storefront filter needs the store's own. */
  labels: string[];
}

/** `brandKey` then `leafKey` to the collections holding that brand's items there. */
export type BrandLeafSources = Record<string, Record<string, BrandLeafSource[]>>;

/**
 * True once any record carries a saved collection. Records from before the column existed have none,
 * which is how the UI knows to ask for a rescan instead of showing an empty collection list.
 */
export function facetsHaveSources(rows: SizingFacetRow[]): boolean {
  return rows.some((row) => row.sourceCategoryId !== null);
}

/** Products per collection id, for the Collection filter's counts. */
export function sourceCountsFromFacets(rows: SizingFacetRow[]): FacetCount[] {
  const perSource = new Map<string, number>();
  for (const row of rows) {
    if (row.sourceCategoryId) perSource.set(row.sourceCategoryId, (perSource.get(row.sourceCategoryId) ?? 0) + row.count);
  }
  return [...perSource].map(([key, count]) => ({ key, count }));
}

/**
 * The collections that hold each brand's items under each subcategory, busiest first.
 *
 * This is the data behind Stage 4's View items: for MOUSTACHE Men under Women > Tops it names the
 * collections that actually contain a MOUSTACHE Men top, not every collection mapped to the
 * subcategory.
 */
export function brandLeafSourcesFromFacets(rows: SizingFacetRow[]): BrandLeafSources {
  const grouped = new Map<string, Map<string, Map<string, { count: number; labels: Set<string> }>>>();
  for (const row of rows) {
    if (!row.leafKey || !row.sourceCategoryId) continue;
    const byLeaf = grouped.get(row.brandKey) ?? new Map<string, Map<string, { count: number; labels: Set<string> }>>();
    const bySource = byLeaf.get(row.leafKey) ?? new Map<string, { count: number; labels: Set<string> }>();
    const entry = bySource.get(row.sourceCategoryId) ?? { count: 0, labels: new Set<string>() };
    entry.count += row.count;
    if (row.brandLabel) entry.labels.add(row.brandLabel);
    bySource.set(row.sourceCategoryId, entry);
    byLeaf.set(row.leafKey, bySource);
    grouped.set(row.brandKey, byLeaf);
  }

  const result: BrandLeafSources = {};
  for (const [brandKey, byLeaf] of grouped) {
    result[brandKey] = {};
    for (const [leafKey, bySource] of byLeaf) {
      result[brandKey][leafKey] = [...bySource]
        .map(([categoryId, entry]) => ({
          categoryId,
          count: entry.count,
          labels: [...entry.labels].sort(),
        }))
        .sort((a, b) => b.count - a.count || a.categoryId.localeCompare(b.categoryId));
    }
  }
  return result;
}
