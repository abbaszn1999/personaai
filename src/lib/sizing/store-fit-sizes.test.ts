import { describe, expect, it } from "vitest";
import { needsStoreLabels, storeLabelsFor } from "./store-fit-sizes";

const XINT = [
  { raw: "46", canonical: "S" },
  { raw: "48", canonical: "M" },
  { raw: "50", canonical: "L" },
  { raw: "52", canonical: "XL" },
  { raw: "54", canonical: "XXL" },
];
const STOCKED = ["46", "48", "50", "52", "54"];

describe("storeLabelsFor", () => {
  it("replaces the chart's letter with the number the store sells", () => {
    expect(storeLabelsFor(["M", "L"], XINT, STOCKED)).toEqual(["48", "50"]);
  });

  it("keeps a size the store already sells as it is", () => {
    expect(storeLabelsFor(["36"], [{ raw: "36", canonical: "36" }], ["34", "36"])).toEqual(["36"]);
    expect(storeLabelsFor(["M"], [], ["S", "M", "L"])).toEqual(["M"]);
  });

  it("skips a size that is sold out and falls through to the next one", () => {
    expect(storeLabelsFor(["M", "L"], XINT, ["46", "50"])).toEqual(["50"]);
  });

  it("returns null when nothing can be placed, so the caller keeps what it had", () => {
    expect(storeLabelsFor(["M"], [], ["46", "48"])).toBeNull();
  });

  it("does not repeat a store size two chart labels map to", () => {
    const matches = [
      { raw: "48", canonical: "M" },
      { raw: "48", canonical: "M/L" },
    ];
    expect(storeLabelsFor(["M", "M/L"], matches, ["48"])).toEqual(["48"]);
  });
});

describe("needsStoreLabels", () => {
  it("is true only when the chart sizes are not among the stocked ones", () => {
    expect(needsStoreLabels({ fitSizes: ["M"], attributes: { size: ["46", "48"] } })).toBe(true);
    expect(needsStoreLabels({ fitSizes: ["M"], attributes: { size: ["S", "M"] } })).toBe(false);
    expect(needsStoreLabels({ fitSizes: ["M"], attributes: {} })).toBe(false);
    expect(needsStoreLabels({ attributes: { size: ["46"] } })).toBe(false);
  });
});
