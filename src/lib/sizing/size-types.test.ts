import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIZE_TYPE,
  parseSizeType,
  parseSizeTypeOverrides,
  sizeTypeFor,
} from "./size-types";

describe("sizeTypeFor", () => {
  it("falls back to the store default for a brand with no exception", () => {
    expect(sizeTypeFor("Nike", "Alpha", {})).toBe("Alpha");
  });

  it("uses the brand's exception when it has one", () => {
    expect(sizeTypeFor("Nike", "Alpha", { nike: "EU" })).toBe("EU");
  });

  it("matches the brand however the catalog happens to case it", () => {
    // Overrides are keyed on the normalized brand key for exactly this reason: a catalog writing
    // "Levi's", "LEVI'S" and "levi's " across three products is one brand with one sizing system.
    expect(sizeTypeFor("LEVI'S", "US", { levi_s: "EU" })).toBe("EU");
    expect(sizeTypeFor("levi's ", "US", { levi_s: "EU" })).toBe("EU");
  });

  it("leaves other brands on the default", () => {
    expect(sizeTypeFor("Adidas", "Alpha", { nike: "EU" })).toBe("Alpha");
  });

  it("ignores an exception naming a system this build does not have", () => {
    expect(sizeTypeFor("Nike", "Alpha", { nike: "JP" as never })).toBe("Alpha");
  });

  it("resolves unbranded products to the store default rather than throwing", () => {
    expect(sizeTypeFor(null, "Numeric", {})).toBe("Numeric");
  });
});

describe("parseSizeType", () => {
  it("keeps a recognised system", () => {
    expect(parseSizeType("EU")).toBe("EU");
  });

  it("falls back to the default rather than rejecting, so overrides sent alongside survive", () => {
    expect(parseSizeType("JP")).toBe(DEFAULT_SIZE_TYPE);
    expect(parseSizeType(undefined)).toBe(DEFAULT_SIZE_TYPE);
  });
});

describe("parseSizeTypeOverrides", () => {
  it("drops entries naming a system this build does not have", () => {
    expect(parseSizeTypeOverrides({ nike: "EU", adidas: "JP" })).toEqual({ nike: "EU" });
  });

  it("returns an empty map for anything that is not an object", () => {
    expect(parseSizeTypeOverrides(null)).toEqual({});
    expect(parseSizeTypeOverrides(["EU"])).toEqual({});
  });
});
