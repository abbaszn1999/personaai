import { describe, expect, it } from "vitest";
import {
  audienceCompatible,
  audienceForPersonaPath,
  leafOfPersonaPath,
  sanitizeCoverage,
  variantTags,
} from "./variant-match";

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

  it("allows an explicit unisex chart but never guesses a gendered block for unisex stock", () => {
    expect(audienceCompatible("womens", "unisex")).toBe(true);
    expect(audienceCompatible("unisex", "mens")).toBe(false);
    expect(audienceCompatible("unisex", "unisex")).toBe(true);
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

  /** `Regular` names the absence of a fit class. */
  it("does not treat Regular as a fit class", () => {
    expect(variantTags("Women Regular").fit).toEqual([]);
    expect(variantTags("Men Regular").fit).toEqual([]);
  });

  it("finds no fit tag on a plain table with no fit line named", () => {
    expect(variantTags("Men").fit).toEqual([]);
    expect(variantTags("Women Denim").fit).toEqual([]);
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
