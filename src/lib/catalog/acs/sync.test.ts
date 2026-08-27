import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";
import {
  downgradeAcsProductIfExists,
  fetchExistingAcsSourceCategoryIds,
  isAcsConfigured,
  markAcsProductOutOfStock,
  syncProductToAcs,
  syncProductsToAcs,
} from "./sync";
import * as client from "./client";
import * as catalogReads from "./catalog-reads";
import * as attributesConfig from "./attributes-config";

function raw(overrides: Partial<RawCatalogProduct> = {}): RawCatalogProduct {
  return {
    externalId: "123",
    productGroupId: null,
    sku: null,
    title: "Linen Shirt",
    description: null,
    brand: null,
    rawCategories: [],
    sourceCategoryIds: [],
    price: 20,
    currency: "USD",
    inStock: true,
    productUrl: null,
    imageUrl: null,
    images: [],
    variantOptions: {},
    updatedAt: null,
    ...overrides,
  };
}

describe("acs/sync — safe to run without ACS configured", () => {
  const originalProjectId = process.env.ACS_PROJECT_ID;

  beforeEach(() => {
    delete process.env.ACS_PROJECT_ID;
    vi.spyOn(client, "importProducts").mockResolvedValue(undefined);
    vi.spyOn(client, "markOutOfStock").mockResolvedValue(undefined);
    vi.spyOn(catalogReads, "getAcsProductSourceCategoryIds").mockResolvedValue([]);
    vi.spyOn(catalogReads, "markAcsProductOutOfStockIfExists").mockResolvedValue(false);
  });

  afterEach(() => {
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    vi.restoreAllMocks();
  });

  it("reports unconfigured when ACS_PROJECT_ID is unset", () => {
    expect(isAcsConfigured()).toBe(false);
  });

  it("syncProductToAcs never calls the client and reports failure when unconfigured", async () => {
    await expect(
      syncProductToAcs({ raw: raw(), connectionId: "11111111-1111-1111-1111-111111111111", categoryPaths: [], garmentCategory: null, garmentSubcategory: null, sourceCategoryIds: ["cat-1"] })
    ).resolves.toBe(false);
    expect(client.importProducts).not.toHaveBeenCalled();
  });

  it("syncProductsToAcs never calls the client when unconfigured", async () => {
    await syncProductsToAcs([
      { raw: raw(), connectionId: "11111111-1111-1111-1111-111111111111", categoryPaths: [], garmentCategory: null, garmentSubcategory: null, sourceCategoryIds: ["cat-1"] },
    ]);
    expect(client.importProducts).not.toHaveBeenCalled();
  });

  it("syncProductsToAcs treats an empty batch as trivially successful even when unconfigured", async () => {
    await expect(syncProductsToAcs([])).resolves.toBe(true);
  });

  it("markAcsProductOutOfStock never calls the client when unconfigured", async () => {
    await markAcsProductOutOfStock("11111111-1111-1111-1111-111111111111", "123");
    expect(client.markOutOfStock).not.toHaveBeenCalled();
  });

  it("downgradeAcsProductIfExists never calls the client and reports false when unconfigured", async () => {
    await expect(downgradeAcsProductIfExists("11111111-1111-1111-1111-111111111111", "123")).resolves.toBe(false);
    expect(catalogReads.markAcsProductOutOfStockIfExists).not.toHaveBeenCalled();
  });

  it("fetchExistingAcsSourceCategoryIds returns nothing and never calls the client when unconfigured", async () => {
    await expect(fetchExistingAcsSourceCategoryIds("11111111-1111-1111-1111-111111111111", "123")).resolves.toEqual([]);
    expect(catalogReads.getAcsProductSourceCategoryIds).not.toHaveBeenCalled();
  });

  it("swallows a client error rather than throwing, once configured", async () => {
    process.env.ACS_PROJECT_ID = "test-project";
    vi.spyOn(client, "importProducts").mockRejectedValue(new Error("network down"));

    await expect(
      syncProductToAcs({ raw: raw(), connectionId: "11111111-1111-1111-1111-111111111111", categoryPaths: [], garmentCategory: null, garmentSubcategory: null, sourceCategoryIds: ["cat-1"] })
    ).resolves.toBe(false);
  });

  it("reports a failed lookup as null, distinct from an empty membership", async () => {
    process.env.ACS_PROJECT_ID = "test-project";
    vi.spyOn(catalogReads, "getAcsProductSourceCategoryIds").mockRejectedValue(new Error("network down"));

    // Returning [] here would tell callers "ACS has nothing recorded", and since an import
    // replaces the whole product document, they would write the current walk's categories over
    // every other category the product belonged to.
    await expect(fetchExistingAcsSourceCategoryIds("11111111-1111-1111-1111-111111111111", "123")).resolves.toBeNull();
  });

  it("still reports a genuinely empty membership as an empty list", async () => {
    process.env.ACS_PROJECT_ID = "test-project";
    vi.spyOn(catalogReads, "getAcsProductSourceCategoryIds").mockResolvedValue([]);

    await expect(fetchExistingAcsSourceCategoryIds("11111111-1111-1111-1111-111111111111", "123")).resolves.toEqual([]);
  });
});

describe("acs/sync — dynamic attribute registration", () => {
  const originalProjectId = process.env.ACS_PROJECT_ID;

  beforeEach(() => {
    process.env.ACS_PROJECT_ID = "test-project";
    vi.spyOn(client, "importProducts").mockResolvedValue(undefined);
    vi.spyOn(attributesConfig, "ensureDynamicAttributeRegistered").mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    else delete process.env.ACS_PROJECT_ID;
    vi.restoreAllMocks();
  });

  it("registers every distinct opt_* attribute key a product carries before importing it", async () => {
    await syncProductToAcs({
      raw: raw({ variantOptions: { Fit: [{ id: "f1", label: "Slim" }], Style: [{ id: "s1", label: "Casual" }] } }),
      connectionId: "11111111-1111-1111-1111-111111111111",
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(attributesConfig.ensureDynamicAttributeRegistered).toHaveBeenCalledWith("opt_fit");
    expect(attributesConfig.ensureDynamicAttributeRegistered).toHaveBeenCalledWith("opt_style");
    expect(attributesConfig.ensureDynamicAttributeRegistered).toHaveBeenCalledTimes(2);
  });

  it("never calls the registration hook when a batch has no custom option groups", async () => {
    await syncProductToAcs({
      raw: raw(),
      connectionId: "11111111-1111-1111-1111-111111111111",
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(attributesConfig.ensureDynamicAttributeRegistered).not.toHaveBeenCalled();
  });

  it("dedupes a key shared across multiple products in a batch import", async () => {
    await syncProductsToAcs([
      {
        raw: raw({ externalId: "1", variantOptions: { Fit: [{ id: "f1", label: "Slim" }] } }),
        connectionId: "11111111-1111-1111-1111-111111111111",
        categoryPaths: [["Men"]],
        garmentCategory: null,
        garmentSubcategory: null,
        sourceCategoryIds: ["cat-1"],
      },
      {
        raw: raw({ externalId: "2", variantOptions: { Fit: [{ id: "f2", label: "Regular" }] } }),
        connectionId: "11111111-1111-1111-1111-111111111111",
        categoryPaths: [["Men"]],
        garmentCategory: null,
        garmentSubcategory: null,
        sourceCategoryIds: ["cat-1"],
      },
    ]);

    expect(attributesConfig.ensureDynamicAttributeRegistered).toHaveBeenCalledTimes(1);
    expect(attributesConfig.ensureDynamicAttributeRegistered).toHaveBeenCalledWith("opt_fit");
  });
});
