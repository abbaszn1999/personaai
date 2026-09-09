import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import type { SizingNullRecordRow } from "@/lib/db/sizing-null-records";
import { UNKNOWN_BRAND_KEY } from "./keys";
import { labelFor } from "./summary";

/**
 * Tabs 2 and 3 of Documentation/persona_sizing.md.
 *
 * Tab 2's output is three lists; Tab 3 is "no agent — pure deterministic logic" that routes each
 * list to its next step. Both live here because the routing rule is only meaningful against the
 * lists it routes, and splitting them across modules is how the two drift apart.
 */

/** Tab 2's output, in the doc's exact shape.
 *
 *  Global and private brands are unique names — a brand needs one chart however many SKUs carry it.
 *  Only nulls are row-level, because there is no brand name to group them by. */
export interface BrandIdentification {
  global_brands: string[];
  private_brands: string[];
  null_records: string[];
}

/** Where one list goes next, with the work it represents attached so the merchant sees the cost
 *  rather than just the destination. */
export interface RoutingDestination {
  /** Unique brand names routed here. Empty for the null group, which has no brands. */
  brands: string[];
  /** Charts this produces — one per (brand x sizing category). The real unit of work, and why a
   *  brand count alone understates it: one brand carried in five categories needs five charts. */
  charts: number;
  skuCount: number;
}

export interface NullGroup {
  sizingCategory: string;
  label: string;
  /** Products listed individually under this category. */
  productCount: number;
}

export interface RoutingPlan {
  /** Tab 4. Only global brands ever reach the web search agent — private labels and unbranded rows
   *  have nothing findable, so searching them would spend a request to return nothing. */
  webSearch: RoutingDestination;
  /** Private brands, straight to manual fill: no public chart exists to find. */
  manualFillBrands: RoutingDestination;
  /** Unbranded rows, to manual fill grouped by category instead of by brand. */
  manualFillNulls: RoutingDestination & { groups: NullGroup[] };
  /** Brands the classifier has not reached or could not call. Not a destination — routing is
   *  deterministic, so an unclassified brand is not yet routable and is shown as outstanding rather
   *  than defaulted into a queue where a wrong guess costs either money or the merchant's time. */
  unclassified: RoutingDestination;
}

/** Builds Tab 2's three lists from stored coverage and null records. */
export function buildIdentification(
  coverage: SizingCoverageRow[],
  nullRecords: SizingNullRecordRow[]
): BrandIdentification {
  const global = new Set<string>();
  const priv = new Set<string>();

  for (const row of coverage) {
    if (row.brandKey === UNKNOWN_BRAND_KEY || !row.brandName) continue;
    if (row.brandType === "global") global.add(row.brandName);
    else if (row.brandType === "private") priv.add(row.brandName);
  }

  return {
    global_brands: [...global].sort((a, b) => a.localeCompare(b)),
    private_brands: [...priv].sort((a, b) => a.localeCompare(b)),
    // The doc lists SKUs. Falling back to the platform id keeps a product that carries no SKU
    // identifiable in the store admin rather than dropping it out of its own gap list.
    null_records: nullRecords.map((record) => record.sku ?? record.externalId),
  };
}

/** Tab 3. Pure function of the stored `brand_type` — no model, no heuristics. */
export function buildRouting(coverage: SizingCoverageRow[], nullRecords: SizingNullRecordRow[]): RoutingPlan {
  const destination = (): RoutingDestination & { brandSet: Set<string> } => ({
    brands: [],
    charts: 0,
    skuCount: 0,
    brandSet: new Set(),
  });

  const webSearch = destination();
  const manualFillBrands = destination();
  const manualFillNulls = destination();
  const unclassified = destination();

  for (const row of coverage) {
    const isNull = row.brandKey === UNKNOWN_BRAND_KEY;
    const target = isNull
      ? manualFillNulls
      : row.brandType === "global"
        ? webSearch
        : row.brandType === "private"
          ? manualFillBrands
          : unclassified;

    target.charts += 1;
    target.skuCount += row.skuCount;
    if (!isNull && row.brandName) target.brandSet.add(row.brandName);
  }

  const groups = new Map<string, NullGroup>();
  for (const record of nullRecords) {
    let group = groups.get(record.sizingCategory);
    if (!group) {
      group = {
        sizingCategory: record.sizingCategory,
        label: labelFor(record.sizingCategory),
        productCount: 0,
      };
      groups.set(record.sizingCategory, group);
    }
    group.productCount += 1;
  }

  const finalize = ({ brandSet, ...rest }: RoutingDestination & { brandSet: Set<string> }): RoutingDestination => ({
    ...rest,
    brands: [...brandSet].sort((a, b) => a.localeCompare(b)),
  });

  return {
    webSearch: finalize(webSearch),
    manualFillBrands: finalize(manualFillBrands),
    manualFillNulls: {
      ...finalize(manualFillNulls),
      groups: [...groups.values()].sort((a, b) => b.productCount - a.productCount),
    },
    unclassified: finalize(unclassified),
  };
}
