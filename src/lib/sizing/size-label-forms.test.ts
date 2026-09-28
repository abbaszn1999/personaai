import { describe, expect, it } from "vitest";
import { matchLabel } from "./canonical";
import { normalizeSizeLabel } from "./keys";
import { sizeLabelCandidates } from "./size-label-forms";

describe("sizeLabelCandidates", () => {
  it.each([
    ["XSMALL", "XS"],
    ["Extra Small", "XS"],
    ["x-small", "XS"],
    ["SMALL", "S"],
    ["Med", "M"],
    ["MEDIUM", "M"],
    ["Large", "L"],
    ["2XL", "XXL"],
    ["XX Large", "XXL"],
    ["one size", "ONE SIZE"],
    ["OSFA", "ONE SIZE"],
    ["Free Size", "ONE SIZE"],
    ["08", "8"],
    ["8 1/2", "8.5"],
    ["8,5", "8.5"],
    ["3-MOIS", "3M"],
    ["3 months", "3M"],
    ["newborn", "NB"],
    ["2 years", "2Y"],
    ["34/31", "3431"],
    ["34x31", "3431"],
  ])("maps %s to %s", (raw, expected) => {
    expect(sizeLabelCandidates(raw)).toContain(expected);
  });

  it("offers both sides of a compound label", () => {
    expect(sizeLabelCandidates("M (38)")).toEqual(["M (38)", "M", "38"]);
    expect(sizeLabelCandidates("38 / M")).toEqual(["38 / M", "38", "M"]);
  });

  it("strips only the declared regional prefix", () => {
    expect(sizeLabelCandidates("US 8", "us")).toContain("8");
    expect(sizeLabelCandidates("EU 38", "us")).toEqual(["EU 38"]);
  });

  it("does not conflate US plus sizing with XL multiples", () => {
    expect(sizeLabelCandidates("2X")).toEqual(["2X"]);
    expect(sizeLabelCandidates("2XL")).toContain("XXL");
  });

  it("does not change the stable coverage-key normalizer", () => {
    expect(normalizeSizeLabel(" medium ")).toBe("MEDIUM");
    expect(normalizeSizeLabel("x-small")).toBe("X-SMALL");
  });
});

describe("matchLabel with equivalent forms", () => {
  it("matches merchant words against chart abbreviations", () => {
    const match = matchLabel("medium", [{ size: "M", aliases: { alpha: "M" } }], "Alpha");
    expect(match.row?.size).toBe("M");
    expect(match.matchedVia).toBe("alpha");
  });

  it("does not strip a conflicting regional prefix", () => {
    const match = matchLabel("EU 38", [{ size: "8", aliases: { us: "8", eu: "38" } }], "US");
    expect(match.row).toBeNull();
  });
});
