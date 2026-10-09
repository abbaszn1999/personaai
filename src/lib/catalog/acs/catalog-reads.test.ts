import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcsProduct } from "./types";
import * as client from "./client";
import * as mirror from "./mirror";
import {
  deactivateAcsCatalogForRemapping,
  deleteAllAcsProductsForConnection,
  getAcsVariantIds,
  forgetCachedProductReads,
  getCatalogProductsByExternalIds,
  markAcsProductOutOfStockIfExists,
  retireStaleAcsProducts,
  sweepAcsProductsForConnection,
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

describe("retireStaleAcsProducts", () => {
  beforeEach(() => {
    process.env.ACS_PROJECT_ID = "test-project";
  });

  afterEach(() => {
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    else delete process.env.ACS_PROJECT_ID;
    vi.restoreAllMocks();
  });

  it("retires what the store's mirror says is stale, without walking ACS's shared catalog", async () => {
    vi.spyOn(mirror, "listStaleMirrorIds").mockResolvedValue([`${CONNECTION_ID}_a`, `${CONNECTION_ID}_b`]);
    const listSpy = vi.spyOn(client, "listProducts");
    const markSpy = vi.spyOn(client, "markOutOfStock").mockResolvedValue(undefined);

    await expect(retireStaleAcsProducts(CONNECTION_ID, "run-2")).resolves.toBe(2);
    expect(mirror.listStaleMirrorIds).toHaveBeenCalledWith(CONNECTION_ID, "run-2");
    expect(markSpy).toHaveBeenCalledWith(`${CONNECTION_ID}_a`);
    expect(markSpy).toHaveBeenCalledWith(`${CONNECTION_ID}_b`);
    expect(listSpy).not.toHaveBeenCalled();
  });

  it("falls back to walking ACS when the mirror is not trusted", async () => {
    vi.spyOn(mirror, "listStaleMirrorIds").mockResolvedValue(null);
    vi.spyOn(client, "listProducts").mockResolvedValue({
      products: [
        product({ id: `${CONNECTION_ID}_old`, availability: "IN_STOCK", attributes: { persona_publish_id: { text: ["run-1"] } } }),
        product({ id: `${CONNECTION_ID}_new`, availability: "IN_STOCK", attributes: { persona_publish_id: { text: ["run-2"] } } }),
        product({ id: "other_old", availability: "IN_STOCK", attributes: { persona_publish_id: { text: ["run-1"] } } }),
      ],
    });
    const markSpy = vi.spyOn(client, "markOutOfStock").mockResolvedValue(undefined);

    await expect(retireStaleAcsProducts(CONNECTION_ID, "run-2")).resolves.toBe(1);
    expect(markSpy).toHaveBeenCalledTimes(1);
    expect(markSpy).toHaveBeenCalledWith(`${CONNECTION_ID}_old`);
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
    // Only the fields ownership and ordering read, since this walks every tenant's documents.
    const ownershipMask = { readMask: "id,type,primaryProductId,attributes" };
    expect(listSpy).toHaveBeenNthCalledWith(1, undefined, ownershipMask);
    expect(listSpy).toHaveBeenNthCalledWith(2, "page-2", ownershipMask);
  });

  it("never deletes another store's documents, however their ids look", async () => {
    const OTHER = "22222222-2222-2222-2222-222222222222";
    const SAME_SHOP_OTHER_ACCOUNT = "33333333-3333-3333-3333-333333333333";
    vi.spyOn(client, "listProducts").mockResolvedValue({
      products: [
        product({ id: `${CONNECTION_ID}_mine`, attributes: { merchant_id: { text: [CONNECTION_ID] } } }),
        product({ id: `${OTHER}_theirs`, attributes: { merchant_id: { text: [OTHER] } } }),
        // Same Shopify product id, connected by a second Persona account: a different store here.
        product({
          id: `${SAME_SHOP_OTHER_ACCOUNT}_gid://shopify/Product/1`,
          attributes: { merchant_id: { text: [SAME_SHOP_OTHER_ACCOUNT] } },
        }),
        // A tag for another store outranks an id that happens to carry this store's prefix.
        product({ id: `${CONNECTION_ID}_mislabelled`, attributes: { merchant_id: { text: [OTHER] } } }),
        product({ id: `${OTHER}_shared`, attributes: { merchant_id: { text: [OTHER, CONNECTION_ID] } } }),
      ],
    });
    const deleteSpy = vi.spyOn(client, "deleteProduct").mockResolvedValue(true);

    await expect(deleteAllAcsProductsForConnection(CONNECTION_ID)).resolves.toBe(1);
    expect(deleteSpy.mock.calls.map(([id]) => id)).toEqual([`${CONNECTION_ID}_mine`]);
  });

  it.each(["", "conn-1", "1111", `${"1".repeat(36)}`, undefined])(
    "refuses to sweep with a malformed connection id (%s) before reading anything",
    async (badId) => {
      const listSpy = vi.spyOn(client, "listProducts");
      const deleteSpy = vi.spyOn(client, "deleteProduct");

      await expect(sweepAcsProductsForConnection(badId as string)).rejects.toThrow("malformed connection id");
      expect(listSpy).not.toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
    },
  );

  it("reports progress while it lists and after every batch it deletes", async () => {
    vi.spyOn(client, "listProducts").mockResolvedValueOnce({
      products: [
        { id: `${CONNECTION_ID}_a`, type: "PRIMARY" },
        { id: `${CONNECTION_ID}_b`, type: "PRIMARY" },
      ],
    } as never);
    vi.spyOn(client, "deleteProduct").mockResolvedValue(true);
    const onProgress = vi.fn();

    await expect(sweepAcsProductsForConnection(CONNECTION_ID, { onProgress })).resolves.toEqual({
      deleted: 2,
      found: 2,
      complete: true,
    });

    expect(onProgress).toHaveBeenNthCalledWith(1, { deleted: 0, found: 2 });
    expect(onProgress).toHaveBeenLastCalledWith({ deleted: 2, found: 2 });
  });

  it("starts no delete batch after its deadline, leaving the rest for the next sweep", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `${CONNECTION_ID}_${i}`);
    vi.spyOn(client, "listProducts").mockResolvedValue({
      products: ids.map((id) => product({ id, type: "PRIMARY" })),
    });
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const deleteSpy = vi.spyOn(client, "deleteProduct").mockImplementation(async () => {
      now += 100;
      return true;
    });

    const sweep = await sweepAcsProductsForConnection(CONNECTION_ID, { until: 1_000 + 20 * 100 });

    expect(sweep).toEqual({ deleted: 20, found: 50, complete: false });
    expect(deleteSpy).toHaveBeenCalledTimes(20);
  });

  it("keeps the count of what it removed when ACS refuses a delete", async () => {
    vi.spyOn(client, "listProducts").mockResolvedValue({
      products: [product({ id: `${CONNECTION_ID}_a` }), product({ id: `${CONNECTION_ID}_b` })],
    });
    const refusal = new Error("ACS is down");
    vi.spyOn(client, "deleteProduct").mockResolvedValueOnce(true).mockRejectedValueOnce(refusal);

    await expect(sweepAcsProductsForConnection(CONNECTION_ID)).resolves.toEqual({
      deleted: 1,
      found: 2,
      complete: false,
      error: refusal,
    });
  });

  it("deletes every variant before deleting its parent", async () => {
    const parentId = `${CONNECTION_ID}_gid://shopify/Product/1`;
    const variantId = `${parentId}::gid://shopify/ProductVariant/2`;
    vi.spyOn(client, "listProducts").mockResolvedValue({
      // Parent first deliberately: ACS listing order must not control deletion order.
      products: [
        product({ id: parentId, type: "PRIMARY" }),
        product({ id: variantId, type: "VARIANT", primaryProductId: parentId }),
      ],
    });
    const deleteSpy = vi.spyOn(client, "deleteProduct").mockResolvedValue(true);

    await expect(deleteAllAcsProductsForConnection(CONNECTION_ID)).resolves.toBe(2);

    expect(deleteSpy).toHaveBeenNthCalledWith(1, variantId);
    expect(deleteSpy).toHaveBeenNthCalledWith(2, parentId);
  });

  it("keeps parents in the second pass when ACS fills their primaryProductId with their own id", async () => {
    // The shape ACS actually returns: every PRIMARY names itself as its own primary product.
    const parents = Array.from({ length: 30 }, (_, i) => `${CONNECTION_ID}_gid://shopify/Product/${i}`);
    const variants = parents.map((parent, i) => `${parent}::gid://shopify/ProductVariant/${i}`);
    vi.spyOn(client, "listProducts").mockResolvedValue({
      products: parents.flatMap((parent, i) => [
        product({ id: parent, type: "PRIMARY", primaryProductId: parent }),
        product({ id: variants[i], type: "VARIANT", primaryProductId: parent }),
      ]),
    });
    const deleteSpy = vi.spyOn(client, "deleteProduct").mockResolvedValue(true);

    await expect(deleteAllAcsProductsForConnection(CONNECTION_ID)).resolves.toBe(60);

    const order = deleteSpy.mock.calls.map(([id]) => id);
    expect(order.slice(0, 30).sort()).toEqual([...variants].sort());
    expect(order.slice(30).sort()).toEqual([...parents].sort());
  });

  it("still orders older records that carry no type", async () => {
    const parentId = `${CONNECTION_ID}_p`;
    const byParentField = `${CONNECTION_ID}_v1`;
    const byCompositeId = `${parentId}::v2`;
    vi.spyOn(client, "listProducts").mockResolvedValue({
      products: [
        { id: parentId, primaryProductId: parentId },
        { id: byParentField, primaryProductId: parentId },
        { id: byCompositeId },
      ] as never,
    });
    const deleteSpy = vi.spyOn(client, "deleteProduct").mockResolvedValue(true);

    await deleteAllAcsProductsForConnection(CONNECTION_ID);

    expect(deleteSpy.mock.calls.map(([id]) => id)).toEqual([byParentField, byCompositeId, parentId]);
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
    forgetCachedProductReads();
  });

  it("reads a card once for consecutive turns instead of on every turn", async () => {
    const getSpy = vi.spyOn(client, "getProduct").mockResolvedValue(product());
    await getCatalogProductsByExternalIds(CONNECTION_ID, ["27770"], ["Men > Clothing"]);
    await getCatalogProductsByExternalIds(CONNECTION_ID, ["27770"], ["Men > Clothing"]);
    expect(getSpy).toHaveBeenCalledTimes(1);
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
