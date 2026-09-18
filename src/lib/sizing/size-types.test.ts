import { describe, expect, it } from "vitest";
import { DEFAULT_SIZE_TYPE, parseSizeSettings, sizeTypeFor } from "./size-types";

describe("sizeTypeFor", () => {
  it("falls back to the store default for a brand with no exception", () => {
    expect(sizeTypeFor("Nike", { default: "Alpha", overrides: {} })).toBe("Alpha");
  });

  it("uses the brand's exception when it has one", () => {
    expect(sizeTypeFor("Nike", { default: "Alpha", overrides: { nike: "EU" } })).toBe("EU");
  });

  it("matches the brand however the catalog happens to case it", () => {
    // Overrides are keyed on the normalized brand key for exactly this reason: a catalog writing
    // "Levi's", "LEVI'S" and "levi's " across three products is one brand with one sizing system.
    expect(sizeTypeFor("LEVI'S", { default: "US", overrides: { levi_s: "EU" } })).toBe("EU");
    expect(sizeTypeFor("levi's ", { default: "US", overrides: { levi_s: "EU" } })).toBe("EU");
  });

  it("leaves other brands on the default", () => {
    expect(sizeTypeFor("Adidas", { default: "Alpha", overrides: { nike: "EU" } })).toBe("Alpha");
  });

  it("ignores an exception naming a system this build does not have", () => {
    expect(sizeTypeFor("Nike", { default: "Alpha", overrides: { nike: "JP" as never } })).toBe("Alpha");
  });

  it("resolves unbranded products to the store default rather than throwing", () => {
    expect(sizeTypeFor(null, { default: "Numeric", overrides: {} })).toBe("Numeric");
  });
});

describe("parseSizeSettings", () => {
  it("keeps a recognised default system", () => {
    expect(parseSizeSettings({ default: "EU", overrides: {} })).toEqual({ default: "EU", overrides: {} });
  });

  it("falls back the default to Alpha rather than rejecting the whole value", () => {
    expect(parseSizeSettings({ default: "JP", overrides: {} })).toEqual({ default: DEFAULT_SIZE_TYPE, overrides: {} });
    expect(parseSizeSettings(undefined)).toEqual({ default: DEFAULT_SIZE_TYPE, overrides: {} });
    expect(parseSizeSettings(null)).toEqual({ default: DEFAULT_SIZE_TYPE, overrides: {} });
    expect(parseSizeSettings(["EU"])).toEqual({ default: DEFAULT_SIZE_TYPE, overrides: {} });
  });

  it("drops override entries naming a system this build does not have", () => {
    expect(parseSizeSettings({ default: "US", overrides: { nike: "EU", adidas: "JP" } })).toEqual({
      default: "US",
      overrides: { nike: "EU" },
    });
  });

  it("tolerates a missing overrides object", () => {
    expect(parseSizeSettings({ default: "EU" })).toEqual({ default: "EU", overrides: {} });
  });

  it("normalizes an override key written as a display name", () => {
    // Otherwise it saves cleanly and then matches nothing, because `sizeTypeFor` looks up `levi_s`.
    expect(parseSizeSettings({ default: "US", overrides: { "Levi's": "EU" } })).toEqual({
      default: "US",
      overrides: { levi_s: "EU" },
    });
  });

  it("drops an override key that normalizes to nothing", () => {
    // The unknown-brand key: an exception there would claim to describe every unbranded product.
    expect(parseSizeSettings({ default: "US", overrides: { "!!": "EU", nike: "US" } })).toEqual({
      default: "US",
      overrides: { nike: "US" },
    });
  });
});
