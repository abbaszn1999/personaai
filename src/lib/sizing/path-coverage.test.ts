import { describe, expect, it } from "vitest";
import { buildCategoryIndex } from "@/lib/catalog/category-parents";
import type { StoreCategory } from "@/modules/store/types";
import { PathCoverageAggregator, pathKey } from "./path-coverage";

/**
 * The axis `sizing_coverage` cannot express.
 *
 * Coverage knows the sizing parent, so "Tommy tops" is one row whether the store files it under
 * `Men > T-Shirts` or `Women > Tops` — and those two want different variants of the same brand's
 * chart. This aggregator adds the merchant category the product was actually sized from, as counts
 * only: no SKUs, ids or payloads, which is the constraint the whole pipeline works under.
 */
const CATEGORIES: StoreCategory[] = [
  { id: "1", name: "Men", parentId: null, productCount: 100 },
  { id: "2", name: "T-Shirts", parentId: "1", productCount: 40 },
  { id: "3", name: "Women", parentId: null, productCount: 100 },
  { id: "4", name: "Tops", parentId: "3", productCount: 60 },
];

function aggregator() {
  return new PathCoverageAggregator(CATEGORIES, buildCategoryIndex(CATEGORIES));
}

describe("PathCoverageAggregator", () => {
  it("counts one row per brand, category and parent", () => {
    const paths = aggregator();
    paths.add({ brand: "Tommy Hilfiger", sizingGroup: "tops", sizingCategoryId: "2" });
    paths.add({ brand: "tommy hilfiger ", sizingGroup: "tops", sizingCategoryId: "2" });
    paths.add({ brand: "Tommy Hilfiger", sizingGroup: "tops", sizingCategoryId: "4" });

    const rows = paths.result();
    expect(rows).toHaveLength(2);
    // Folded on the brand *key*, so a store's inconsistent casing and trailing spaces are one brand.
    expect(rows[0]).toMatchObject({ brandKey: "tommy_hilfiger", categoryId: "2", skuCount: 2 });
    expect(rows[1]).toMatchObject({ categoryId: "4", skuCount: 1 });
  });

  it("merges alias paths under the confirmed canonical brand key", () => {
    const paths = aggregator();
    paths.addPersonaPath({
      externalId: "a",
      brand: "Tom Tailor Men",
      brandKey: "tom_tailor",
      sizingGroup: "tops",
      pathKey: "men:top:t-shirt",
      path: ["Men", "T-Shirts"],
    });
    paths.addPersonaPath({
      externalId: "b",
      brand: "Tom Tailor Women",
      brandKey: "tom_tailor",
      sizingGroup: "tops",
      pathKey: "men:top:t-shirt",
      path: ["Men", "T-Shirts"],
    });

    expect(paths.result()).toHaveLength(1);
    expect(paths.result()[0]).toMatchObject({ brandKey: "tom_tailor", skuCount: 2 });
  });

  it("splits one sizing parent across the merchant paths that carry it", () => {
    // The entire reason this table exists. Both rows are `tops` for the same brand, which coverage
    // reports as a single pair — and a single chart assignment, which would be wrong for one of them.
    const paths = aggregator();
    paths.add({ brand: "Tommy", sizingGroup: "tops", sizingCategoryId: "2" });
    paths.add({ brand: "Tommy", sizingGroup: "tops", sizingCategoryId: "4" });

    expect(paths.result().map((row) => row.categoryPath)).toEqual([
      ["Men", "T-Shirts"],
      ["Women", "Tops"],
    ]);
  });

  it("builds the breadcrumb root-first from the winning category", () => {
    const paths = aggregator();
    paths.add({ brand: "Nike", sizingGroup: "tops", sizingCategoryId: "2" });

    expect(paths.result()[0].categoryPath).toEqual(["Men", "T-Shirts"]);
  });

  it("skips products with no resolvable path rather than bucketing them", () => {
    // Main-category-only products and hand-corrections over container-only categories. Neither has a
    // path a merchant could assign a chart to, and inventing one would put a row on Stage 5 that
    // governs nothing.
    const paths = aggregator();
    paths.add({ brand: "Nike", sizingGroup: null, sizingCategoryId: "2" });
    paths.add({ brand: "Nike", sizingGroup: "tops", sizingCategoryId: null });

    expect(paths.result()).toEqual([]);
  });

  it("keeps the unbranded sentinel as its own path with no name to show", () => {
    const paths = aggregator();
    paths.add({ brand: null, sizingGroup: "tops", sizingCategoryId: "2" });
    paths.add({ brand: "   ", sizingGroup: "tops", sizingCategoryId: "2" });

    const rows = paths.result();
    expect(rows).toHaveLength(1);
    expect(rows[0].brandKey).toBe("");
    expect(rows[0].brandName).toBeNull();
    expect(rows[0].skuCount).toBe(2);
  });

  it("leads with the paths governing the most stock", () => {
    const paths = aggregator();
    paths.add({ brand: "Nike", sizingGroup: "tops", sizingCategoryId: "2" });
    for (let i = 0; i < 5; i++) paths.add({ brand: "Nike", sizingGroup: "tops", sizingCategoryId: "4" });

    expect(paths.result().map((row) => row.skuCount)).toEqual([5, 1]);
  });

  it("falls back to the raw id for a category the store no longer reports", () => {
    // A term deleted in the store admin between the walk and this aggregation. Showing the id is ugly
    // and honest; dropping the row would silently lose the stock hanging off it.
    const paths = aggregator();
    paths.add({ brand: "Nike", sizingGroup: "tops", sizingCategoryId: "999" });

    expect(paths.result()[0].categoryPath).toEqual(["999"]);
  });
});

describe("pathKey", () => {
  it("is the natural key both coverage and assignments are unique on", () => {
    expect(pathKey("nike", "2", "tops")).toBe(pathKey("nike", "2", "tops"));
    expect(pathKey("nike", "2", "tops")).not.toBe(pathKey("nike", "2", "bottoms"));
    // Separated by a character no store category id or brand key can contain, so `a|b` and `a` + `|b`
    // cannot collide into one row.
    expect(pathKey("a", "b", "tops")).not.toBe(pathKey("ab", "", "tops"));
  });
});
