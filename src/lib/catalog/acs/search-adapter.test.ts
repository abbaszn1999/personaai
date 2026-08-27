import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcsSearchResponse } from "./types";
import * as client from "./client";
import { acsFilterCatalogProducts, acsSearchCatalogProducts } from "./search-adapter";

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";

function response(overrides: Partial<AcsSearchResponse> = {}): AcsSearchResponse {
  return {
    results: [
      {
        id: `${CONNECTION_ID}_ext-1`,
        product: {
          id: `${CONNECTION_ID}_ext-1`,
          type: "PRIMARY",
          title: "Linen Shirt",
          categories: ["Men", "Men > Clothing", "Men > Clothing > Shirts"],
          brands: ["Acme"],
          priceInfo: { price: 59.99, currencyCode: "USD" },
          availability: "IN_STOCK",
          uri: "https://store.example.com/products/linen-shirt",
          images: [{ uri: "https://cdn.example.com/linen-shirt.jpg" }],
          attributes: {
            merchant_id: { text: [CONNECTION_ID] },
            garment_category: { text: ["tops"] },
            garment_subcategory: { text: ["shirt"] },
            product_group_id: { text: ["group-9"] },
          },
        },
      },
    ],
    ...overrides,
  };
}

describe("acs search adapter", () => {
  beforeEach(() => {
    vi.spyOn(client, "searchProducts").mockResolvedValue(response());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps a search response back into CatalogCandidate shape", async () => {
    const candidates = await acsSearchCatalogProducts(
      "a linen shirt for summer",
      {},
      { connectionId: CONNECTION_ID, categoryScope: ["cat-1"], visitorId: "visitor-1", limit: 10 }
    );

    expect(candidates).toEqual([
      {
        externalId: "ext-1",
        productGroupId: "group-9",
        title: "Linen Shirt",
        brand: "Acme",
        categoryPaths: [["Men", "Clothing", "Shirts"]],
        price: 59.99,
        currency: "USD",
        inStock: true,
        productUrl: "https://store.example.com/products/linen-shirt",
        imageUrl: "https://cdn.example.com/linen-shirt.jpg",
        enrichedDescription: null,
        attributes: {},
        garmentCategory: "tops",
        garmentSubcategory: "shirt",
        similarity: undefined,
      },
    ]);
  });

  it("folds description and an arbitrary mix of predefined-bucket and custom attributes into one generic bag", async () => {
    vi.spyOn(client, "searchProducts").mockResolvedValue({
      results: [
        {
          id: `${CONNECTION_ID}_ext-2`,
          product: {
            id: `${CONNECTION_ID}_ext-2`,
            type: "PRIMARY",
            title: "Field Jacket",
            categories: ["Men"],
            description: "A rugged shell built for wet-weather commutes.",
            colorInfo: { colors: ["Moss"] },
            materials: ["Ripstop cotton"],
            attributes: {
              merchant_id: { text: [CONNECTION_ID] },
              // Store-specific option names, on purpose — not colour/size — so this can't pass
              // by accident against a hardcoded field.
              opt_collar_type: { text: ["Mandarin"] },
              opt_inseam: { text: ["30in", "32in"] },
            },
          },
        },
      ],
    });

    const [candidate] = await acsSearchCatalogProducts(
      "a rugged jacket",
      {},
      { connectionId: CONNECTION_ID, categoryScope: ["cat-1"], visitorId: "visitor-1", limit: 10 }
    );

    expect(candidate.enrichedDescription).toBe("A rugged shell built for wet-weather commutes.");
    expect(candidate.attributes).toEqual({
      color: ["Moss"],
      material: ["Ripstop cotton"],
      collar_type: ["Mandarin"],
      inseam: ["30in", "32in"],
    });
  });

  it("passes the query text, filter expression and scope through to the client", async () => {
    await acsSearchCatalogProducts(
      "a linen shirt",
      { category: "Men", priceMax: 100 },
      { connectionId: CONNECTION_ID, categoryScope: ["cat-1", "cat-2"], visitorId: "visitor-1", limit: 5 }
    );

    expect(client.searchProducts).toHaveBeenCalledWith({
      connectionId: CONNECTION_ID,
      categoryScope: ["cat-1", "cat-2"],
      visitorId: "visitor-1",
      query: "a linen shirt",
      pageSize: 5,
      extraFilter: '(categories: ANY("Men")) AND (price: IN(*, 100i))',
    });
  });

  it("short-circuits without calling the client when scope is empty", async () => {
    const candidates = await acsSearchCatalogProducts(
      "anything",
      {},
      { connectionId: CONNECTION_ID, categoryScope: [], visitorId: "visitor-1", limit: 10 }
    );

    expect(candidates).toEqual([]);
    expect(client.searchProducts).not.toHaveBeenCalled();
  });

  it("runs filter mode with an empty query string, browse-style", async () => {
    await acsFilterCatalogProducts(
      { brand: "Acme" },
      { connectionId: CONNECTION_ID, categoryScope: ["cat-1"], visitorId: "visitor-1", limit: 10 }
    );

    expect(client.searchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ query: "", extraFilter: '(brands: ANY("Acme"))' })
    );
  });

  it("returns an empty array when the response has no results", async () => {
    vi.spyOn(client, "searchProducts").mockResolvedValue({});
    const candidates = await acsSearchCatalogProducts(
      "anything",
      {},
      { connectionId: CONNECTION_ID, categoryScope: ["cat-1"], visitorId: "visitor-1", limit: 10 }
    );
    expect(candidates).toEqual([]);
  });

  it("writes the response's attributionToken into the out-param sink", async () => {
    vi.spyOn(client, "searchProducts").mockResolvedValue(response({ attributionToken: "token-xyz" }));
    const attributionTokenOut: { current?: string } = {};

    await acsSearchCatalogProducts(
      "a linen shirt",
      {},
      { connectionId: CONNECTION_ID, categoryScope: ["cat-1"], visitorId: "visitor-1", limit: 10, attributionTokenOut }
    );

    expect(attributionTokenOut.current).toBe("token-xyz");
  });
});
