import { afterEach, describe, expect, it, vi } from "vitest";
import { getShopifyVendors, listShopifyCatalogPage, mapShopifyWebhookProduct } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Covers `toShopifyBuiltInFields` through the one exported entry point that exercises it — the
 * webhook mapper takes Shopify's REST product shape, which is what a real store's product webhook
 * actually delivers.
 */
describe("mapShopifyWebhookProduct", () => {
  const domain = "test-store.myshopify.com";
  const basePayload = {
    id: 900,
    title: "Relaxed Fit Linen Shirt",
  };

  it("surfaces tags and the first variant's compare-at price as field.* custom columns", () => {
    const product = mapShopifyWebhookProduct(
      {
        ...basePayload,
        tags: "Sale, New In, ",
        variants: [{ id: 1, price: "68.00", compare_at_price: "78.00" }],
      },
      domain
    );

    expect(product?.customFields).toEqual({
      "field.tags": "Sale, New In",
      "field.compare_at_price": "78.00",
    });
  });

  it("omits a built-in field entirely rather than writing an empty column when the store has nothing to say", () => {
    const product = mapShopifyWebhookProduct(basePayload, domain);
    expect(product?.customFields).toEqual({});
  });

  it("omits compare-at price when it is null, without dropping tags", () => {
    const product = mapShopifyWebhookProduct(
      { ...basePayload, tags: "Sale", variants: [{ id: 1, price: "68.00", compare_at_price: null }] },
      domain
    );

    expect(product?.customFields).toEqual({ "field.tags": "Sale" });
  });
});

describe("Shopify Admin GraphQL 2026-07 compatibility", () => {
  it("reads product vendors without the unsupported after argument", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
      expect(body.query).toContain("productVendors(first: 250)");
      expect(body.query).not.toContain("after:");
      expect(body.variables).toEqual({});
      return Response.json({
        data: { shop: { productVendors: { edges: [{ node: "Nike" }, { node: "Local Label" }] } } },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getShopifyVendors("store.myshopify.com", "token")).resolves.toEqual(["Nike", "Local Label"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads variant weight from inventoryItem.measurement instead of removed variant fields", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      expect(body.query).toContain("inventoryItem");
      expect(body.query).toContain("weight { value unit }");
      expect(body.query).not.toMatch(/selectedOptions \{ name value \}\s+weight\s+weightUnit/);

      return Response.json({
        data: {
          products: {
            nodes: [{
              id: "gid://shopify/Product/1",
              handle: "linen-shirt",
              title: "Linen Shirt",
              descriptionHtml: "",
              vendor: "Acme",
              productType: "Shirts",
              status: "ACTIVE",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-02T00:00:00Z",
              publishedAt: "2026-01-01T00:00:00Z",
              onlineStoreUrl: null,
              templateSuffix: null,
              totalInventory: 4,
              seo: { title: null, description: null },
              tags: [],
              featuredImage: null,
              images: { nodes: [] },
              priceRangeV2: { minVariantPrice: { amount: "49.00", currencyCode: "USD" } },
              variants: {
                nodes: [{
                  id: "gid://shopify/ProductVariant/2",
                  title: "Medium",
                  sku: "SHIRT-M",
                  barcode: null,
                  price: "49.00",
                  compareAtPrice: null,
                  availableForSale: true,
                  inventoryQuantity: 4,
                  image: null,
                  selectedOptions: [{ name: "Size", value: "M" }],
                  inventoryItem: { measurement: { weight: { value: 0.4, unit: "KILOGRAMS" } } },
                }],
              },
              collections: { nodes: [] },
            }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await listShopifyCatalogPage("store.myshopify.com", "token", { pageSize: 1 });

    expect(page.products[0]?.variants[0]).toEqual(
      expect.objectContaining({ weight: 0.4, weightUnit: "KILOGRAMS" })
    );
  });
});
