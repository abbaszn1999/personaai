import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcsProduct, AcsSearchResponse, AcsSearchResultItem } from "./types";
import * as client from "./client";
import { deleteAllAcsProductsForConnection, getCatalogProductsByExternalIds } from "./catalog-reads";

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";
const originalProjectId = process.env.ACS_PROJECT_ID;

function item(id: string): AcsSearchResultItem {
  return { id, product: { id, type: "PRIMARY", title: "Product", categories: ["Men"] } };
}

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
    const searchSpy = vi.spyOn(client, "searchProductsRaw");

    await expect(deleteAllAcsProductsForConnection(CONNECTION_ID)).resolves.toBe(0);
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it("deletes every page of matching products and reports the total", async () => {
    const pageOne: AcsSearchResponse = { results: [item("a"), item("b")], nextPageToken: "page-2" };
    const pageTwo: AcsSearchResponse = { results: [item("c")] };
    const searchSpy = vi
      .spyOn(client, "searchProductsRaw")
      .mockResolvedValueOnce(pageOne)
      .mockResolvedValueOnce(pageTwo);
    const deleteSpy = vi.spyOn(client, "deleteProduct").mockResolvedValue(true);

    const deleted = await deleteAllAcsProductsForConnection(CONNECTION_ID);

    expect(deleted).toBe(3);
    expect(deleteSpy).toHaveBeenCalledWith("a");
    expect(deleteSpy).toHaveBeenCalledWith("b");
    expect(deleteSpy).toHaveBeenCalledWith("c");
    // The filter must scope to this connection alone — no category-scope clause, since every
    // product tagged with this merchant is in scope for removal, not just some subset of it.
    expect(searchSpy).toHaveBeenCalledWith(
      expect.stringContaining(`attributes.merchant_id: ANY("${CONNECTION_ID}")`),
      expect.anything()
    );
  });

  it("walks by page token, and reads the whole catalog before deleting any of it", async () => {
    const searchSpy = vi
      .spyOn(client, "searchProductsRaw")
      .mockResolvedValueOnce({ results: [item("a")], nextPageToken: "page-2" })
      .mockResolvedValueOnce({ results: [item("b")] });
    const deleteSpy = vi.spyOn(client, "deleteProduct").mockResolvedValue(true);

    await deleteAllAcsProductsForConnection(CONNECTION_ID);

    expect(searchSpy.mock.calls[0][1]).toMatchObject({ pageToken: undefined });
    expect(searchSpy.mock.calls[1][1]).toMatchObject({ pageToken: "page-2" });
    // Reading everything up front is the whole fix: deleting page one before requesting page two
    // invalidates the cursor and re-reads products ACS's search index has not dropped yet.
    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(deleteSpy).toHaveBeenCalledTimes(2);
  });

  it("stops once a page comes back without a token rather than looping forever", async () => {
    const searchSpy = vi.spyOn(client, "searchProductsRaw").mockResolvedValue({ results: [] });
    vi.spyOn(client, "deleteProduct").mockResolvedValue(true);

    const deleted = await deleteAllAcsProductsForConnection(CONNECTION_ID);

    expect(deleted).toBe(0);
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });

  it("counts only what it actually removed, so a stale index reports zero rather than a lie", async () => {
    vi.spyOn(client, "searchProductsRaw").mockResolvedValue({ results: [item("a"), item("b")] });
    // Both already deleted by an earlier sweep; the search index simply has not caught up.
    vi.spyOn(client, "deleteProduct").mockResolvedValue(false);

    await expect(deleteAllAcsProductsForConnection(CONNECTION_ID)).resolves.toBe(0);
  });

  it("reports how far it got when a delete fails partway rather than losing the count", async () => {
    vi.spyOn(client, "searchProductsRaw").mockResolvedValue({ results: [item("a"), item("b")] });
    vi.spyOn(client, "deleteProduct")
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("ACS is down"));

    // The sweep is best-effort and must never fail the disconnect, but reporting 0 after removing
    // something would hide the cleanup gap the log exists to surface.
    await expect(deleteAllAcsProductsForConnection(CONNECTION_ID)).resolves.toBe(1);
  });

  it("swallows errors and reports zero rather than failing the disconnect", async () => {
    vi.spyOn(client, "searchProductsRaw").mockRejectedValue(new Error("ACS is down"));

    await expect(deleteAllAcsProductsForConnection(CONNECTION_ID)).resolves.toBe(0);
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

    const [candidate] = await getCatalogProductsByExternalIds(CONNECTION_ID, ["27770"], ["424"]);

    expect(getSpy).toHaveBeenCalledWith(`${CONNECTION_ID}_27770`);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(candidate.enrichedDescription).toBe("A rugged shell.");
  });

  it("drops a product that no longer falls within the current category scope", async () => {
    vi.spyOn(client, "getProduct").mockResolvedValue(product({ attributes: { source_category_ids: { text: ["999"] } } }));

    const candidates = await getCatalogProductsByExternalIds(CONNECTION_ID, ["27770"], ["424"]);

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
