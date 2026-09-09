import { describe, expect, it } from "vitest";
import {
  buildCategoryIndex,
  mappableCategoryIds,
  parseCategoryParentMap,
  parseSkuParentOverrides,
  resolveParentCategory,
  resolveProductParent,
  suggestParentCategory,
  unmappedCategoryIds,
} from "./category-parents";
import type { StoreCategory } from "@/modules/store/types";

/** `Women > Tops > {T-Shirts, Blouses}`, `Women > Swimwear > {Bikini Tops, Trunks}`, plus a flat
 *  `Summer Sale` collection every product also lands in. */
const CATEGORIES: StoreCategory[] = [
  { id: "women", name: "Women", productCount: 900, parentId: null },
  { id: "tops", name: "Tops", productCount: 500, parentId: "women" },
  { id: "tshirts", name: "T-Shirts", productCount: 300, parentId: "tops" },
  { id: "blouses", name: "Blouses", productCount: 200, parentId: "tops" },
  { id: "swim", name: "Swimwear", productCount: 120, parentId: "women" },
  { id: "bikini-tops", name: "Bikini Tops", productCount: 60, parentId: "swim" },
  { id: "trunks", name: "Trunks", productCount: 60, parentId: "swim" },
  { id: "sale", name: "Summer Sale", productCount: 400, parentId: null },
];

const index = buildCategoryIndex(CATEGORIES);

describe("resolveParentCategory", () => {
  it("takes the parent the merchant mapped onto the product's own category", () => {
    expect(resolveParentCategory(["tshirts"], { tshirts: "tops" }, index)).toBe("tops");
  });

  it("prefers the most specific category when a product sits in several", () => {
    // A garment is in `Women > Tops > T-Shirts` and also in a `Summer Sale` collection the merchant
    // happened to map. What a product *is* comes from the deepest path; a sale collection says only
    // when it is discounted.
    const map = { tshirts: "tops", sale: "dresses" };

    expect(resolveParentCategory(["sale", "tshirts"], map, index)).toBe("tops");
  });

  it("inherits from the nearest mapped ancestor", () => {
    // Step 2 only asks about the frontier of the selection, so a product filed directly on an
    // interior term has no mapping of its own and has to look upward.
    expect(resolveParentCategory(["tshirts"], { tops: "tops" }, index)).toBe("tops");
  });

  it("reads a unanimous verdict off the children of an unmapped branch", () => {
    // Both leaves under `Tops` went to Tops, so the handful of products sitting on `Tops` itself
    // are Tops too.
    const map = { tshirts: "tops", blouses: "tops" };

    expect(resolveParentCategory(["tops"], map, index)).toBe("tops");
  });

  it("declines when the children of an unmapped branch disagree", () => {
    // Bikini tops went to Tops and trunks to Bottoms, which is exactly right for them and exactly
    // why the `Swimwear` term above cannot be either one.
    const map = { "bikini-tops": "tops", trunks: "bottoms" };

    expect(resolveParentCategory(["swim"], map, index)).toBeNull();
  });

  it("returns null rather than a default when the mapping does not reach the product", () => {
    // The caller must skip these. Sizing a product against a plausible-but-wrong chart excludes it
    // from results it belonged in, which is worse than carrying no chart at all.
    expect(resolveParentCategory(["tshirts"], {}, index)).toBeNull();
  });

  it("ignores a stored value that is no longer one of the five parents", () => {
    // Mappings written before the vocabulary collapsed can still name `swimwear` or `hats`. Those
    // are not groups this build can size, and honouring one would key a chart nothing can read.
    expect(resolveParentCategory(["tshirts"], { tshirts: "swimwear" }, index)).toBeNull();
  });

  it("resolves the same way regardless of the order the store lists a product's categories", () => {
    const map = { tshirts: "tops", sale: "dresses" };

    expect(resolveParentCategory(["tshirts", "sale"], map, index)).toBe(
      resolveParentCategory(["sale", "tshirts"], map, index)
    );
  });
});

describe("buildCategoryIndex", () => {
  it("promotes a term whose parent no longer exists rather than losing it", () => {
    const orphaned = buildCategoryIndex([
      { id: "leaf", name: "Leaf", productCount: 10, parentId: "deleted-term" },
    ]);

    expect(orphaned.parentOf.get("leaf")).toBeNull();
    expect(orphaned.depthOf.get("leaf")).toBe(0);
  });

  it("survives a term that claims itself as its own parent", () => {
    const selfParented = buildCategoryIndex([
      { id: "loop", name: "Loop", productCount: 1, parentId: "loop" },
    ]);

    expect(selfParented.parentOf.get("loop")).toBeNull();
  });
});

describe("mappableCategoryIds", () => {
  it("asks only about the frontier of the selection", () => {
    // Ticking `Tops` stores it and both its children. Asking about the branch as well as each leaf
    // would be the same question three times.
    const frontier = mappableCategoryIds(["tops", "tshirts", "blouses"], index);

    expect(frontier.sort()).toEqual(["blouses", "tshirts"]);
  });

  it("treats a selected branch with no selected children as a path in its own right", () => {
    // A WooCommerce store with one flat `Summer Sale` term has nothing beneath it, so the term
    // itself is what the merchant has to map.
    expect(mappableCategoryIds(["sale"], index)).toEqual(["sale"]);
  });
});

describe("suggestParentCategory", () => {
  it("reads the head of an English compound noun, which is its last word", () => {
    // The pair that rules out both keyword counting and a fixed parent order: whichever of dresses
    // and tops you check first, one of these two comes out wrong.
    expect(suggestParentCategory("Men > Shirts > Dress Shirts")).toBe("tops");
    expect(suggestParentCategory("Women > Dresses > Shirt Dresses")).toBe("dresses");
  });

  it("ignores the audience and department words above the garment", () => {
    expect(suggestParentCategory("Women > Clothing > Jeans & Denim")).toBe("bottoms");
    expect(suggestParentCategory("Kids > Boys > Trainers")).toBe("footwear");
  });

  it("keeps outerwear off tops even though a coat is worn on the same half of the body", () => {
    expect(suggestParentCategory("Men > Outerwear > Puffer Jackets")).toBe("outerwear");
  });

  it("matches on a word boundary rather than anywhere in the string", () => {
    // "Laptop Bags" contains the letters of "top" and is not a garment at all.
    expect(suggestParentCategory("Accessories > Laptop Bags")).toBeNull();
  });

  it("declines rather than guessing when nothing in the path names a garment", () => {
    expect(suggestParentCategory("Home > Summer Sale")).toBeNull();
  });
});

describe("resolveProductParent", () => {
  const product = { externalId: "p1", categoryIds: ["tshirts"] };

  it("falls back to the category path when the product has no correction", () => {
    expect(resolveProductParent(product, { tshirts: "tops" }, {}, index)).toBe("tops");
  });

  it("lets a correction beat the path", () => {
    // The whole point of the escape hatch: a path holding several kinds of garment maps to one
    // parent, and the odd product out is fixed here rather than by restructuring the store.
    expect(resolveProductParent(product, { tshirts: "tops" }, { p1: "dresses" }, index)).toBe("dresses");
  });

  it("sizes a product its path leaves unmapped", () => {
    // Without this a product outside the merchant's mapping could never be sized at all, since
    // there is no path-level answer to correct.
    expect(resolveProductParent(product, {}, { p1: "bottoms" }, index)).toBe("bottoms");
  });

  it("ignores a correction naming a parent this build no longer has", () => {
    expect(resolveProductParent(product, { tshirts: "tops" }, { p1: "swimwear" }, index)).toBe("tops");
  });

  it("keys corrections per product, leaving its neighbours on the path", () => {
    const overrides = { p1: "dresses" };
    const sibling = { externalId: "p2", categoryIds: ["tshirts"] };

    expect(resolveProductParent(sibling, { tshirts: "tops" }, overrides, index)).toBe("tops");
  });
});

describe("parseSkuParentOverrides", () => {
  it("drops entries naming a parent this build no longer has", () => {
    // Same contract as the category map: the product simply inherits from its path again rather
    // than the whole save being refused.
    expect(parseSkuParentOverrides({ p1: "tops", p2: "hats" })).toEqual({ p1: "tops" });
  });

  it("returns an empty map for anything that is not an object", () => {
    expect(parseSkuParentOverrides(null)).toEqual({});
    expect(parseSkuParentOverrides(["tops"])).toEqual({});
  });
});

describe("parseCategoryParentMap", () => {
  it("drops entries naming a parent this build no longer has", () => {
    // A tab left open from before the vocabulary collapsed still posts `swimwear`. Keeping the
    // twenty good mappings alongside is worth more than refusing the save over the one stale one.
    const parsed = parseCategoryParentMap({ a: "tops", b: "swimwear", c: "footwear" });

    expect(parsed).toEqual({ a: "tops", c: "footwear" });
  });

  it("returns an empty map for anything that is not an object", () => {
    expect(parseCategoryParentMap(null)).toEqual({});
    expect(parseCategoryParentMap(["tops"])).toEqual({});
  });
});

describe("unmappedCategoryIds", () => {
  it("reports the paths still blocking the merchant from continuing", () => {
    const missing = unmappedCategoryIds(["tshirts", "blouses"], { tshirts: "tops" }, index);

    expect(missing).toEqual(["blouses"]);
  });

  it("is empty once every path on the frontier has a parent", () => {
    const map = { tshirts: "tops", blouses: "tops" };

    expect(unmappedCategoryIds(["tops", "tshirts", "blouses"], map, index)).toEqual([]);
  });
});
