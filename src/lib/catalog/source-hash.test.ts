import { describe, expect, it } from "vitest";
import { computeSourceHash, sourceConfigKey } from "./source-hash";
import type { RawCatalogProduct } from "./sync-types";

function product(overrides: Partial<RawCatalogProduct> = {}): RawCatalogProduct {
  return {
    externalId: "p-1",
    productGroupId: "p-1",
    sku: null,
    title: "Linen Shirt",
    description: null,
    brand: "Aria",
    rawCategories: [],
    sourceCategoryIds: ["10"],
    price: 68,
    currency: "USD",
    inStock: true,
    productUrl: null,
    imageUrl: null,
    images: [],
    variantOptions: {},
    customFields: {},
    updatedAt: null,
    variants: [],
    ...overrides,
  };
}

const KEY = sourceConfigKey({}, "run-1");

describe("computeSourceHash", () => {
  it("is unchanged by key order, as after a round trip through the queue's JSON column", () => {
    const original = product();
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(original).reverse()))) as RawCatalogProduct;

    expect(computeSourceHash(reordered, ["10"], KEY)).toBe(computeSourceHash(original, ["10"], KEY));
  });

  it("is unchanged by the order categories were found in", () => {
    expect(computeSourceHash(product(), ["10", "20"], KEY)).toBe(computeSourceHash(product(), ["20", "10"], KEY));
  });

  it("moves when anything the product is written with moves", () => {
    const base = computeSourceHash(product(), ["10"], KEY);

    expect(computeSourceHash(product({ price: 70 }), ["10"], KEY)).not.toBe(base);
    expect(computeSourceHash(product({ inStock: false }), ["10"], KEY)).not.toBe(base);
    expect(computeSourceHash(product(), ["10", "20"], KEY)).not.toBe(base);
  });
});

describe("sourceConfigKey", () => {
  it("moves with the publish run and with the mapping settings", () => {
    const base = sourceConfigKey({ personaCategoryMap: { "10": "a" } }, "run-1");

    expect(sourceConfigKey({ personaCategoryMap: { "10": "a" } }, "run-1")).toBe(base);
    expect(sourceConfigKey({ personaCategoryMap: { "10": "a" } }, "run-2")).not.toBe(base);
    expect(sourceConfigKey({ personaCategoryMap: { "10": "b" } }, "run-1")).not.toBe(base);
    expect(sourceConfigKey({ acsFieldMapping: { title: "x" } }, "run-1")).not.toBe(sourceConfigKey({}, "run-1"));
  });
});
