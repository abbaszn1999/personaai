import type { StoreCategory, StorePlatform } from "@/modules/store/types";
import { storeCategoryTrail } from "@/lib/catalog/persona-mapping";
import {
  storefrontBrandFilterUrl,
  storefrontCategoryUrl,
  type BrandFilterSource,
  type WooBrandTerm,
} from "@/lib/catalog/storefront-links";
import type { FilterSupport } from "@/lib/catalog/storefront-filter-probe";
import { brandLeafSourcesFromFacets, type SizingFacetRow } from "./record-facets";

/**
 * How a brand source link relates to the brand it came from.
 *
 * - `filtered`: the storefront will show only this brand's items.
 * - `whole-collection`: the store's filter for it is switched off, so the link opens the full collection.
 * - `unchecked`: a filter was added but the storefront could not be read to confirm it applies.
 * - `not-filterable`: the brand is read from something a URL cannot filter, so this is the plain collection.
 */
export type BrandSourceStatus = "filtered" | "whole-collection" | "unchecked" | "not-filterable";

export interface BrandSourceLink {
  categoryId: string;
  name: string;
  trail: string[];
  /** This brand's items in this collection under this subcategory. */
  count: number;
  url: string | null;
  status: BrandSourceStatus;
  /** Every spelling of the brand in this collection, as the store writes it. */
  labels: string[];
  /** Shopify only: the store's all-products-by-vendor page, which works without a theme filter. */
  vendorPageUrl: string | null;
}

/** Chart brand key, then Persona leaf key, to the collections that hold that brand's items there. */
export type BrandLeafSourceLinks = Record<string, Record<string, BrandSourceLink[]>>;

/**
 * One list across several subcategories, for a chart that covers more than one: a collection holding
 * items under two of its leaves appears once with the counts added. Busiest first.
 */
export function mergeBrandSourceLinks(lists: ReadonlyArray<readonly BrandSourceLink[] | undefined>): BrandSourceLink[] {
  const merged = new Map<string, BrandSourceLink>();
  for (const list of lists) {
    for (const link of list ?? []) {
      const existing = merged.get(link.categoryId);
      if (existing) {
        existing.count += link.count;
        existing.labels = [...new Set([...existing.labels, ...link.labels])];
      } else {
        merged.set(link.categoryId, { ...link, labels: [...link.labels] });
      }
    }
  }
  return [...merged.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function statusFor(platform: StorePlatform, filtered: boolean, support: FilterSupport | null): BrandSourceStatus {
  if (!filtered) return "not-filterable";
  if (platform !== "shopify") return "filtered";
  if (support === "supported") return "filtered";
  if (support === "unsupported") return "whole-collection";
  return "unchecked";
}

/**
 * The collections holding each chart brand's items under each subcategory, as storefront links.
 *
 * `resolveBrandKey` folds a raw brand key into the key its chart uses, so a canonical brand made of
 * several spellings lists every collection any of them sits in and filters on all of those spellings.
 * Collections no longer in the store's category list are dropped; a link to nothing helps nobody.
 */
export function brandLeafSourceLinks(input: {
  facetRows: readonly SizingFacetRow[];
  resolveBrandKey: (rawBrandKey: string) => string;
  categories: readonly StoreCategory[];
  platform: StorePlatform;
  storeUrl: string;
  source: BrandFilterSource;
  wooBrands?: readonly WooBrandTerm[];
  /** Whether a Shopify theme applies the filter; null where that does not apply. */
  support: FilterSupport | null;
}): BrandLeafSourceLinks {
  const byId = new Map(input.categories.map((category) => [category.id, category]));
  const folded = input.facetRows.map((row) => ({ ...row, brandKey: input.resolveBrandKey(row.brandKey) }));
  const grouped = brandLeafSourcesFromFacets(folded);

  const result: BrandLeafSourceLinks = {};
  for (const [brandKey, byLeaf] of Object.entries(grouped)) {
    for (const [leafKey, sources] of Object.entries(byLeaf)) {
      const links: BrandSourceLink[] = [];
      for (const entry of sources) {
        const category = byId.get(entry.categoryId);
        if (!category) continue;
        const link = storefrontBrandFilterUrl({
          platform: input.platform,
          storeUrl: input.storeUrl,
          category,
          source: input.source,
          labels: entry.labels,
          wooBrands: input.wooBrands,
        });
        const status = statusFor(input.platform, link.filtered, input.support);
        links.push({
          categoryId: entry.categoryId,
          name: category.name,
          trail: storeCategoryTrail(entry.categoryId, input.categories),
          count: entry.count,
          // A switched-off Shopify filter would be ignored anyway; the plain link is cleaner than one
          // carrying a parameter that does nothing.
          url:
            status === "whole-collection"
              ? storefrontCategoryUrl(input.platform, input.storeUrl, category)
              : link.url,
          status,
          labels: entry.labels,
          vendorPageUrl: link.vendorPageUrl,
        });
      }
      if (links.length === 0) continue;
      (result[brandKey] ??= {})[leafKey] = links;
    }
  }
  return result;
}
