import { describe, expect, it } from "vitest";
import { CONFIG, PRODUCTS, acsProduct } from "@/lib/agents/__fixtures__/catalog";
import { buildPathConfig, computePriceTiers, detectCatalogLanguage, pathConfigFingerprint } from "./build";
import { descendantLeaves, findNode, floorPrice, normalizePath, toAcsCategory, unisexCounterpart } from "./lookup";
import { renderPathConfig } from "./render";

describe("buildPathConfig", () => {
  it("counts only in-stock PRIMARY products with an image", () => {
    expect(CONFIG.inStock).toBe(7);
    expect(findNode(CONFIG, "women > bottom > jeans")).toBeNull();
    const brands = findNode(CONFIG, "women > bottom > trouser")!.brands.map((brand) => brand.name);
    expect(brands).not.toContain("Variant");
    expect(brands).not.toContain("Blank");
  });

  it("builds department, category and leaf nodes with every brand", () => {
    const trouser = findNode(CONFIG, "women > bottom > trouser")!;
    expect(trouser.level).toBe("leaf");
    expect(trouser.inStock).toBe(3);
    expect(trouser.brands).toEqual([
      { name: "Acme", count: 2 },
      { name: "Bolt", count: 1 },
    ]);
    expect(trouser.priceRange).toEqual({ min: 40, max: 90 });

    const women = findNode(CONFIG, "women")!;
    expect(women.level).toBe("department");
    expect(women.inStock).toBe(6);
    expect(women.brands.map((brand) => brand.name)).toEqual(["Acme", "Bolt", "Cora", "Dash"]);
  });

  it("records native and numeric custom attributes", () => {
    const trouser = findNode(CONFIG, "women > bottom > trouser")!;
    const color = trouser.attributes.find((attribute) => attribute.key === "color");
    expect(color).toMatchObject({ field: "colors", kind: "text", values: ["Black", "Navy"] });
    const inseam = trouser.attributes.find((attribute) => attribute.key === "inseam");
    expect(inseam).toMatchObject({ field: "attributes.inseam", kind: "number", range: { min: 30, max: 34 } });
  });

  it("counts only products a size chart reached, since nothing else can ever be shown", () => {
    const unsized = { ...acsProduct("bare", "men > top > shirt", 999, { brands: ["Ghost"] }), attributes: {} };
    const groupOnly = {
      ...acsProduct("group-only", "men > top > shirt", 5, { brands: ["Half"] }),
      attributes: { fit_group: { text: ["tops"] } },
    };
    const config = buildPathConfig([acsProduct("sized", "men > top > shirt", 50, { brands: ["Real"] }), unsized, groupOnly]);
    const shirt = findNode(config, "men > top > shirt")!;
    expect(shirt.inStock).toBe(1);
    expect(shirt.brands.map((brand) => brand.name)).toEqual(["Real"]);
    expect(shirt.priceRange).toEqual({ min: 50, max: 50 });
    expect(shirt.tiers).toEqual([{ label: "A", min: 50, max: 50, count: 1 }]);
  });

  it("never lists the sizing bookkeeping as a shopper attribute", () => {
    const keys = CONFIG.nodes.flatMap((node) => node.attributes.map((attribute) => attribute.key));
    expect(keys.some((key) => key.startsWith("fit_"))).toBe(false);
  });

  it("uses the most common currency", () => {
    expect(CONFIG.currency).toBe("USD");
  });

  it("is deterministic regardless of product order", () => {
    const reversed = buildPathConfig([...PRODUCTS].reverse());
    expect(renderPathConfig(reversed)).toBe(renderPathConfig(CONFIG));
  });
});

describe("computePriceTiers", () => {
  it("returns nothing for no prices", () => {
    expect(computePriceTiers([])).toEqual([]);
  });

  it("collapses to one tier when prices barely differ", () => {
    expect(computePriceTiers([20, 21, 21])).toEqual([{ label: "A", min: 20, max: 21, count: 3 }]);
  });

  it("splits a wide range into three tiers that count every product once", () => {
    const tiers = computePriceTiers([10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(tiers.map((tier) => tier.label)).toEqual(["A", "B", "C"]);
    expect(tiers.reduce((sum, tier) => sum + tier.count, 0)).toBe(9);
  });

  it("keeps one tier when every product costs the same", () => {
    expect(computePriceTiers([450, 450, 450, 450])).toEqual([{ label: "A", min: 450, max: 450, count: 4 }]);
  });

  it("handles two products and ignores zero, negative and non-finite prices", () => {
    const tiers = computePriceTiers([0, -5, Number.NaN, 100, 900]);
    expect(tiers.reduce((sum, tier) => sum + tier.count, 0)).toBe(2);
    expect(tiers[0].min).toBe(100);
    expect(tiers[tiers.length - 1].max).toBe(900);
  });

  it("tiers are contiguous, ordered and cover the whole range with whole-unit bounds", () => {
    const prices = [349.5, 399, 450, 499, 599, 650, 799, 899, 999, 1299, 1499, 2499];
    const tiers = computePriceTiers(prices);
    expect(tiers.map((tier) => tier.label)).toEqual(["A", "B", "C"]);
    expect(tiers[0].min).toBe(349);
    expect(tiers[2].max).toBe(2499);
    expect(tiers[1].min).toBe(tiers[0].max);
    expect(tiers[2].min).toBe(tiers[1].max);
    expect(tiers.every((tier) => Number.isInteger(tier.min) && Number.isInteger(tier.max))).toBe(true);
    expect(tiers.reduce((sum, tier) => sum + tier.count, 0)).toBe(prices.length);
  });

  it("does not let one luxury outlier swallow the cheap tier", () => {
    const tiers = computePriceTiers([100, 110, 120, 130, 140, 150, 9000]);
    expect(tiers[0].max).toBeLessThan(200);
  });
});

describe("leaf title words", () => {
  it("keeps the descriptive words two or more titles share, never brands, colours, sizes or the garment", () => {
    const config = buildPathConfig([
      acsProduct("a", "men > top > shirt", 30, { title: "Moustache Linen Shirt Slim Fit White", brands: ["Moustache"], colorInfo: { colors: ["White"] }, sizes: ["M"] }),
      acsProduct("b", "men > top > shirt", 30, { title: "Linen Shirt Regular Fit Navy", brands: ["Moustache"], colorInfo: { colors: ["Navy"] } }),
      acsProduct("c", "men > top > shirt", 30, { title: "Oxford Shirt Slim Fit", brands: ["Moustache"] }),
    ]);
    const words = findNode(config, "men > top > shirt")!.words;
    expect(words).toEqual(["linen", "slim"]);
    expect(findNode(config, "men > top")!.words).toBeUndefined();
    expect(renderPathConfig(config)).toContain("title words: linen, slim");
  });
});

describe("detectCatalogLanguage", () => {
  it("reads the language the titles are written in", () => {
    expect(detectCatalogLanguage(["Slim Fit Oxford Shirt", "Regular Fit Jeans", "Pull-on Linen Shorts"])).toBe("English");
    expect(detectCatalogLanguage(["قميص قطن أبيض", "بنطلون جينز", "تيشيرت بولو"])).toBe("Arabic");
    expect(detectCatalogLanguage(["Chemise en lin homme", "Pantalon chino coton", "Veste légère"])).toBe("French");
    expect(detectCatalogLanguage(["Oxford Shirt", "Denim Jacket", "قميص قطن", "بنطلون جينز"])).toBe("English and Arabic");
    expect(detectCatalogLanguage(["123", ""])).toBeNull();
  });

  it("is carried into the rendered config", () => {
    const config = buildPathConfig([acsProduct("a", "men > top > shirt", 30, { title: "Oxford Shirt" })]);
    expect(config.catalogLanguage).toBe("English");
    expect(renderPathConfig(config)).toContain("Catalog language: English");
  });
});

describe("lookup", () => {
  it("normalizes the shapes a model writes", () => {
    expect(normalizePath("Persona > Women > Bottom")).toBe("women > bottom");
    expect(normalizePath("women/bottom/trouser")).toBe("women > bottom > trouser");
  });

  it("finds the unisex counterpart", () => {
    const trouser = findNode(CONFIG, "women > bottom > trouser")!;
    expect(unisexCounterpart(CONFIG, trouser)?.path).toBe("unisex > bottom > trouser");
  });

  it("lists leaves under a category", () => {
    const bottom = findNode(CONFIG, "women > bottom")!;
    expect(descendantLeaves(CONFIG, bottom).map((node) => node.path)).toEqual(["women > bottom > trouser"]);
  });

  it("reports the floor price and ACS category", () => {
    expect(floorPrice(findNode(CONFIG, "women > top")!)).toBe(25);
    expect(toAcsCategory("women > top")).toBe("persona > women > top");
  });
});

describe("renderPathConfig", () => {
  it("renders departments, leaves, brands and attributes", () => {
    const text = renderPathConfig(CONFIG);
    expect(text).toContain("### women — 6 in stock");
    expect(text).toContain("women > bottom > trouser — 3 in stock");
    expect(text).toContain("brands: Acme (2), Bolt (1)");
    expect(text).toContain("color(Black|Navy)");
    expect(text).toContain("inseam(number 30..34)");
  });

  it("shows a brand or value once however the store spelled it, and hides colour codes", () => {
    const config = buildPathConfig([
      acsProduct("a", "men > top > shirt", 30, { brands: ["MOUSTACHE MEN"], colorInfo: { colors: ["BLACK", "10427"] } }),
      acsProduct("b", "men > top > shirt", 40, { brands: ["Moustache Men"], colorInfo: { colors: ["Black", "OFF.WHITE"] } }),
      acsProduct("c", "men > top > shirt", 50, { brands: ["Moustache Men"], colorInfo: { colors: ["OFFWHITE"] } }),
    ]);
    const text = renderPathConfig(config);
    expect(text).toContain("brands: Moustache Men (3)");
    expect(text).toContain("color(Black|OFF.WHITE)");
    expect(text).not.toContain("10427");
    const leaf = findNode(config, "men > top > shirt")!;
    expect(leaf.attributes.find((attribute) => attribute.key === "color")?.values).toContain("10427");
  });

  it("says so when nothing is mapped", () => {
    const empty = buildPathConfig([acsProduct("x", "women > top", 10, { categories: ["Shirts"] })]);
    expect(renderPathConfig(empty)).toContain("NO PATHS");
  });

  it("fingerprints change with the text, the taxonomy version and unrendered config data", () => {
    const text = renderPathConfig(CONFIG);
    expect(pathConfigFingerprint(text, 1, CONFIG)).toBe(pathConfigFingerprint(text, 1, CONFIG));
    expect(pathConfigFingerprint(text, 1, CONFIG)).not.toBe(pathConfigFingerprint(text, 2, CONFIG));
    expect(pathConfigFingerprint(`${text} `, 1, CONFIG)).not.toBe(pathConfigFingerprint(text, 1, CONFIG));

    const withSize = { ...CONFIG, nodes: CONFIG.nodes.map((node, i) => (i === 0 ? { ...node, sizes: ["M"] } : node)) };
    expect(renderPathConfig(withSize)).toBe(text);
    expect(pathConfigFingerprint(text, 1, withSize)).not.toBe(pathConfigFingerprint(text, 1, CONFIG));
  });

  it("collects sizes and merchant genders per node", () => {
    const config = buildPathConfig([
      acsProduct("a", "unisex > top > t-shirt", 20, { sizes: ["10", "9", "M"], genders: ["female"] }),
    ]);
    const leaf = findNode(config, "unisex > top > t-shirt")!;
    expect(leaf.sizes).toEqual(["9", "10", "M"]);
    expect(leaf.attributes.find((attribute) => attribute.key === "gender")?.values).toEqual(["female"]);
  });
});
