import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcsProduct } from "./types";
import * as client from "./client";
import {
  deactivateAcsCatalogForRemapping,
  deleteAllAcsProductsForConnection,
  getAcsVariantIds,
  getCatalogProductsByExternalIds,
  markAcsProductOutOfStockIfExists,
} from "./catalog-reads";

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";
const originalProjectId = process.env.ACS_PROJECT_ID;

function product(overrides: Partial<AcsProduct> = {}): AcsProduct {
  return {
    id: "irrelevant",
    title: "Field Jacket",
    categories: ["Men > Clothing"],
    description: "A rugged shell.",
    attributes: { source_category_ids: { text: ["424"] } },
    ...overrides,
  };
}

describe("deactivateAcsCatalogForRemapping", () => {
  beforeEach(() => {
    process.env.ACS_PROJECT_ID = "test-project";
  });

  afterEach(() => {
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    else delete process.env.ACS_PROJECT_ID;
    vi.restoreAllMocks();
  });

  it("deactivates owned in-stock products without relying on search attribute propagation", async () => {
    vi.spyOn(client, "listProducts").mockResolvedValue({
      products: [
        product({ id: `${CONNECTION_ID}_a`, availability: "IN_STOCK" }),
        product({ id: `${CONNECTION_ID}_sold`, availability: "OUT_OF_STOCK" }),
        product({ id: "other_a", availability: "IN_STOCK" }),
      ],
    });
    const markSpy = vi.spyOn(client, "markOutOfStock").mockResolvedValue(undefined);
    const searchSpy = vi.spyOn(client, "searchProductsRaw");

    await expect(deactivateAcsCatalogForRemapping(CONNECTION_ID)).resolves.toBe(1);
    expect(markSpy).toHaveBeenCalledWith(`${CONNECTION_ID}_a`);
    expect(searchSpy).not.toHaveBeenCalled();
  });
});

describe("deleteAllAcsProductsForConnection", () => {
  beforeEach(() => {
    process.env.ACS_PROJECT_ID = "test-project";
  });

  afterEach(() => {
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    else delete process.env.ACS_PROJECT_ID;
    vi.restoreAllMocks();
  });

  it("does nothing and reports zero when ACS is unconfigured", async () => {
    delete process.env.ACS_PROJECT_ID;
    const listSpy = vi.spyOn(client, "listProducts");

    await expect(deleteAllAcsProductsForConnection(CONNECTION_ID)).resolves.toBe(0);
    expect(listSpy).not.toHaveBeenCalled();
  });

  it("deletes matching products from every authoritative catalog page", async () => {
    const ownedById = product({ id: `${CONNECTION_ID}_a` });
    const ownedByAttribute = product({
      id: "legacy-a",
      attributes: { merchant_id: { text: [CONNECTION_ID] } },
    });
    const otherMerchant = product({
      id: "other_b",
      attributes: { merchant_id: { text: ["other"] } },
    });
    const listSpy = vi
      .spyOn(client, "listProducts")
      .mockResolvedValueOnce({ products: [ownedById, otherMerchant], nextPageToken: "page-2" })
      .mockResolvedValueOnce({ products: [ownedByAttribute] });
    const deleteSpy = vi.spyOn(client, "deleteProduct").mockResolvedValue(true);

    const deleted = await deleteAllAcsProductsForConnection(CONNECTION_ID);

    expect(deleted).toBe(2);
    expect(deleteSpy).toHaveBeenCalledWith(`${CONNECTION_ID}_a`);
    expect(deleteSpy).toHaveBeenCalledWith("legacy-a");
    expect(deleteSpy).not.toHaveBeenCalledWith("other_b");
    expect(listSpy).toHaveBeenNthCalledWith(1, undefined);
    expect(listSpy).toHaveBeenNthCalledWith(2, "page-2");
  });

  it("reads the whole source catalog before deleting, so pagination stays stable", async () => {
    const listSpy = vi
      .spyOn(client, "listProducts")
      .mockResolvedValueOnce({ products: [product({ id: `${CONNECTION_ID}_a` })], nextPageToken: "page-2" })
      .mockResolvedValueOnce({ products: [product({ id: `${CONNECTION_ID}_b` })] });
    const deleteSpy = vi.spyOn(client, "deleteProduct").mockResolvedValue(true);

    await deleteAllAcsProductsForConnection(CONNECTION_ID);

    expect(listSpy.mock.invocationCallOrder[1]).toBeLessThan(deleteSpy.mock.invocationCallOrder[0]);
    expect(deleteSpy).toHaveBeenCalledTimes(2);
  });

  it("counts only products actually removed", async () => {
    vi.spyOn(client, "listProducts").mockResolvedValue({
      products: [product({ id: `${CONNECTION_ID}_a` }), product({ id: `${CONNECTION_ID}_b` })],
    });
    vi.spyOn(client, "deleteProduct").mockResolvedValue(false);

    await expect(deleteAllAcsProductsForConnection(CONNECTION_ID)).resolves.toBe(0);
  });

  it("throws when a delete fails so disconnect cannot discard the retry key", async () => {
    vi.spyOn(client, "listProducts").mockResolvedValue({
      products: [product({ id: `${CONNECTION_ID}_a` }), product({ id: `${CONNECTION_ID}_b` })],
    });
    vi.spyOn(client, "deleteProduct")
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("ACS is down"));

    await expect(deleteAllAcsProductsForConnection(CONNECTION_ID)).rejects.toThrow("ACS is down");
  });

  it("rejects repeated page tokens instead of looping forever", async () => {
    vi.spyOn(client, "listProducts").mockResolvedValue({ products: [], nextPageToken: "same" });

    await expect(deleteAllAcsProductsForConnection(CONNECTION_ID)).rejects.toThrow("repeated page token");
  });
});

describe("getCatalogProductsByExternalIds", () => {
  beforeEach(() => {
    process.env.ACS_PROJECT_ID = "test-project";
  });

  afterEach(() => {
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    else delete process.env.ACS_PROJECT_ID;
    vi.restoreAllMocks();
  });

  it("reads each id directly via GetProduct rather than a search, so retrievability propagation can never gate it", async () => {
    // The whole point: a shopper asking about a product they already clicked on must get its
    // real description/attributes immediately, not whenever ACS's search-result retrievability
    // config finishes propagating (documented as up to 12 hours) — see the doc comment on the
    // function under test.
    const getSpy = vi.spyOn(client, "getProduct").mockResolvedValue(product({ description: "A rugged shell." }));
    const searchSpy = vi.spyOn(client, "searchProducts");

    const [candidate] = await getCatalogProductsByExternalIds(CONNECTION_ID, ["27770"], ["Men > Clothing"]);

    expect(getSpy).toHaveBeenCalledWith(`${CONNECTION_ID}_27770`);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(candidate.enrichedDescription).toBe("A rugged shell.");
  });

  it("drops a product that no longer falls within the current category scope", async () => {
    vi.spyOn(client, "getProduct").mockResolvedValue(product({ categories: ["Women > Clothing"] }));

    const candidates = await getCatalogProductsByExternalIds(CONNECTION_ID, ["27770"], ["Men > Clothing"]);

    expect(candidates).toEqual([]);
  });

  it("skips an id ACS has no record of rather than throwing", async () => {
    vi.spyOn(client, "getProduct").mockResolvedValue(null);

    const candidates = await getCatalogProductsByExternalIds(CONNECTION_ID, ["missing"], ["424"]);

    expect(candidates).toEqual([]);
  });

  it("returns nothing for an empty scope without ever calling ACS", async () => {
    const getSpy = vi.spyOn(client, "getProduct");

    const candidates = await getCatalogProductsByExternalIds(CONNECTION_ID, ["27770"], []);

    expect(candidates).toEqual([]);
    expect(getSpy).not.toHaveBeenCalled();
  });
});

describe("getAcsVariantIds", () => {
  beforeEach(() => {
    process.env.ACS_PROJECT_ID = "test-project";
  });

  afterEach(() => {
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    else delete process.env.ACS_PROJECT_ID;
    vi.restoreAllMocks();
  });

  it("finds a product's VARIANT children by primary_external_id, scoped to this merchant", async () => {
    const searchSpy = vi.spyOn(client, "searchProductsRaw").mockResolvedValue({
      results: [
        { id: `${CONNECTION_ID}_27770::v1`, product: product() },
        { id: `${CONNECTION_ID}_27770::v2`, product: product() },
      ],
    });

    const ids = await getAcsVariantIds(CONNECTION_ID, "27770");

    expect(ids).toEqual([`${CONNECTION_ID}_27770::v1`, `${CONNECTION_ID}_27770::v2`]);
    const [filter] = searchSpy.mock.calls[0];
    expect(filter).toContain(`merchant_id: ANY("${CONNECTION_ID}")`);
    expect(filter).toContain('attributes.primary_external_id: ANY("27770")');
  });

  it("returns nothing for a product with no VARIANT children", async () => {
    vi.spyOn(client, "searchProductsRaw").mockResolvedValue({ results: [] });

    await expect(getAcsVariantIds(CONNECTION_ID, "27770")).resolves.toEqual([]);
  });
});

describe("markAcsProductOutOfStockIfExists", () => {
  beforeEach(() => {
    process.env.ACS_PROJECT_ID = "test-project";
  });

  afterEach(() => {
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    else delete process.env.ACS_PROJECT_ID;
    vi.restoreAllMocks();
  });

  it("marks the parent and every VARIANT child out of stock when the parent exists", async () => {
    vi.spyOn(client, "getProduct").mockResolvedValue(product({ id: `${CONNECTION_ID}_27770` }));
    vi.spyOn(client, "searchProductsRaw").mockResolvedValue({
      results: [{ id: `${CONNECTION_ID}_27770::v1`, product: product() }],
    });
    const markSpy = vi.spyOn(client, "markOutOfStock").mockResolvedValue(undefined);

    await expect(markAcsProductOutOfStockIfExists(CONNECTION_ID, "27770")).resolves.toBe(true);

    expect(markSpy).toHaveBeenCalledWith(`${CONNECTION_ID}_27770`);
    expect(markSpy).toHaveBeenCalledWith(`${CONNECTION_ID}_27770::v1`);
  });

  it("does nothing for a product that was never indexed, rather than throwing on a 404", async () => {
    vi.spyOn(client, "getProduct").mockResolvedValue(null);
    const searchSpy = vi.spyOn(client, "searchProductsRaw");
    const markSpy = vi.spyOn(client, "markOutOfStock");

    await expect(markAcsProductOutOfStockIfExists(CONNECTION_ID, "missing")).resolves.toBe(false);

    expect(searchSpy).not.toHaveBeenCalled();
    expect(markSpy).not.toHaveBeenCalled();
  });
});
