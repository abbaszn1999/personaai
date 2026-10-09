import { describe, expect, it } from "vitest";
import { CONFIG, PRODUCTS, acsProduct } from "@/lib/agents/__fixtures__/catalog";
import {
  buildPathConfig,
  computePriceTiers,
  detectCatalogLanguage,
  pathConfigDocument,
  pathConfigFingerprint,
} from "./build";
import {
  comparableAttributeValue,
  descendantLeaves,
  findNode,
  floorPrice,
  normalizePath,
  toAcsCategory,
  unisexCounterpart,
} from "./lookup";
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
      { name: "Acme", count: 2, spellings: ["Acme"] },
      { name: "Bolt", count: 1, spellings: ["Bolt"] },
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

  it("groups one brand's spellings, and the labels the store's brand mapping files together", () => {
    const products = [
      acsProduct("a", "men > bottom > jean", 30, { brands: ["tom tailor"] }),
      acsProduct("b", "men > bottom > jean", 40, { brands: ["Tom Tailor Men"] }),
      acsProduct("c", "men > bottom > jean", 45, { brands: ["Tom Tailor Men"] }),
      acsProduct("d", "men > bottom > jean", 50, { brands: ["TOM TAILOR MEN"] }),
      acsProduct("e", "men > bottom > jean", 60, { brands: ["MOUSTACHE Men"] }),
      acsProduct("f", "men > bottom > jean", 65, { brands: ["MOUSTACHE Men"] }),
      acsProduct("g", "men > bottom > jean", 70, { brands: ["moutache men"] }),
    ];
    // "TOM TAILOR MEN" is not in the store's grouping: it joins through its spelling.
    const family: Record<string, string> = {
      "tom tailor": "tom_tailor",
      "Tom Tailor Men": "tom_tailor",
      "MOUSTACHE Men": "moustache_men",
      "moutache men": "moustache_men",
    };

    const bySpelling = findNode(buildPathConfig(products), "men > bottom > jean")!;
    expect(bySpelling.brands.map((brand) => brand.name)).toEqual(["Tom Tailor Men", "MOUSTACHE Men", "moutache men", "tom tailor"]);
    expect(bySpelling.brands[0]).toEqual({ name: "Tom Tailor Men", count: 3, spellings: ["Tom Tailor Men", "TOM TAILOR MEN"] });

    const grouped = buildPathConfig(products, { brandFamily: (brand) => family[brand] ?? null });
    expect(findNode(grouped, "men > bottom > jean")!.brands).toEqual([
      { name: "Tom Tailor Men", count: 4, spellings: ["Tom Tailor Men", "tom tailor", "TOM TAILOR MEN"] },
      { name: "MOUSTACHE Men", count: 3, spellings: ["MOUSTACHE Men", "moutache men"] },
    ]);
    expect(renderPathConfig(grouped)).toContain("brands: Tom Tailor Men (4), MOUSTACHE Men (3)");
  });

  it("rebuilds the same config from the mirror's compact documents as from full ones", () => {
    const products = [
      ...PRODUCTS,
      acsProduct("w-tee-3", "women > top > t-shirt", 30, {
        description: "Long text nobody filters on",
        images: [{ uri: "" }, { uri: "https://example.com/a.jpg" }, { uri: "https://example.com/b.jpg" }],
        attributes: { fit_rows: { text: ['{"s":"M","chest":[96,100]}'] }, sleeve: { text: ["Short"] } },
        sizes: ["M"],
      }),
    ];
    const documents = products.flatMap((product) => pathConfigDocument(product) ?? []);
    expect(documents.some((document) => document.type === "VARIANT")).toBe(false);
    expect(documents.find((document) => document.id === "w-tee-3")).toMatchObject({
      images: [{ uri: "https://example.com/a.jpg" }],
      attributes: { fit_group: { text: ["tops"] }, fit_chest_cm: { text: ["98"] }, sleeve: { text: ["Short"] } },
    });
    expect(documents.find((document) => document.id === "w-tee-3")?.attributes?.fit_rows).toBeUndefined();
    expect(buildPathConfig(documents)).toEqual(buildPathConfig(products));
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

  it("splits around one price most products share instead of collapsing to one tier", () => {
    const counts: Array<[number, number]> = [[14, 3], [18, 2], [19, 72], [23, 7], [24, 9], [28, 5], [34, 2], [39, 4], [45, 4]];
    const prices = counts.flatMap(([price, count]) => Array.from({ length: count }, () => price));
    expect(computePriceTiers(prices)).toEqual([
      { label: "A", min: 14, max: 18, count: 5 },
      { label: "B", min: 18, max: 19, count: 72 },
      { label: "C", min: 19, max: 45, count: 31 },
    ]);
  });

  it("keeps a cheap tier when the shared price is the cheapest", () => {
    const prices = [...Array.from({ length: 10 }, () => 19), 25, 30, 45];
    const tiers = computePriceTiers(prices);
    expect(tiers.map((tier) => tier.label)).toEqual(["A", "B", "C"]);
    expect(tiers[0]).toEqual({ label: "A", min: 19, max: 19, count: 10 });
    expect(tiers.reduce((sum, tier) => sum + tier.count, 0)).toBe(prices.length);
  });

  it("falls back to two tiers when the shared price is the dearest", () => {
    const prices = [10, 12, ...Array.from({ length: 10 }, () => 45)];
    expect(computePriceTiers(prices)).toEqual([
      { label: "A", min: 10, max: 12, count: 2 },
      { label: "B", min: 12, max: 45, count: 10 },
    ]);
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

  it("compares colours through shorthand and both greys, and other attributes as written", () => {
    const color = { key: "color", field: "colors" };
    expect(comparableAttributeValue(color, "L.GREY")).toBe(comparableAttributeValue(color, "light gray"));
    expect(comparableAttributeValue(color, "LT. BEIGE")).toBe("lightbeige");
    expect(comparableAttributeValue(color, "D.BLUE")).toBe("darkblue");
    expect(comparableAttributeValue(color, "N.BLUE")).toBe("navyblue");
    expect(comparableAttributeValue(color, "N.GREEN")).toBe("ngreen");
    expect(comparableAttributeValue(color, "DENIM")).toBe("denim");
    expect(comparableAttributeValue({ key: "colour", field: "attributes.opt_colour" }, "D.GREEN")).toBe("darkgreen");
    expect(comparableAttributeValue({ key: "material", field: "materials" }, "L.Cotton")).toBe("lcotton");
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

  it("reads merchant colour shorthand as the colour it stands for, shown spelled out", () => {
    const config = buildPathConfig([
      acsProduct("a", "men > top > t-shirt", 10, { colorInfo: { colors: ["L.GREY", "D.GREY", "N.BLUE", "DENIM"] } }),
      acsProduct("b", "men > top > t-shirt", 20, { colorInfo: { colors: ["Light Grey", "Dark Gray", "Navy Blue", "LT BEIGE"] } }),
      acsProduct("c", "men > top > t-shirt", 30, { colorInfo: { colors: ["Light Beige", "DK GREEN", "N.GREEN"] } }),
    ]);
    const text = renderPathConfig(config);
    expect(text).toContain("color(Dark Gray|DENIM|DK GREEN|Light Beige|Light Grey|N.GREEN|Navy Blue)");
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
