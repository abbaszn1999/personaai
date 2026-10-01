import { describe, expect, it } from "vitest";
import { buildPathConfig } from "@/lib/catalog/path-config/build";
import { CONFIG, CONNECTION_ID, acsProduct } from "../__fixtures__/catalog";
import { describeSpec, toAcsFilter } from "./acs-translator";
import { parseNumericValue, suggestPaths, validateSearchIntent } from "./validate-intent";

describe("validateSearchIntent", () => {
  it("accepts a stocked path and adds the unisex counterpart", () => {
    const result = validateSearchIntent(CONFIG, { path: "Women > Bottom > Trouser" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.paths).toEqual(["women > bottom > trouser", "unisex > bottom > trouser"]);
    expect(result.counterpart?.path).toBe("unisex > bottom > trouser");
  });

  it("adds the kids-unisex twin for a kids department", () => {
    const config = buildPathConfig([
      acsProduct("g", "kids-girls > top > t-shirt", 12),
      acsProduct("k", "kids-unisex > top > t-shirt", 10),
    ]);
    const result = validateSearchIntent(config, { path: "kids-girls > top > t-shirt" });
    expect(result.ok && result.spec.paths).toEqual(["kids-girls > top > t-shirt", "kids-unisex > top > t-shirt"]);
  });

  it("rejects an unstocked path with nearby suggestions", () => {
    const result = validateSearchIntent(CONFIG, { path: "women > bottom > jeans" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]).toContain("not stocked");
    expect(result.problems[0]).toContain("women > bottom");
  });

  it("canonicalizes brand and attribute spelling", () => {
    const result = validateSearchIntent(CONFIG, {
      path: "women > bottom > trouser",
      brands: ["acme", "zed"],
      attributes: [{ key: "Color", values: ["black", "OLIVE"] }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.brands).toEqual(["Acme", "Zed"]);
    expect(result.spec.attributes).toEqual([{ key: "color", field: "colors", kind: "text", values: ["Black", "Olive"] }]);
  });

  it("names every unknown brand, attribute and value", () => {
    const result = validateSearchIntent(CONFIG, {
      path: "women > bottom > trouser",
      brands: ["Nope"],
      attributes: [
        { key: "color", values: ["purple"] },
        { key: "sleeve", values: ["long"] },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(3);
    expect(result.problems.join("\n")).toMatch(/brand "Nope"/);
    expect(result.problems.join("\n")).toMatch(/color "purple" is not stocked/);
    expect(result.problems.join("\n")).toMatch(/attribute "sleeve" does not exist/);
  });

  it("parses numeric attributes as ranges", () => {
    const result = validateSearchIntent(CONFIG, {
      path: "women > bottom > trouser",
      attributes: [{ key: "inseam", values: ["30..32"] }],
    });
    expect(result.ok && result.spec.attributes[0]).toEqual({
      key: "inseam",
      field: "attributes.inseam",
      kind: "number",
      min: 30,
      max: 32,
    });
  });

  it("rejects an inverted window and a ceiling below the floor", () => {
    const inverted = validateSearchIntent(CONFIG, { path: "women > bottom > trouser", price_min: 80, price_max: 50 });
    expect(inverted.ok).toBe(false);
    const tooLow = validateSearchIntent(CONFIG, { path: "women > bottom > trouser", price_max: 10 });
    expect(tooLow.ok).toBe(false);
    if (tooLow.ok) return;
    expect(tooLow.problems[0]).toContain("cheapest in stock is 40");
  });

  it("sends every stored spelling of a brand and a value, since ACS matches exactly", () => {
    const config = buildPathConfig([
      acsProduct("a", "men > top > shirt", 30, { brands: ["MOUSTACHE MEN"], colorInfo: { colors: ["BLACK"] } }),
      acsProduct("b", "men > top > shirt", 40, { brands: ["Moustache Men"], colorInfo: { colors: ["Black"] } }),
    ]);
    const result = validateSearchIntent(config, {
      path: "men > top > shirt",
      brands: ["moustache men"],
      attributes: [{ key: "color", values: ["black"] }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.brands.sort()).toEqual(["MOUSTACHE MEN", "Moustache Men"]);
    const color = result.spec.attributes[0];
    expect(color.kind === "text" && [...color.values].sort()).toEqual(["BLACK", "Black"]);
  });

  it("accepts only sizes stocked on the path, in every stored spelling", () => {
    const config = buildPathConfig([
      acsProduct("a", "men > top > shirt", 30, { sizes: ["m", "L"] }),
      acsProduct("b", "men > top > shirt", 40, { sizes: ["M", "XL"] }),
    ]);
    const ok = validateSearchIntent(config, { path: "men > top > shirt", sizes: ["M"] });
    expect(ok.ok && [...ok.spec.sizes].sort()).toEqual(["M", "m"].sort());
    const word = validateSearchIntent(config, { path: "men > top > shirt", sizes: ["Medium"] });
    expect(word.ok && [...word.spec.sizes].sort()).toEqual(["M", "m"].sort());

    const missing = validateSearchIntent(config, { path: "men > top > shirt", sizes: ["XXS"] });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.problems[0]).toMatch(/size "XXS" is not listed/);
    expect(missing.problems[0]).toContain("XL");

    const none = validateSearchIntent(CONFIG, { path: "women > top" });
    expect(none.ok && none.spec.sizes).toEqual([]);
  });

  it("exposes merchant genders as a filterable attribute", () => {
    const config = buildPathConfig([acsProduct("a", "unisex > top > t-shirt", 20, { genders: ["female"] })]);
    const result = validateSearchIntent(config, {
      path: "unisex > top > t-shirt",
      attributes: [{ key: "gender", values: ["Female"] }],
    });
    expect(result.ok && result.spec.attributes).toEqual([
      { key: "gender", field: "genders", kind: "text", values: ["female"] },
    ]);
  });

  it("dedupes excluded ids", () => {
    const result = validateSearchIntent(CONFIG, { path: "women > top", exclude_ids: ["a", "a", ""] });
    expect(result.ok && result.spec.excludeIds).toEqual(["a"]);
  });
});

describe("parseNumericValue", () => {
  it("reads open and closed ranges and single values", () => {
    expect(parseNumericValue("30..34")).toEqual({ min: 30, max: 34 });
    expect(parseNumericValue("..34")).toEqual({ min: null, max: 34 });
    expect(parseNumericValue("30..")).toEqual({ min: 30, max: null });
    expect(parseNumericValue("32")).toEqual({ min: 32, max: 32 });
    expect(parseNumericValue("long")).toBeNull();
  });
});

describe("suggestPaths", () => {
  it("returns stocked paths sharing a word", () => {
    expect(suggestPaths(CONFIG, "men > trouser")).toContain("women > bottom > trouser");
    expect(suggestPaths(CONFIG, "")).toEqual([]);
  });
});

describe("toAcsFilter", () => {
  it("builds every clause and always requires stock", () => {
    const filter = toAcsFilter(
      {
        paths: ["women > bottom > trouser", "unisex > bottom > trouser"],
        brands: ["Acme"],
        priceMin: null,
        priceMax: 60,
        attributes: [
          { key: "color", field: "colors", kind: "text", values: ["Black"] },
          { key: "inseam", field: "attributes.inseam", kind: "number", min: 30, max: null },
        ],
        sizes: ["M"],
        excludeIds: ["w-trouser-1"],
      },
      CONNECTION_ID
    );
    expect(filter).toBe(
      [
        `(categories: ANY("persona > women > bottom > trouser", "persona > unisex > bottom > trouser"))`,
        `(brands: ANY("Acme"))`,
        `(price: IN(*, 60i))`,
        `(availability: ANY("IN_STOCK"))`,
        `(sizes: ANY("M"))`,
        `(colors: ANY("Black"))`,
        `(attributes.inseam: IN(30i, *))`,
        `(NOT productId: ANY("${CONNECTION_ID}_w-trouser-1"))`,
      ].join(" AND ")
    );
  });

  it("escapes quotes in values", () => {
    const filter = toAcsFilter(
      { paths: [], brands: ['Say "Hi"'], priceMin: null, priceMax: null, attributes: [], sizes: [], excludeIds: [] },
      CONNECTION_ID
    );
    expect(filter).toContain(`(brands: ANY("Say \\"Hi\\""))`);
  });

  it("describes a spec in shopper terms", () => {
    expect(
      describeSpec(
        { paths: ["women > top"], brands: [], priceMin: 20, priceMax: 50, attributes: [], sizes: [], excludeIds: [] },
        "USD"
      )
    ).toEqual(["category: women > top", "price: USD 20–USD 50"]);
  });
});
