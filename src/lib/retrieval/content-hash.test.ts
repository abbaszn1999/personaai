import { describe, expect, it } from "vitest";
import { computeContentHash, type CategoryPath, type HashableProductContent } from "./content-hash";

const base: HashableProductContent = {
  title: "Relaxed Fit Linen Shirt",
  description: "Breathable linen, camp collar.",
  brand: "Aria",
  categoryPaths: [["Men", "Shirts"]],
  imageUrl: "https://cdn.example.com/linen-shirt.webp",
};

describe("computeContentHash", () => {
  it("is stable across calls for unchanged content", () => {
    expect(computeContentHash(base)).toBe(computeContentHash({ ...base }));
  });

  it("changes when the image is swapped", () => {
    // The case this gate exists for: without the image in the hash, the product keeps a
    // vector describing a photo it no longer uses, and nothing errors.
    const swapped = { ...base, imageUrl: "https://cdn.example.com/linen-shirt-v2.webp" };
    expect(computeContentHash(swapped)).not.toBe(computeContentHash(base));
  });

  it("changes when any text field the description is built from changes", () => {
    const fields: Array<Partial<HashableProductContent>> = [
      { title: "Relaxed Fit Cotton Shirt" },
      { description: "Breathable cotton, spread collar." },
      { brand: "Other" },
      { categoryPaths: [["Men", "Outerwear"]] },
      { categoryPaths: [["Men", "Blouses"]] },
    ];

    for (const patch of fields) {
      expect(computeContentHash({ ...base, ...patch })).not.toBe(computeContentHash(base));
    }
  });

  it("ignores surrounding whitespace so a trivial edit doesn't re-run both model calls", () => {
    expect(computeContentHash({ ...base, title: "  Relaxed Fit Linen Shirt  " })).toBe(computeContentHash(base));
  });

  it("treats a null field and an empty field as the same", () => {
    expect(computeContentHash({ ...base, description: null })).toBe(computeContentHash({ ...base, description: "" }));
  });

  it("changes when a product gains or loses a selected category, regardless of order", () => {
    const withTwo: CategoryPath[] = [
      ["Men", "Shirts"],
      ["Shoes & Bags"],
    ];
    const reordered: CategoryPath[] = [...withTwo].reverse();

    expect(computeContentHash({ ...base, categoryPaths: withTwo })).not.toBe(computeContentHash(base));
    expect(computeContentHash({ ...base, categoryPaths: withTwo })).toBe(
      computeContentHash({ ...base, categoryPaths: reordered })
    );
  });

  it("changes when a chain gains or loses a middle level, not just its root and leaf", () => {
    // "Men > Shirts" and "Men > Clothing > Shirts" must hash differently — the middle level is
    // real information the vector should be described against.
    const deep: CategoryPath[] = [["Men", "Clothing", "Shirts"]];
    expect(computeContentHash({ ...base, categoryPaths: deep })).not.toBe(computeContentHash(base));
  });

  it("does not collide when content shifts between adjacent fields", () => {
    // Brand and the category key sit next to each other in the hashed payload; without a
    // separator, moving text from one into the other could produce the same string.
    const a = { ...base, brand: "AriaMen", categoryPaths: [["Shirts"]] as CategoryPath[] };
    const b = { ...base, brand: "Aria", categoryPaths: [["MenShirts"]] as CategoryPath[] };
    expect(computeContentHash(a)).not.toBe(computeContentHash(b));
  });
});
