import { describe, expect, it } from "vitest";
import { applyHardRules, applyStatedBounds, isEmptyFilter, validateFilter } from "./build-filter";
import type { FilterValidationResult } from "./build-filter";
import type { CatalogFacets, CatalogFilter, HardRule } from "@/lib/retrieval/types";

const facets: CatalogFacets = {
  categories: [
    { category: "Men", subcategory: "T-Shirts" },
    { category: "Men", subcategory: "Shirts" },
    { category: "Shoes & Bags", subcategory: "Sneakers" },
    { category: "Men", subcategory: "mens pants" },
    // A 3-level chain ("Men > Clothing > Shirts") is flattened by getCatalogFacets into two
    // entries under the same root — the middle level and the leaf are both offered as
    // "subcategory" candidates, since either is a legitimate thing to filter on.
    { category: "Men", subcategory: "Clothing" },
  ],
  brands: ["Adidas", "Uniqlo"],
  priceRange: { min: 20, max: 400 },
};

describe("validateFilter", () => {
  it("accepts a well-formed filter, normalising to the catalog's own casing", () => {
    const { filter, corrections } = validateFilter(
      { category: "men", subcategory: "t-shirts", brand: "Adidas", priceMax: 50 },
      facets
    );

    expect(filter).toEqual({ category: "Men", subcategory: "T-Shirts", brand: "Adidas", priceMax: 50 });
    expect(corrections).toHaveLength(0);
  });

  it("drops a category this store doesn't have", () => {
    // An invented column value doesn't error, it silently matches zero rows — which reads to a
    // shopper as an empty store rather than a bug.
    const { filter, corrections } = validateFilter({ category: "gadgets" }, facets);

    expect(filter.category).toBeUndefined();
    expect(corrections[0]).toContain("gadgets");
  });

  it("repairs a subcategory paired with the wrong parent", () => {
    const { filter, corrections } = validateFilter({ category: "Shoes & Bags", subcategory: "T-Shirts" }, facets);

    expect(filter).toEqual({ category: "Men", subcategory: "T-Shirts" });
    expect(corrections[0]).toContain("Men");
  });

  it("accepts a garment type this store's own tree has no name for", () => {
    // The reason these fields exist. This merchant's tree is "Men / Clothing", so "jacket" has
    // nothing to match against there, and the request produced no filter at all before — leaving
    // the ranker to keep coats and blazers out of a result set asked for in jackets.
    const { filter, corrections } = validateFilter({ garmentSubcategory: "jacket" }, facets);

    expect(filter).toEqual({ garmentCategory: "outerwear", garmentSubcategory: "jacket" });
    expect(corrections).toHaveLength(0);
  });

  it("derives the garment category rather than trusting the one the model paired with it", () => {
    const { filter, corrections } = validateFilter(
      { garmentCategory: "tops", garmentSubcategory: "loafers" },
      facets
    );

    // An inconsistent pair is ANDed into the query and matches nothing at all.
    expect(filter).toEqual({ garmentCategory: "footwear", garmentSubcategory: "loafers" });
    expect(corrections[0]).toContain("footwear");
  });

  it("keeps a bare garment category when the shopper was not specific", () => {
    const { filter } = validateFilter({ garmentCategory: "Outerwear" }, facets);
    expect(filter).toEqual({ garmentCategory: "outerwear" });
  });

  it("drops a garment type outside the canonical vocabulary", () => {
    const { filter, corrections } = validateFilter({ garmentSubcategory: "spacesuit" }, facets);

    expect(filter.garmentSubcategory).toBeUndefined();
    expect(filter.garmentCategory).toBeUndefined();
    expect(corrections[0]).toContain("spacesuit");
  });

  it("keeps the two vocabularies independent", () => {
    const { filter } = validateFilter({ category: "Men", garmentSubcategory: "jacket" }, facets);

    expect(filter).toEqual({ category: "Men", garmentCategory: "outerwear", garmentSubcategory: "jacket" });
  });

  it("infers the parent category from the subcategory alone", () => {
    expect(validateFilter({ subcategory: "Sneakers" }, facets).filter).toEqual({
      category: "Shoes & Bags",
      subcategory: "Sneakers",
    });
  });

  it("drops a subcategory this store doesn't stock, without inventing a parent for it", () => {
    // There's no fixed vocabulary to fall back on — a subcategory that isn't in the facets is
    // simply unknown, not "somewhere under a category we can guess".
    const { filter, corrections } = validateFilter({ subcategory: "loafers" }, facets);

    expect(filter).toEqual({});
    expect(corrections[0]).toContain("loafers");
  });

  it("matches a middle-level segment of a deeper chain, not only the leaf", () => {
    expect(validateFilter({ subcategory: "Clothing" }, facets).filter).toEqual({
      category: "Men",
      subcategory: "Clothing",
    });
  });

  it("drops a brand the catalog doesn't carry", () => {
    expect(validateFilter({ brand: "Nonexistent" }, facets).filter.brand).toBeUndefined();
  });

  it("matches a known brand case-insensitively and stores the catalog's spelling", () => {
    expect(validateFilter({ brand: "adidas" }, facets).filter.brand).toBe("Adidas");
  });

  it("swaps an inverted price range", () => {
    const { filter, corrections } = validateFilter({ priceMin: 200, priceMax: 50 }, facets);

    expect(filter).toEqual({ priceMin: 50, priceMax: 200 });
    expect(corrections[0]).toContain("inverted");
  });

  it("reads a floor and ceiling on the same number as a floor", () => {
    // "A jacket, minimum $200" once produced priceMin 200 AND priceMax 200 — a window matching
    // only an exact price, so nothing matched and the shopper was told their budget was too low.
    const { filter, corrections } = validateFilter({ priceMin: 200, priceMax: 200 }, facets);

    expect(filter).toEqual({ priceMin: 200 });
    expect(corrections[0]).toContain("floor");
  });

  it("drops a ceiling below everything in the catalog", () => {
    const { filter, corrections } = validateFilter({ category: "Men", priceMax: 5 }, facets);

    expect(filter.priceMax).toBeUndefined();
    expect(filter.category).toBe("Men");
    expect(corrections[0]).toContain("5");
  });

  it("ignores non-numeric and non-positive prices", () => {
    expect(validateFilter({ priceMax: "cheap", priceMin: -10 }, facets).filter).toEqual({});
  });

  it("ignores descriptive fields that have no column", () => {
    // Colour and material live in the vector, not in WHERE. Accepting them here would build a
    // filter against columns that don't exist.
    const { filter } = validateFilter({ category: "Men", color: "red", material: "linen" }, facets);
    expect(filter).toEqual({ category: "Men" });
  });
});

describe("applyStatedBounds", () => {
  const input = (bounds: { budgetMin?: number; budgetMax?: number }) => ({
    query: "a white jacket",
    recentTurns: [],
    facets,
    apiKey: "key",
    ...bounds,
  });

  const built = (filter: CatalogFilter): FilterValidationResult => ({ filter, corrections: [] });

  it("applies an intake budget as a ceiling when the model set none", () => {
    const result = built({ category: "Men" });
    applyStatedBounds(result, input({ budgetMax: 300 }));
    expect(result.filter.priceMax).toBe(300);
  });

  it("only tightens a ceiling the model set deliberately", () => {
    const tighter = built({ priceMax: 120 });
    applyStatedBounds(tighter, input({ budgetMax: 300 }));
    expect(tighter.filter.priceMax).toBe(120);

    const looser = built({ priceMax: 500 });
    applyStatedBounds(looser, input({ budgetMax: 300 }));
    expect(looser.filter.priceMax).toBe(300);
  });

  it("refuses a ceiling that leaves no room above the stated floor", () => {
    // The bug in full: the shopper said "minimum $200" once, the filter model read the floor and
    // the tool call read the same number as a budget. Stamping it on collapses the window to a
    // single price, and the empty result then reads as "this store has nothing for you".
    const result = built({ priceMin: 200, garmentSubcategory: "jacket" });
    applyStatedBounds(result, input({ budgetMax: 200 }));

    expect(result.filter.priceMax).toBeUndefined();
    expect(result.filter.priceMin).toBe(200);
    expect(result.corrections[0]).toContain("200");
  });

  it("keeps a genuine range where the ceiling clears the floor", () => {
    const result = built({ priceMin: 200 });
    applyStatedBounds(result, input({ budgetMax: 400 }));
    expect(result.filter).toEqual({ priceMin: 200, priceMax: 400 });
  });

  it("raises a floor the shopper stated to the tool above a lower one the model guessed", () => {
    const result = built({ priceMin: 50 });
    applyStatedBounds(result, input({ budgetMin: 200 }));
    expect(result.filter.priceMin).toBe(200);
  });
});

describe("applyHardRules", () => {
  it("adds excluded ids to the filter", () => {
    const rules: HardRule[] = [{ type: "exclude_items", externalIds: ["p1", "p2"] }];
    expect(applyHardRules({ category: "Men" }, rules).excludeExternalIds).toEqual(["p1", "p2"]);
  });

  it("merges exclusions with ids the caller already set", () => {
    const rules: HardRule[] = [{ type: "exclude_items", externalIds: ["p2"] }];
    const result = applyHardRules({ excludeExternalIds: ["p1"] }, rules);
    expect(result.excludeExternalIds?.sort()).toEqual(["p1", "p2"]);
  });

  it("overrides a shopper's category when the store excludes it", () => {
    // "Never surface this line" isn't negotiable against a shopper's preference.
    const rules: HardRule[] = [{ type: "exclude_items", categories: ["Men"] }];
    const result = applyHardRules({ category: "Men", subcategory: "T-Shirts" }, rules);

    expect(result.category).toBeUndefined();
    expect(result.subcategory).toBeUndefined();
  });

  it("overrides a shopper's brand when the store excludes it", () => {
    const rules: HardRule[] = [{ type: "exclude_items", brands: ["adidas"] }];
    expect(applyHardRules({ brand: "Adidas" }, rules).brand).toBeUndefined();
  });

  it("leaves combination rules alone, since they can't be expressed as a WHERE", () => {
    const rules: HardRule[] = [{ type: "max_price_spread", amount: 100 }];
    expect(applyHardRules({ category: "Men" }, rules)).toEqual({ category: "Men" });
  });
});

describe("isEmptyFilter", () => {
  it("treats a filter with no constraints as empty", () => {
    expect(isEmptyFilter({})).toBe(true);
    expect(isEmptyFilter({ inStockOnly: true })).toBe(true);
  });

  it("treats any real constraint as non-empty", () => {
    expect(isEmptyFilter({ category: "Men" })).toBe(false);
    expect(isEmptyFilter({ priceMax: 50 })).toBe(false);
  });

  it("counts a garment constraint, which is often the only one a request produces", () => {
    // Missing this is what would send "i need a black jacket" to ask_info, for a filter that
    // scopes the search perfectly well.
    expect(isEmptyFilter({ garmentCategory: "outerwear" })).toBe(false);
    expect(isEmptyFilter({ garmentSubcategory: "jacket" })).toBe(false);
  });
});
