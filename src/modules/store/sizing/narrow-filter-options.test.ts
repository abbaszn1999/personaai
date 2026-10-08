import { describe, expect, it } from "vitest";
import type { SizingSampleFacets } from "@/lib/sizing/sample-facets";
import {
  brandOptions,
  buildPathFilter,
  categoryOptions,
  collectionOptions,
  departmentOptions,
  parsePathFilter,
  subCategoryOptions,
} from "./narrow-filter-options";

const facets: SizingSampleFacets = {
  brands: [
    { brandKey: "moustache_men", name: "MOUSTACHE Men", type: "private", count: 40 },
    { brandKey: "tom_tailor", name: "Tom Tailor", type: "global", count: 12 },
  ],
  paths: [
    { key: "women:", label: "Women", depth: 1, count: 30 },
    { key: "women:top:", label: "Women > Tops", depth: 2, count: 20 },
    { key: "women:top:t-shirt", label: "Women > Tops > T-Shirts & Tops", depth: 3, count: 12 },
    { key: "women:top:knit", label: "Women > Tops > Knitwear & Sweaters", depth: 3, count: 8 },
    { key: "women:bottom:", label: "Women > Bottoms", depth: 2, count: 10 },
    { key: "men:", label: "Men", depth: 1, count: 22 },
  ],
  collections: [
    { id: "c1", name: "women top s26", trail: ["Women", "women top s26"], count: 14 },
    { id: "c2", name: "Sale", trail: ["Sale"], count: 3 },
  ],
  hasCollections: true,
};

describe("path filter value", () => {
  it("round-trips every depth", () => {
    for (const value of ["women:", "women:top:", "women:top:t-shirt", "kids-boys:footwear:sneaker"]) {
      expect(buildPathFilter(parsePathFilter(value))).toBe(value);
    }
    expect(parsePathFilter(null)).toEqual({ department: null, category: null, subCategory: null });
    expect(buildPathFilter(parsePathFilter(null))).toBeNull();
  });

  it("drops the deeper levels when a higher one changes", () => {
    expect(buildPathFilter({ department: "men", category: null, subCategory: null })).toBe("men:");
  });
});

describe("select options", () => {
  it("offers each level only under its parent, with counts", () => {
    expect(departmentOptions(facets).map((o) => o.key)).toEqual(["", "women", "men"]);
    expect(categoryOptions(facets, "women").map((o) => o.key)).toEqual(["", "top", "bottom"]);
    expect(categoryOptions(facets, null).map((o) => o.key)).toEqual([""]);
    expect(subCategoryOptions(facets, "women", "top").map((o) => o.key)).toEqual(["", "t-shirt", "knit"]);
    expect(subCategoryOptions(facets, "women", null).map((o) => o.key)).toEqual([""]);
    expect(categoryOptions(facets, "women")[1].label).toBe("Tops (20)");
  });

  it("narrows the brand list by the chosen brand type but keeps the selected brand", () => {
    expect(brandOptions(facets, "private", null).map((o) => o.key)).toEqual(["", "moustache_men"]);
    expect(brandOptions(facets, "private", "tom_tailor").map((o) => o.key)).toEqual(["", "moustache_men", "tom_tailor"]);
    expect(brandOptions(facets, null, null)).toHaveLength(3);
  });

  it("lists collections with their parent trail as the hint", () => {
    const options = collectionOptions(facets);
    expect(options[1]).toMatchObject({ key: "c1", label: "women top s26 (14)", hint: "Women" });
    expect(options[2].hint).toBeUndefined();
  });

  it("is safe before the facets have loaded", () => {
    expect(brandOptions(null, null, null)).toHaveLength(1);
    expect(departmentOptions(null)).toHaveLength(1);
    expect(collectionOptions(null)).toHaveLength(1);
  });
});
