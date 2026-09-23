import { describe, expect, it } from "vitest";
import {
  audienceCompatible,
  audienceForPersonaPath,
  chartsForLeaf,
  leafOfPersonaPath,
  sanitizeCoverage,
  variantTags,
  type MatchableVariant,
} from "./variant-match";

/**
 * The fixtures below are drawn from the real seeded Tommy Hilfiger `covers_leaves` values (see
 * `src/lib/sizing/seeds/tommy-hilfiger.ts` and `tommy-hilfiger-kids.ts`), grouped as
 * `indexAssignableVariants` groups them — one list per `(sizing_category)` across every audience
 * that publishes into it.
 */
const WOMENS_BOTTOMS: MatchableVariant[] = [
  {
    variantName: "Women",
    coversLeaves: [
      "women:bottom:trouser",
      "women:bottom:skirt",
      "women:bottom:short",
      "women:bottom:legging",
      "women:bottom:culotte",
      "women:bottom:activewear-bottom",
      "women:bottom:sleep-bottom",
    ],
  },
  { variantName: "Women Denim", coversLeaves: ["women:bottom:jean"] },
  { variantName: "Women Swim & Beach Bottoms", coversLeaves: ["women:bottom:swim-bottom"] },
];

const MENS_OUTERWEAR: MatchableVariant[] = [
  { variantName: "Men Tailored", coversLeaves: ["men:outerwear:blazer", "men:outerwear:suit-jacket"] },
  { variantName: "Men Tailored Long", coversLeaves: [] },
  { variantName: "Men Tailored Short", coversLeaves: [] },
  { variantName: "Men Big & Tall", coversLeaves: [] },
];

const WOMENS_TOPS: MatchableVariant[] = [
  { variantName: "Women", coversLeaves: ["women:top:tank-top", "women:top:camisole"] },
  { variantName: "Women Shirts & Blouses", coversLeaves: ["women:top:shirt", "women:top:blouse"] },
  { variantName: "Women Bras (Wired)", coversLeaves: ["women:top:bra"] },
];

const WOMENS_FOOTWEAR: MatchableVariant[] = [
  {
    variantName: "Women",
    coversLeaves: [
      "women:footwear:heel",
      "women:footwear:flat",
      "women:footwear:sneaker",
      "women:footwear:boot",
      "women:footwear:sandal",
      "women:footwear:loafer",
      "women:footwear:mule",
      "women:footwear:wedge",
      "women:footwear:slipper",
    ],
  },
  { variantName: "Women Socks", coversLeaves: ["women:footwear:sock"] },
];

const KIDS_BATHROBE: MatchableVariant[] = [
  {
    variantName: "Kids Bathrobes",
    coversLeaves: ["kids-boys:full-body:bathrobe", "kids-girls:full-body:bathrobe", "kids-unisex:full-body:bathrobe"],
  },
];

describe("audienceForPersonaPath", () => {
  it("reads the audience off the department, for all six", () => {
    expect(audienceForPersonaPath("women:bottom:jean")).toBe("womens");
    expect(audienceForPersonaPath("men:top:shirt")).toBe("mens");
    expect(audienceForPersonaPath("unisex:top:hoodie")).toBe("unisex");
    expect(audienceForPersonaPath("kids-boys:bottom:short")).toBe("boys");
    expect(audienceForPersonaPath("kids-girls:full-body:dress")).toBe("girls");
    expect(audienceForPersonaPath("kids-unisex:top:t-shirt")).toBe("kids");
  });

  /**
   * The reason this is not `audienceFor`. That function regex-matches free text and answers `unisex`
   * both for a real unisex path and for "nothing resolved", which is why auto-match had to discard the
   * answer entirely. Here `unisex` means unisex and a non-Persona key means null.
   */
  it("returns null for a merchant category id rather than guessing", () => {
    expect(audienceForPersonaPath("4021")).toBeNull();
    expect(audienceForPersonaPath("sale-tops")).toBeNull();
  });

  it("survives a category-level mapping, which has no leaf", () => {
    expect(audienceForPersonaPath("women:bottom:")).toBe("womens");
    expect(leafOfPersonaPath("women:bottom:")).toBe("");
    expect(leafOfPersonaPath("women:bottom:jean")).toBe("jean");
    expect(leafOfPersonaPath("4021")).toBe("");
  });
});

describe("audienceCompatible", () => {
  /** The reported bug: a womens bottoms path offered `Boys`, `Girls` and `Infant`, whose rows are
   *  keyed on a child's height in the 62-68cm range. */
  it("never crosses the adult/child line", () => {
    for (const child of ["boys", "girls", "kids"] as const) {
      for (const adult of ["mens", "womens", "unisex"] as const) {
        expect(audienceCompatible(adult, child), `${adult} <- ${child}`).toBe(false);
        expect(audienceCompatible(child, adult), `${child} <- ${adult}`).toBe(false);
      }
    }
  });

  it("treats all children as interchangeable, so an Infant table can serve a kids-boys path", () => {
    expect(audienceCompatible("boys", "kids")).toBe(true);
    expect(audienceCompatible("kids", "girls")).toBe(true);
    expect(audienceCompatible("girls", "boys")).toBe(true);
  });

  it("keeps mens and womens apart, since the same label is a different chest range", () => {
    expect(audienceCompatible("womens", "mens")).toBe(false);
    expect(audienceCompatible("mens", "womens")).toBe(false);
  });

  it("lets unisex bridge in both directions", () => {
    expect(audienceCompatible("womens", "unisex")).toBe(true);
    expect(audienceCompatible("unisex", "mens")).toBe(true);
  });
});

describe("variantTags", () => {
  it("reads the fit class from the variant name", () => {
    expect(variantTags("Men Tailored Short").fit).toEqual(["short"]);
    // "Big & Tall" matches both its own pattern and the bare `tall` pattern — "tall" is a standalone
    // word inside it too, and the sole candidate this leaves for `withoutFitClass` to refuse is the
    // same either way.
    expect(variantTags("Men Big & Tall").fit).toEqual(["big-tall", "tall"]);
    expect(variantTags("Women Petite").fit).toEqual(["petite"]);
  });

  it("reads several fit tags off one variant when the name states more than one", () => {
    expect(variantTags("Men Tall & Slim").fit).toEqual(["tall", "slim"]);
  });

  /** `Regular` names the absence of a fit class. Tagging it would leave a brand's default table with
   *  nothing to fall back to, and `chartsForLeaf` would never be able to auto-pick it. */
  it("does not treat Regular as a fit class", () => {
    expect(variantTags("Women Regular").fit).toEqual([]);
    expect(variantTags("Men Regular").fit).toEqual([]);
  });

  it("finds no fit tag on a plain table with no fit line named", () => {
    expect(variantTags("Men").fit).toEqual([]);
    expect(variantTags("Women Denim").fit).toEqual([]);
  });
});

describe("chartsForLeaf", () => {
  it("sends jean to the denim table and trouser to the base one", () => {
    expect(chartsForLeaf("women:bottom:jean", WOMENS_BOTTOMS)?.variantName).toBe("Women Denim");
    expect(chartsForLeaf("women:bottom:trouser", WOMENS_BOTTOMS)?.variantName).toBe("Women");
    expect(chartsForLeaf("women:bottom:skirt", WOMENS_BOTTOMS)?.variantName).toBe("Women");
  });

  it("sends a swim leaf to the swim table", () => {
    expect(chartsForLeaf("women:bottom:swim-bottom", WOMENS_BOTTOMS)?.variantName).toBe(
      "Women Swim & Beach Bottoms"
    );
  });

  /**
   * `bra` used to have no leaf a merchant could ever map onto, which meant this real seeded chart
   * could never be reached by auto-match. Also proves the fit-class guard does not misfire on it:
   * "Wired" is a garment-type word, not one of `VARIANT_FIT_PATTERNS`, so it carries no fit tag.
   */
  it("sends bra to the wired bra table, the sole chart that claims that leaf", () => {
    expect(chartsForLeaf("women:top:bra", WOMENS_TOPS)?.variantName).toBe("Women Bras (Wired)");
  });

  it("does not let t-shirt inherit the shirt leaf's chart", () => {
    // `shirt` and `blouse` are explicitly listed on the specialized table; `t-shirt` is a different
    // leaf entirely and is not, so it resolves to nothing here rather than borrowing a collar-keyed
    // table.
    expect(chartsForLeaf("women:top:shirt", WOMENS_TOPS)?.variantName).toBe("Women Shirts & Blouses");
    expect(chartsForLeaf("women:top:blouse", WOMENS_TOPS)?.variantName).toBe("Women Shirts & Blouses");
    expect(chartsForLeaf("women:top:t-shirt", WOMENS_TOPS)).toBeNull();
  });

  it("picks the tailored table for a blazer and ignores its length variants", () => {
    // `Men Tailored Long` and `Men Tailored Short` never carry a leaf at all — a fit class describes
    // the shopper's own proportions, not the garment, so the unqualified table is the only reachable
    // answer.
    expect(chartsForLeaf("men:outerwear:blazer", MENS_OUTERWEAR)?.variantName).toBe("Men Tailored");
    expect(chartsForLeaf("men:outerwear:suit-jacket", MENS_OUTERWEAR)?.variantName).toBe("Men Tailored");
  });

  it("resolves sock to the socks table and leaves the base table for everything else", () => {
    expect(chartsForLeaf("women:footwear:sock", WOMENS_FOOTWEAR)?.variantName).toBe("Women Socks");
    expect(chartsForLeaf("women:footwear:sneaker", WOMENS_FOOTWEAR)?.variantName).toBe("Women");
  });

  it("resolves bathrobe to its sole seeded chart, shared across three kids departments", () => {
    expect(chartsForLeaf("kids-boys:full-body:bathrobe", KIDS_BATHROBE)?.variantName).toBe("Kids Bathrobes");
    expect(chartsForLeaf("kids-girls:full-body:bathrobe", KIDS_BATHROBE)?.variantName).toBe("Kids Bathrobes");
    expect(chartsForLeaf("kids-unisex:full-body:bathrobe", KIDS_BATHROBE)?.variantName).toBe("Kids Bathrobes");
  });

  it("returns null when no candidate claims the leaf", () => {
    expect(
      chartsForLeaf("women:bottom:culotte", [
        { variantName: "Women Denim", coversLeaves: ["women:bottom:jean"] },
      ])
    ).toBeNull();
  });

  it("returns null for an empty leaf key — a category-level mapping with no leaf chosen", () => {
    expect(chartsForLeaf("", WOMENS_BOTTOMS)).toBeNull();
  });

  it("still resolves a sole candidate that carries no fit class", () => {
    expect(
      chartsForLeaf("men:outerwear:blazer", [
        { variantName: "Women", coversLeaves: ["men:outerwear:blazer"] },
      ])?.variantName
    ).toBe("Women");
    expect(chartsForLeaf("anything", [])).toBeNull();
  });

  /**
   * The belt-and-braces guard from `chartsForLeaf`'s own docstring: chart authors should never put a
   * leaf on a fit-class table's `covers_leaves`, but a private brand whose entire tops list is
   * `Men Big & Tall` must not have every ordinary top auto-assigned to it on nothing more than being
   * alone in the list.
   */
  it("refuses to auto-pick a sole candidate that itself carries a fit class", () => {
    const onlyBigTall: MatchableVariant[] = [
      { variantName: "Men Big & Tall", coversLeaves: ["men:top:t-shirt"] },
    ];
    expect(chartsForLeaf("men:top:t-shirt", onlyBigTall)).toBeNull();
  });

  it("takes the plain table over a fit-class sibling when both claim the same leaf", () => {
    const candidates: MatchableVariant[] = [
      { variantName: "Men Regular", coversLeaves: ["men:top:t-shirt"] },
      { variantName: "Men Tall", coversLeaves: ["men:top:t-shirt"] },
    ];
    expect(chartsForLeaf("men:top:t-shirt", candidates)?.variantName).toBe("Men Regular");
  });

  it("refuses when every table claiming the leaf carries a fit class", () => {
    const candidates: MatchableVariant[] = [
      { variantName: "Men Tall", coversLeaves: ["men:top:t-shirt"] },
      { variantName: "Men Big & Tall", coversLeaves: ["men:top:t-shirt"] },
    ];
    expect(chartsForLeaf("men:top:t-shirt", candidates)).toBeNull();
  });

  /**
   * The age-disjoint kids case this is modelled on: Tommy's `Infant` tables cover 44-92cm and its
   * `Boys` tables cover 98-176cm, two sequential age bands rather than two readings of one child.
   * Both legitimately claiming one leaf is how that surfaces now — deliberately, since only the
   * merchant knows the age band this stock is sized for.
   */
  it("refuses to choose between two tables that both legitimately claim the same leaf", () => {
    const kids: MatchableVariant[] = [
      { variantName: "Boys", coversLeaves: ["kids-unisex:footwear:sneaker"] },
      { variantName: "Infant", coversLeaves: ["kids-unisex:footwear:sneaker"] },
    ];
    expect(chartsForLeaf("kids-unisex:footwear:sneaker", kids)).toBeNull();
  });
});

describe("sanitizeCoverage", () => {
  it("keeps a real leaf whose audience and group match the chart", () => {
    expect(sanitizeCoverage(["men:top:t-shirt"], "mens", "tops")).toEqual(["men:top:t-shirt"]);
  });

  it("drops anything that is not a real Persona leaf key", () => {
    expect(sanitizeCoverage(["not-a-leaf", 42, null, "men:top:not-a-real-sub"], "mens", "tops")).toEqual([]);
  });

  it("drops a leaf whose department is not audience-compatible with the chart", () => {
    // A women's leaf claimed on a men's chart — the wrong-half-the-time mistake `audienceCompatible`
    // exists to block everywhere else in this module.
    expect(sanitizeCoverage(["women:top:t-shirt"], "mens", "tops")).toEqual([]);
  });

  it("lets a unisex chart claim leaves from either adult department", () => {
    expect(sanitizeCoverage(["women:top:t-shirt", "men:top:t-shirt"], "unisex", "tops")).toEqual([
      "women:top:t-shirt",
      "men:top:t-shirt",
    ]);
  });

  it("drops a leaf whose category does not match the chart's own sizing group", () => {
    // A tops chart cannot claim an outerwear leaf, no matter how plausible the audience.
    expect(sanitizeCoverage(["men:outerwear:blazer"], "mens", "tops")).toEqual([]);
  });

  it("returns an empty list for anything that is not an array", () => {
    expect(sanitizeCoverage(undefined, "mens", "tops")).toEqual([]);
    expect(sanitizeCoverage(null, "mens", "tops")).toEqual([]);
    expect(sanitizeCoverage("men:top:t-shirt", "mens", "tops")).toEqual([]);
  });
});
