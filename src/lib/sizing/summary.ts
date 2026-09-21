import type { BrandType, SizingCoverageRow } from "@/lib/db/sizing-coverage";
import { isSizingCategory, UNKNOWN_BRAND_KEY } from "./keys";
import { isSizingGroup, measurementsFor, SIZING_GROUP_LABELS } from "./measurements";

/**
 * Rolls a store's coverage rows up into what the merchant-facing pipeline shows.
 *
 * Coverage is stored per (brand x sizing category) because that is the grain research and resolution
 * work at. The brand list a merchant reads is per *brand*, so this is where the two views are
 * reconciled — in one place on the server, rather than each stage component re-deriving totals and
 * quietly disagreeing about them.
 */

export interface CoverageBrand {
  /** Unique across the whole list. A real brand's normalized key, or — for the unbranded sentinel,
   *  which has no brand name to key on — that sentinel joined with the one sizing category this
   *  entry represents, so each unbranded category gets its own addressable row instead of one row
   *  key colliding across all of them. */
  brandKey: string;
  /** The brand as the merchant writes it. Null only for the unbranded sentinel. */
  name: string | null;
  brandType: BrandType;
  skuCount: number;
  /** Percentage of scanned, sized stock. Rounded to one decimal for display. */
  share: number;
  /** Audience-scoped sizing categories this brand is carried in, e.g. `mens_tops`. Each one becomes
   *  one size chart, which is what makes this the real unit of research cost. Always exactly one
   *  entry for the unbranded sentinel — see `storeCategoryPaths` for why it isn't merged further. */
  sizingCategories: string[];
  /** Distinct raw size strings across this brand's rows — what the Phase 6 mapping call will cost. */
  rawFormatCount: number;
  /** The merchant's own category paths behind this row, root-first. Empty for real brands — a
   *  named brand is identified by its name, not by where it's shelved. Populated only for the
   *  unbranded sentinel, where the path is the only thing that tells two rows apart: "30 unbranded
   *  SKUs under Women > Footwear > Shoes" and "5 under Women > Dresses" both have `name: null` and
   *  would otherwise render as one indistinguishable "No brand detected" line. */
  storeCategoryPaths: string[][];
}

export interface CoverageCategory {
  key: string;
  /** e.g. `Men's tops`. Derived, never stored: the key is the stable identifier. */
  label: string;
  skuCount: number;
  brandCount: number;
  /** Body measurements a chart for this category needs, so the UI can say what it will ask for. */
  measurements: string[];
}

export interface CoverageSummary {
  /** Sized stock the scan counted. Excludes products with no chart to research (bags, scarves). */
  totalSkus: number;
  /** Coverage rows — the number of charts this store needs in total. */
  chartsNeeded: number;
  brands: CoverageBrand[];
  categories: CoverageCategory[];
  counts: Record<BrandType, number>;
}

export function summarizeCoverage(rows: SizingCoverageRow[]): CoverageSummary {
  const brands = new Map<
    string,
    CoverageBrand & { formats: Set<string>; categorySet: Set<string>; pathKeys: Set<string> }
  >();
  const categories = new Map<string, CoverageCategory & { brandSet: Set<string> }>();
  let totalSkus = 0;

  for (const row of rows) {
    totalSkus += row.skuCount;

    const isUnbranded = row.brandKey === UNKNOWN_BRAND_KEY;
    // A coverage row is already unique per (brand key, sizing category) — one chart's worth of
    // work. Real brands still roll up to one row per brand name, but the unbranded sentinel has no
    // name to roll up under, so keying it on the category too is what keeps "30 unbranded shoes"
    // and "5 unbranded dresses" from merging into one line that hides which category is which.
    const brandMapKey = isUnbranded ? `${UNKNOWN_BRAND_KEY}::${row.sizingCategory}` : row.brandKey;

    let brand = brands.get(brandMapKey);
    if (!brand) {
      brand = {
        brandKey: brandMapKey,
        name: isUnbranded ? null : row.brandName,
        brandType: row.brandType,
        skuCount: 0,
        share: 0,
        sizingCategories: [],
        rawFormatCount: 0,
        storeCategoryPaths: [],
        formats: new Set(),
        categorySet: new Set(),
        pathKeys: new Set(),
      };
      brands.set(brandMapKey, brand);
    }
    brand.skuCount += row.skuCount;
    brand.categorySet.add(row.sizingCategory);
    for (const raw of Object.keys(row.rawFormats)) brand.formats.add(raw);
    if (isUnbranded) {
      for (const path of row.storeCategoryPaths) {
        const key = path.join("::");
        if (brand.pathKeys.has(key)) continue;
        brand.pathKeys.add(key);
        brand.storeCategoryPaths.push(path);
      }
    }

    let category = categories.get(row.sizingCategory);
    if (!category) {
      const group = isSizingCategory(row.sizingCategory) ? row.sizingCategory : null;
      category = {
        key: row.sizingCategory,
        label: labelFor(row.sizingCategory),
        skuCount: 0,
        brandCount: 0,
        measurements: group ? [...measurementsFor(group)] : [],
        brandSet: new Set(),
      };
      categories.set(row.sizingCategory, category);
    }
    category.skuCount += row.skuCount;
    category.brandSet.add(row.brandKey);
  }

  const counts: Record<BrandType, number> = { unclassified: 0, global: 0, private: 0, none: 0 };

  const brandList = [...brands.values()]
    .map((brand) => {
      counts[brand.brandType] += 1;
      return {
        brandKey: brand.brandKey,
        name: brand.name,
        brandType: brand.brandType,
        skuCount: brand.skuCount,
        share: totalSkus > 0 ? Math.round((brand.skuCount / totalSkus) * 1000) / 10 : 0,
        sizingCategories: [...brand.categorySet].sort(),
        rawFormatCount: brand.formats.size,
        storeCategoryPaths: brand.storeCategoryPaths,
      };
    })
    .sort(
      (a, b) =>
        b.skuCount - a.skuCount ||
        (a.name ?? labelFor(a.sizingCategories[0] ?? "")).localeCompare(b.name ?? labelFor(b.sizingCategories[0] ?? ""))
    );

  const categoryList = [...categories.values()]
    .map(({ brandSet, ...category }) => ({ ...category, brandCount: brandSet.size }))
    .sort((a, b) => b.skuCount - a.skuCount || a.key.localeCompare(b.key));

  return { totalSkus, chartsNeeded: rows.length, brands: brandList, categories: categoryList, counts };
}

/**
 * Human form of a sizing key.
 *
 * Delegates to `SIZING_GROUP_LABELS` rather than keeping a list. It used to keep its own, and the
 * two drifted the moment the vocabulary collapsed to five: this map still carried hats, belts and
 * watches, and it rendered `dresses` as "Dresses" while the Categories tab called the same key
 * "Dresses / Full-body". A merchant mapping a path and then checking a SKU saw two different names
 * for one decision, which is precisely the ambiguity the labels exist to remove.
 *
 * Falls back to the raw key rather than inventing a label, so a value this build no longer
 * recognises is visibly odd instead of silently rendering as something plausible.
 */
export function labelFor(sizingCategory: string): string {
  return isSizingGroup(sizingCategory) ? SIZING_GROUP_LABELS[sizingCategory] : sizingCategory;
}
