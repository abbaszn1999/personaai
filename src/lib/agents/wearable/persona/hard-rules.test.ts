import { describe, expect, it } from "vitest";
import { filterValidBundles, isValidBundle, parseHardRules, validateBundle } from "./hard-rules";
import type { CatalogCandidate, HardRule } from "@/lib/retrieval/types";

function item(overrides: Partial<CatalogCandidate> & { externalId: string }): CatalogCandidate {
  return {
    productGroupId: null,
    title: overrides.externalId,
    brand: null,
    categoryPaths: [["tops", "t-shirt"]],
    garmentCategory: "tops",
    garmentSubcategory: "t-shirt",
    price: 50,
    currency: "USD",
    inStock: true,
    productUrl: null,
    imageUrl: null,
    enrichedDescription: null,
    ...overrides,
  };
}

describe("max_price_spread", () => {
  const rule: HardRule = { type: "max_price_spread", amount: 150 };

  it("passes a bundle inside the limit", () => {
    const bundle = [item({ externalId: "a", price: 100 }), item({ externalId: "b", price: 240 })];
    expect(isValidBundle(bundle, [rule])).toBe(true);
  });

  it("fails a bundle beyond the limit", () => {
    const bundle = [item({ externalId: "a", price: 40 }), item({ externalId: "b", price: 400 })];
    expect(validateBundle(bundle, [rule])[0].rule).toBe("max_price_spread");
  });

  it("measures the spread across the whole bundle, not adjacent pairs", () => {
    const bundle = [
      item({ externalId: "a", price: 100 }),
      item({ externalId: "b", price: 180 }),
      item({ externalId: "c", price: 300 }),
    ];
    expect(isValidBundle(bundle, [rule])).toBe(false);
  });

  it("ignores items with no price rather than treating them as zero", () => {
    const bundle = [item({ externalId: "a", price: 100 }), item({ externalId: "b", price: null })];
    expect(isValidBundle(bundle, [rule])).toBe(true);
  });
});

describe("never_pair", () => {
  const rule: HardRule = {
    type: "never_pair",
    a: { categories: ["outerwear"] },
    b: { brands: ["Streetwear Collab"] },
  };

  it("rejects the pairing regardless of the order items appear in", () => {
    const forward = [
      item({ externalId: "a", categoryPaths: [["outerwear"]] }),
      item({ externalId: "b", brand: "Streetwear Collab" }),
    ];
    expect(isValidBundle(forward, [rule])).toBe(false);
    expect(isValidBundle([...forward].reverse(), [rule])).toBe(false);
  });

  it("allows either side on its own", () => {
    expect(isValidBundle([item({ externalId: "a", categoryPaths: [["outerwear"]] })], [rule])).toBe(true);
    expect(isValidBundle([item({ externalId: "b", brand: "Streetwear Collab" })], [rule])).toBe(true);
  });

  it("matches brands case-insensitively", () => {
    const bundle = [
      item({ externalId: "a", categoryPaths: [["outerwear"]] }),
      item({ externalId: "b", brand: "streetwear collab" }),
    ];
    expect(isValidBundle(bundle, [rule])).toBe(false);
  });

  it("treats an empty selector as matching nothing, not everything", () => {
    // A malformed rule that matched every item would reject every bundle, and the shopper
    // would just see an agent that never finds anything.
    const empty: HardRule = { type: "never_pair", a: {}, b: {} };
    expect(isValidBundle([item({ externalId: "a" }), item({ externalId: "b" })], [empty])).toBe(true);
  });

  it("matches a subcategory selector against any level of a deeper chain, not only the leaf", () => {
    const deepRule: HardRule = { type: "never_pair", a: { subcategories: ["Clothing"] }, b: { brands: ["y"] } };
    const bundle = [
      item({ externalId: "a", categoryPaths: [["Men", "Clothing", "Shirts"]] }),
      item({ externalId: "b", brand: "y" }),
    ];
    expect(isValidBundle(bundle, [deepRule])).toBe(false);
  });
});

describe("exclude_items", () => {
  it("catches an excluded item that reached the bundle anyway", () => {
    const rule: HardRule = { type: "exclude_items", externalIds: ["banned"] };
    expect(isValidBundle([item({ externalId: "banned" })], [rule])).toBe(false);
  });

  it("catches an excluded brand", () => {
    const rule: HardRule = { type: "exclude_items", brands: ["Discontinued Line"] };
    expect(isValidBundle([item({ externalId: "a", brand: "Discontinued Line" })], [rule])).toBe(false);
  });

  it("catches an excluded category on any of a product's paths, not just the first", () => {
    const rule: HardRule = { type: "exclude_items", categories: ["Sale"] };
    const multiPath = item({ externalId: "a", categoryPaths: [["tops", "t-shirt"], ["Sale"]] });
    expect(isValidBundle([multiPath], [rule])).toBe(false);
  });
});

describe("filterValidBundles", () => {
  it("drops only the offending options", () => {
    const rule: HardRule = { type: "max_price_spread", amount: 100 };
    const bundles = [
      { items: [item({ externalId: "a", price: 50 }), item({ externalId: "b", price: 120 })] },
      { items: [item({ externalId: "c", price: 50 }), item({ externalId: "d", price: 400 })] },
    ];
    expect(filterValidBundles(bundles, [rule])).toHaveLength(1);
  });

  it("passes everything through when there are no rules", () => {
    const bundles = [{ items: [item({ externalId: "a", price: 1 }), item({ externalId: "b", price: 9999 })] }];
    expect(filterValidBundles(bundles, [])).toHaveLength(1);
  });
});

describe("parseHardRules", () => {
  it("keeps well-formed rules and discards the rest", () => {
    const parsed = parseHardRules([
      { type: "max_price_spread", amount: 150 },
      { type: "max_price_spread", amount: -5 },
      { type: "never_pair", a: { brands: ["x"] }, b: { brands: ["y"] } },
      { type: "never_pair", a: { brands: ["x"] } },
      { type: "not_a_rule" },
      null,
    ]);

    expect(parsed).toHaveLength(2);
    expect(parsed.map((rule) => rule.type)).toEqual(["max_price_spread", "never_pair"]);
  });

  it("returns an empty list for a non-array value", () => {
    expect(parseHardRules(null)).toEqual([]);
    expect(parseHardRules({ type: "max_price_spread", amount: 10 })).toEqual([]);
  });
});
