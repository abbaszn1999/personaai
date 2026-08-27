import { describe, expect, it } from "vitest";
import { describeAnchorKnowledge, parseOrdinalReference, resolveAnchor, resolveBundleSwapTargets, toAnchor } from "./anchor";
import type { AnchorState, CatalogCandidate, DiscussedBundleItem } from "@/lib/retrieval/types";

function candidate(externalId: string, title: string): CatalogCandidate {
  return {
    externalId,
    productGroupId: `group-${externalId}`,
    title,
    brand: null,
    categoryPaths: [["Men", "T-Shirts"]],
    garmentCategory: "tops",
    garmentSubcategory: "t-shirt",
    price: 30,
    currency: "USD",
    inStock: true,
    productUrl: null,
    imageUrl: "https://cdn.example.com/a.jpg",
    enrichedDescription: null,
  };
}

const shown = [
  candidate("p1", "Brushed Cotton Tee"),
  candidate("p2", "Modal Blend Tee"),
  candidate("p3", "Waffle Knit Tee"),
];

describe("toAnchor", () => {
  it("flattens the primary path to its root and leaf", () => {
    expect(toAnchor(candidate("p1", "Tee")).category).toBe("Men");
    expect(toAnchor(candidate("p1", "Tee")).subcategory).toBe("T-Shirts");
  });

  it("collapses a deeper chain to just its root and its own most specific tag", () => {
    const deep = { ...candidate("p1", "Tee"), categoryPaths: [["Men", "Clothing", "Shirts"]] };
    const anchor = toAnchor(deep);
    expect(anchor.category).toBe("Men");
    expect(anchor.subcategory).toBe("Shirts");
  });

  it("leaves subcategory null for a single-level path", () => {
    const flat = { ...candidate("p1", "Tee"), categoryPaths: [["Shoes & Bags"]] };
    const anchor = toAnchor(flat);
    expect(anchor.category).toBe("Shoes & Bags");
    expect(anchor.subcategory).toBeNull();
  });

  it("leaves both null when the product has no category path", () => {
    const none = { ...candidate("p1", "Tee"), categoryPaths: [] };
    const anchor = toAnchor(none);
    expect(anchor.category).toBeNull();
    expect(anchor.subcategory).toBeNull();
  });

  it("carries the candidate's description and attribute bag through unchanged", () => {
    const withData = {
      ...candidate("p1", "Tee"),
      enrichedDescription: "Soft-washed, runs true to size.",
      // Store-specific option names, not colour/size, so this proves nothing here is hardcoded.
      attributes: { collar_type: ["Mandarin"], inseam: ["30in", "32in"] },
    };
    const anchor = toAnchor(withData);
    expect(anchor.enrichedDescription).toBe("Soft-washed, runs true to size.");
    expect(anchor.attributes).toEqual({ collar_type: ["Mandarin"], inseam: ["30in", "32in"] });
  });
});

describe("describeAnchorKnowledge", () => {
  function anchorWith(overrides: Partial<AnchorState>): AnchorState {
    return {
      externalId: "p1",
      productGroupId: null,
      title: "Field Jacket",
      brand: null,
      category: "Men",
      subcategory: "Jackets",
      enrichedDescription: null,
      garmentCategory: null,
      ...overrides,
    };
  }

  it("returns null when there is nothing beyond title/price/stock", () => {
    expect(describeAnchorKnowledge(anchorWith({}))).toBeNull();
  });

  it("renders the description alone when there are no attributes", () => {
    expect(describeAnchorKnowledge(anchorWith({ enrichedDescription: "A rugged shell." }))).toBe("A rugged shell.");
  });

  it("renders whatever attribute keys are actually present, without assuming any particular one", () => {
    const known = describeAnchorKnowledge(anchorWith({ attributes: { collar_type: ["Mandarin"], inseam: ["30in", "32in"] } }));
    expect(known).toBe("collar_type: Mandarin; inseam: 30in, 32in");
  });

  it("combines description and attributes when both are present", () => {
    const known = describeAnchorKnowledge(
      anchorWith({ enrichedDescription: "A rugged shell.", attributes: { fit: ["Relaxed"] } })
    );
    expect(known).toBe("A rugged shell. — fit: Relaxed");
  });

  it("skips an attribute key whose values are empty", () => {
    expect(describeAnchorKnowledge(anchorWith({ attributes: { fit: [] } }))).toBeNull();
  });
});

describe("parseOrdinalReference", () => {
  it("reads ordinal words", () => {
    expect(parseOrdinalReference("I'll take the second one")).toBe(2);
    expect(parseOrdinalReference("the first please")).toBe(1);
  });

  it("reads numeric forms", () => {
    expect(parseOrdinalReference("number 3 looks good")).toBe(3);
    expect(parseOrdinalReference("#2")).toBe(2);
    expect(parseOrdinalReference("option 1")).toBe(1);
  });

  it("treats last as a position from the end", () => {
    expect(parseOrdinalReference("the last one")).toBe(-1);
  });

  it("returns null when there is no ordinal", () => {
    expect(parseOrdinalReference("does that come in navy")).toBeNull();
    // A bare price shouldn't be mistaken for a position.
    expect(parseOrdinalReference("under 50")).toBeNull();
  });
});

describe("resolveAnchor", () => {
  it("prefers an explicitly named product over an ordinal", () => {
    const anchor = resolveAnchor({
      message: "actually the Waffle Knit Tee, not the first one",
      lastShown: shown,
      current: null,
    });
    expect(anchor?.externalId).toBe("p3");
  });

  it("resolves an ordinal against the order the shopper saw", () => {
    expect(resolveAnchor({ message: "the second one", lastShown: shown, current: null })?.externalId).toBe("p2");
    expect(resolveAnchor({ message: "the last one", lastShown: shown, current: null })?.externalId).toBe("p3");
  });

  it("refuses an out-of-range ordinal rather than substituting a neighbour", () => {
    // Silently answering about the wrong product is this mode's whole failure mode.
    expect(resolveAnchor({ message: "the fifth one", lastShown: shown, current: null })).toBeNull();
  });

  it("resolves a pronoun to the existing anchor", () => {
    const current = toAnchor(shown[1]);
    expect(resolveAnchor({ message: "does it come in navy", lastShown: shown, current })?.externalId).toBe("p2");
  });

  it("resolves a pronoun against a single result when nothing is anchored yet", () => {
    expect(
      resolveAnchor({ message: "does that come in navy", lastShown: [shown[0]], current: null })?.externalId
    ).toBe("p1");
  });

  it("refuses an ambiguous pronoun rather than guessing the first result", () => {
    expect(resolveAnchor({ message: "does that come in navy", lastShown: shown, current: null })).toBeNull();
  });

  it("keeps the current anchor when the message references nothing", () => {
    const current = toAnchor(shown[0]);
    expect(resolveAnchor({ message: "show me some trousers", lastShown: shown, current })?.externalId).toBe("p1");
  });
});

describe("resolveAnchor — a pinned anchor", () => {
  const current = toAnchor(shown[0]);

  it("beats an ordinal that would otherwise move it", () => {
    // The pin is shown back to the shopper above the composer. Letting an inferred reference
    // silently override it would put the visible UI and the conversation on different products.
    const resolved = resolveAnchor({ message: "what about the third one", lastShown: shown, current, pinned: true });
    expect(resolved?.externalId).toBe("p1");
  });

  it("beats an ambiguous pronoun that would otherwise resolve to nothing", () => {
    const resolved = resolveAnchor({ message: "does that come in navy", lastShown: shown, current, pinned: true });
    expect(resolved?.externalId).toBe("p1");
  });

  it("still yields to a product the shopper names outright", () => {
    // Naming a title is at least as explicit as the click that set the pin, and leaves nothing
    // to interpret — so it moves, rather than being ignored in favour of the pin.
    const resolved = resolveAnchor({
      message: "actually show me the Waffle Knit Tee",
      lastShown: shown,
      current,
      pinned: true,
    });
    expect(resolved?.externalId).toBe("p3");
  });

  it("changes nothing when there is no anchor behind the flag", () => {
    const resolved = resolveAnchor({ message: "the second one", lastShown: shown, current: null, pinned: true });
    expect(resolved?.externalId).toBe("p2");
  });

  it("leaves the unpinned path exactly as it was", () => {
    const resolved = resolveAnchor({ message: "what about the third one", lastShown: shown, current, pinned: false });
    expect(resolved?.externalId).toBe("p3");
  });
});

describe("resolveBundleSwapTargets", () => {
  const discussed: DiscussedBundleItem[] = [
    { externalId: "top-1", category: "tops", price: 40 },
    { externalId: "bottom-1", category: "bottoms", price: 60 },
    { externalId: "shoe-1", category: "footwear", price: 90 },
  ];

  it("matches the one discussed item whose category the message names", () => {
    expect(resolveBundleSwapTargets("can you replace the pants?", discussed)).toEqual([discussed[1]]);
  });

  it("matches every item named in one message", () => {
    expect(resolveBundleSwapTargets("swap the shirt and the shoes", discussed)).toEqual([discussed[0], discussed[2]]);
  });

  it("returns nothing when the message names no recognisable category", () => {
    expect(resolveBundleSwapTargets("does this look good?", discussed)).toEqual([]);
  });

  it("returns nothing when nothing is being discussed", () => {
    expect(resolveBundleSwapTargets("replace the pants", null)).toEqual([]);
    expect(resolveBundleSwapTargets("replace the pants", [])).toEqual([]);
  });

  it("ignores a named category that isn't part of this bundle", () => {
    // Only tops/bottoms/footwear are in this bundle — a jacket was never part of it.
    expect(resolveBundleSwapTargets("replace the jacket", discussed)).toEqual([]);
  });
});
