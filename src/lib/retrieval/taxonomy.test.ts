import { describe, expect, it } from "vitest";
import {
  CANONICAL_CATEGORIES,
  CANONICAL_TAXONOMY,
  categoryToGarmentSlot,
  describeTaxonomy,
  findCategoryForSubcategory,
  isCanonicalSubcategory,
  mapToCanonical,
} from "./taxonomy";

describe("mapToCanonical", () => {
  it("resolves the three labels for the same thing onto one value", () => {
    for (const label of ["Sneakers", "Trainers", "Running Shoes"]) {
      expect(mapToCanonical(label)).toEqual({ category: "footwear", subcategory: "sneakers" });
    }
  });

  it("prefers the longest matching synonym", () => {
    // "t-shirt" contains "shirt", and "shorts" contains "short" — a shortest-first match
    // would quietly file both under the wrong subcategory.
    expect(mapToCanonical("Graphic T-Shirt")?.subcategory).toBe("t-shirt");
    expect(mapToCanonical("Sweatshirt")?.subcategory).toBe("sweatshirt");
    expect(mapToCanonical("Linen Shorts")?.subcategory).toBe("shorts");
  });

  it("strips merchant collection noise around the real label", () => {
    expect(mapToCanonical("SS24 / Men's Knitwear")).toEqual({ category: "tops", subcategory: "sweater" });
    expect(mapToCanonical("WOMEN | Dresses")).toEqual({ category: "dresses", subcategory: "dress" });
  });

  it("falls back to a category when the label has no subcategory precision", () => {
    expect(mapToCanonical("Accessories")).toEqual({ category: "accessories" });
    expect(mapToCanonical("Lingerie")).toEqual({ category: "underwear" });
  });

  it("returns null rather than guessing when nothing matches", () => {
    expect(mapToCanonical("Gift Cards")).toBeNull();
    expect(mapToCanonical("")).toBeNull();
  });
});

describe("categoryToGarmentSlot", () => {
  it("maps each garment category onto its try-on slot", () => {
    expect(categoryToGarmentSlot("tops", "t-shirt")).toBe("top");
    expect(categoryToGarmentSlot("bottoms", "jeans")).toBe("bottom");
    expect(categoryToGarmentSlot("outerwear", "jacket")).toBe("outerwear");
    expect(categoryToGarmentSlot("dresses", "dress")).toBe("dress");
    expect(categoryToGarmentSlot("footwear", "boots")).toBe("shoes");
  });

  it("splits a category across slots when its subcategories occupy different ones", () => {
    expect(categoryToGarmentSlot("sleepwear", "pyjama-top")).toBe("top");
    expect(categoryToGarmentSlot("sleepwear", "pyjama-bottoms")).toBe("bottom");
    expect(categoryToGarmentSlot("sleepwear", "robe")).toBe("outerwear");
  });

  it("treats a one-piece swimsuit as occupying the dress slot", () => {
    // It conflicts with a top and a bottom simultaneously, which is what the dress slot means
    // to outfit merging.
    expect(categoryToGarmentSlot("swimwear", "swimsuit")).toBe("dress");
    expect(categoryToGarmentSlot("swimwear", "swim-shorts")).toBe("bottom");
  });

  it("stacks non-garment categories rather than replacing a worn slot", () => {
    expect(categoryToGarmentSlot("accessories", "belt")).toBe("other");
    expect(categoryToGarmentSlot("bags", "tote")).toBe("other");
    expect(categoryToGarmentSlot(null)).toBe("other");
  });
});

describe("taxonomy integrity", () => {
  it("has no subcategory appearing under two categories", () => {
    const seen = new Map<string, string>();
    for (const category of CANONICAL_CATEGORIES) {
      for (const sub of CANONICAL_TAXONOMY[category] as readonly string[]) {
        expect(seen.has(sub), `"${sub}" is under both ${seen.get(sub)} and ${category}`).toBe(false);
        seen.set(sub, category);
      }
    }
  });

  it("resolves every subcategory back to its parent", () => {
    for (const category of CANONICAL_CATEGORIES) {
      for (const sub of CANONICAL_TAXONOMY[category] as readonly string[]) {
        expect(findCategoryForSubcategory(sub)).toBe(category);
        expect(isCanonicalSubcategory(category, sub)).toBe(true);
      }
    }
  });

  it("rejects a subcategory under the wrong parent", () => {
    expect(isCanonicalSubcategory("tops", "jeans")).toBe(false);
    expect(isCanonicalSubcategory("not-a-category", "jeans")).toBe(false);
  });

  it("renders every category into the prompt description", () => {
    const described = describeTaxonomy();
    for (const category of CANONICAL_CATEGORIES) {
      expect(described).toContain(category);
    }
  });
});
