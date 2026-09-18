import { describe, expect, it } from "vitest";
import { toSizingBrands } from "./brand-list";
import { sizeTypeFor } from "./size-types";

describe("toSizingBrands", () => {
  it("returns each brand once, alphabetically", () => {
    expect(toSizingBrands(["Zara", "Adidas", "Nike", "Adidas"])).toEqual([
      { brandKey: "adidas", name: "Adidas" },
      { brandKey: "nike", name: "Nike" },
      { brandKey: "zara", name: "Zara" },
    ]);
  });

  it("skips missing and blank names", () => {
    expect(toSizingBrands([null, "Nike", undefined, "", "   "])).toEqual([{ brandKey: "nike", name: "Nike" }]);
  });

  it("trims the displayed name", () => {
    expect(toSizingBrands(["  Nike  "])).toEqual([{ brandKey: "nike", name: "Nike" }]);
  });

  it("folds casing and punctuation differences onto one brand", () => {
    // A catalog spelling one brand two ways would otherwise offer two rows, and let a merchant set
    // two conflicting sizing systems for it.
    expect(toSizingBrands(["LEVI'S", "Levi's", "levi s"])).toEqual([{ brandKey: "levi_s", name: "LEVI'S" }]);
  });

  it("keeps the first spelling seen, so the platform's list wins over a sampled product", () => {
    // The route passes the platform's own index first — it is the authoritative spelling.
    expect(toSizingBrands(["LIU.JO", "liu jo"])).toEqual([{ brandKey: "liu_jo", name: "LIU.JO" }]);
  });

  it("drops a name that normalizes to nothing", () => {
    // It would land on the unknown-brand key, where an exception would claim to describe every
    // unbranded product rather than one brand.
    expect(toSizingBrands(["---", "!!"])).toEqual([]);
  });

  it("produces keys that resolve through sizeTypeFor", () => {
    // The point of the whole exercise: a key saved from this list has to match the brand later.
    const [brand] = toSizingBrands(["Levi's"]);

    expect(sizeTypeFor("Levi's", { default: "Alpha", overrides: { [brand.brandKey]: "EU" } })).toBe("EU");
  });
});
