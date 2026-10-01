import { describe, expect, it } from "vitest";
import { CONFIG, PRODUCTS, acsProduct } from "@/lib/agents/__fixtures__/catalog";
import { buildPathConfig, computePriceTiers, pathConfigFingerprint } from "./build";
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
