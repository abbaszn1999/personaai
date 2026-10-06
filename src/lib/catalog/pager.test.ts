import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type { RawCatalogProduct } from "./sync-types";

const listWooProductsByIds = vi.fn();
const listShopifyProductsByIds = vi.fn();

vi.mock("@/lib/woocommerce/client", () => ({
  countWooCatalogProducts: vi.fn(),
  fetchWooStoreCurrency: vi.fn(async () => "AED"),
  listWooCatalogPage: vi.fn(),
  listWooProductsByIds: (...args: unknown[]) => listWooProductsByIds(...args),
  normalizeWordPressUrl: (url: string) => `https://${url}`,
}));
vi.mock("@/lib/shopify/client", () => ({
  countShopifyCollectionProducts: vi.fn(),
  getShopifyAccessToken: vi.fn(async () => "token"),
  listShopifyCatalogPage: vi.fn(),
  listShopifyProductsByIds: (...args: unknown[]) => listShopifyProductsByIds(...args),
  normalizeShopifyDomain: (url: string) => url,
}));
vi.mock("@/lib/utils/crypto", () => ({
  decodeCredentials: () => ({ wpUsername: "u", wpAppPassword: "p", clientId: "id", clientSecret: "secret" }),
}));

const { createCatalogPager } = await import("./pager");

function connection(platform: "shopify" | "wordpress"): StoreConnectionRow {
  return {
    id: `conn-${platform}`,
    platform,
    storeUrl: "store.example",
    apiKeyEncrypted: "encoded",
    selectedCategoryIds: ["cat-1"],
    categories: [{ id: "cat-1", name: "Tops", productCount: 1 }],
    acsFieldMapping: { sources: {}, customAttributes: [], optionRoles: {} },
    storeCurrency: null,
  } as unknown as StoreConnectionRow;
}

const echo = (ids: string[]) => ids.map((externalId) => ({ externalId }) as RawCatalogProduct);

describe("catalog pager fetchByIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listWooProductsByIds.mockImplementation(async (_url, _user, _pass, ids: string[]) => echo(ids));
    listShopifyProductsByIds.mockImplementation(async (_domain, _token, ids: string[]) => echo(ids));
  });

  // WooCommerce answers at most 100 rows per `include` request; asking for 250 at once used to return
  // the first hundred and silently drop the rest.
  it("never asks WooCommerce for more ids than one response can hold", async () => {
    const pager = await createCatalogPager(connection("wordpress"));
    const ids = Array.from({ length: 250 }, (_, index) => `p-${index}`);

    const products = await pager!.fetchByIds(ids);

    expect(products).toHaveLength(250);
    expect(listWooProductsByIds.mock.calls.map((call) => (call[3] as string[]).length)).toEqual([100, 100, 50]);
    expect(listWooProductsByIds.mock.calls.every((call) => call[5] === "AED")).toBe(true);
  });

  it("splits Shopify reads the same way and de-duplicates the ids", async () => {
    const pager = await createCatalogPager(connection("shopify"));
    const ids = [...Array.from({ length: 150 }, (_, index) => `p-${index}`), "p-0"];

    const products = await pager!.fetchByIds(ids);

    expect(products).toHaveLength(150);
    expect(listShopifyProductsByIds).toHaveBeenCalledTimes(2);
  });

  it("waits out a throttled chunk and retries it instead of failing the whole read", async () => {
    const throttled = Object.assign(new Error("slow down"), { throttled: true, retryAfterMs: 1 });
    listShopifyProductsByIds
      .mockRejectedValueOnce(throttled)
      .mockImplementation(async (_domain, _token, ids: string[]) => echo(ids));
    const pager = await createCatalogPager(connection("shopify"));

    const products = await pager!.fetchByIds(["a", "b"]);

    expect(products.map((product) => product.externalId)).toEqual(["a", "b"]);
    expect(listShopifyProductsByIds).toHaveBeenCalledTimes(2);
  });

  it("surfaces a real failure rather than retrying it", async () => {
    listShopifyProductsByIds.mockRejectedValueOnce(new Error("forbidden"));
    const pager = await createCatalogPager(connection("shopify"));

    await expect(pager!.fetchByIds(["a"])).rejects.toThrow("forbidden");
    expect(listShopifyProductsByIds).toHaveBeenCalledTimes(1);
  });
});
