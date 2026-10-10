import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";
import {
  deleteAcsDocuments,
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
import * as mirror from "./mirror";

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
    imageUrl: "https://cdn.example.com/p.jpg",
    images: [],
    variantOptions: {},
    customFields: {},
    updatedAt: null,
    variants: [],
    ...overrides,
  };
}

describe("acs/sync â safe to run without ACS configured", () => {
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

describe("acs/sync â dynamic attribute registration", () => {
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

    expect(attributesConfig.ensureDynamicAttributeRegistered).toHaveBeenCalledWith("opt_fit", "TEXTUAL");
    expect(attributesConfig.ensureDynamicAttributeRegistered).toHaveBeenCalledWith("opt_style", "TEXTUAL");
    expect(attributesConfig.ensureDynamicAttributeRegistered).toHaveBeenCalledTimes(2);
  });

  it("registers a merchant-declared numeric attribute as NUMERICAL, which is what makes a range filter work", async () => {
    // A number-typed attribute registered as text sorts "10" before "7.5", so the type has to travel
    // all the way to the catalog schema rather than stopping at the payload.
    await syncProductToAcs({
      raw: raw({ customFields: { "meta.heel": "7.5" } }),
      connectionId: "11111111-1111-1111-1111-111111111111",
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
      fieldMapping: {
        sources: {},
        optionRoles: {},
        customAttributes: [
          { key: "heel_height", name: "Heel Height", type: "number", source: { kind: "meta", key: "meta.heel" } },
        ],
      },
    });

    expect(attributesConfig.ensureDynamicAttributeRegistered).toHaveBeenCalledWith("heel_height", "NUMERICAL");
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
    expect(attributesConfig.ensureDynamicAttributeRegistered).toHaveBeenCalledWith("opt_fit", "TEXTUAL");
  });
});

describe("acs/sync  products without an image", () => {
  const originalProjectId = process.env.ACS_PROJECT_ID;
  const CONNECTION = "11111111-1111-1111-1111-111111111111";
  const input = (overrides: Partial<RawCatalogProduct>) => ({
    raw: raw(overrides),
    connectionId: CONNECTION,
    categoryPaths: [["Men"]],
    garmentCategory: null,
    garmentSubcategory: null,
    sourceCategoryIds: ["cat-1"],
  });

  beforeEach(() => {
    process.env.ACS_PROJECT_ID = "test-project";
    vi.spyOn(client, "importProducts").mockResolvedValue(undefined);
    vi.spyOn(client, "deleteProduct").mockResolvedValue(true);
    vi.spyOn(attributesConfig, "ensureDynamicAttributeRegistered").mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    else delete process.env.ACS_PROJECT_ID;
    vi.restoreAllMocks();
  });

  it("never writes a product with no image, and takes it out of ACS when it is there", async () => {
    vi.spyOn(mirror, "mirroredIds").mockResolvedValue(new Set([`${CONNECTION}_bare`]));

    await expect(
      syncProductsToAcs([input({ externalId: "shown" }), input({ externalId: "bare", imageUrl: null })])
    ).resolves.toBe(true);

    const written = vi.mocked(client.importProducts).mock.calls.flatMap((call) => call[0].map((product) => product.id));
    expect(written).toEqual([`${CONNECTION}_shown`]);
    expect(client.deleteProduct).toHaveBeenCalledWith(`${CONNECTION}_bare`);
  });

  it("skips the delete when the mirror says ACS never held the product", async () => {
    vi.spyOn(mirror, "mirroredIds").mockResolvedValue(new Set());

    await syncProductToAcs(input({ externalId: "bare", imageUrl: null }));

    expect(client.importProducts).not.toHaveBeenCalled();
    expect(client.deleteProduct).not.toHaveBeenCalled();
  });

  it("writes a product photographed only on its variants, with the variant photo as its own", async () => {
    vi.spyOn(mirror, "mirroredIds").mockResolvedValue(new Set());
    const variant = (id: string, imageUrl: string | null) => ({
      externalId: id,
      sku: null,
      barcode: null,
      title: null,
      price: 20,
      compareAtPrice: null,
      currency: "USD",
      inStock: true,
      inventoryQuantity: 1,
      imageUrl,
      selectedOptions: {},
      weight: null,
      weightUnit: null,
      productUrl: null,
      customFields: {},
    });

    await syncProductToAcs(
      input({ externalId: "variant-only", imageUrl: null, variants: [variant("v1", null), variant("v2", "https://cdn.example.com/v2.jpg")] })
    );

    const [[written]] = vi.mocked(client.importProducts).mock.calls;
    expect(written[0].images).toEqual([{ uri: "https://cdn.example.com/v2.jpg" }]);
  });
});

describe("acs/sync  deleteAcsDocuments", () => {
  const CONNECTION = "11111111-1111-1111-1111-111111111111";
  const primary = `${CONNECTION}_gid://shopify/Product/1`;
  const variant = (n: number) => `${primary}::gid://shopify/ProductVariant/${n}`;
  const hasVariants = (...variants: string[]) =>
    new client.AcsApiError(
      400,
      JSON.stringify({
        error: {
          code: 400,
          message: `Product "projects/7/locations/global/catalogs/default_catalog/branches/0/products/${primary}" has variants: [${variants
            .map((id) => `projects/7/locations/global/catalogs/default_catalog/branches/0/products/${id}`)
            .join(", ")}].`,
          status: "INVALID_ARGUMENT",
        },
      }),
      "products/x"
    );

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes every variant before its primary, since ACS refuses a primary with variants", async () => {
    const order: string[] = [];
    vi.spyOn(client, "deleteProduct").mockImplementation(async (id) => {
      order.push(id);
      return true;
    });

    await expect(deleteAcsDocuments(CONNECTION, [primary, variant(1), variant(2)])).resolves.toBe(3);

    expect(order.indexOf(primary)).toBe(2);
  });

  it("deletes the variants ACS names when it still holds ones the mapping no longer writes", async () => {
    const deleted: string[] = [];
    let refused = false;
    vi.spyOn(client, "deleteProduct").mockImplementation(async (id) => {
      if (id === primary && !refused) {
        refused = true;
        throw hasVariants(variant(7), variant(8));
      }
      deleted.push(id);
      return true;
    });

    await expect(deleteAcsDocuments(CONNECTION, [primary])).resolves.toBe(1);

    expect(deleted).toEqual([variant(7), variant(8), primary]);
  });

  it("logs a document that will not go instead of failing the batch around it", async () => {
    vi.spyOn(client, "deleteProduct").mockRejectedValue(new client.AcsApiError(503, "unavailable", "products/x"));

    await expect(deleteAcsDocuments(CONNECTION, [primary, variant(1)])).resolves.toBe(0);
    expect(console.error).toHaveBeenCalled();
  });
});
