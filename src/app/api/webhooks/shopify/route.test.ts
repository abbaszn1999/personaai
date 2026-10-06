import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { POST } from "./route";

vi.mock("@/lib/catalog/index-product", () => ({ indexProductIfInScope: vi.fn() }));
vi.mock("@/lib/catalog/acs/sync", () => ({ markAcsProductOutOfStock: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionByStoreUrl: vi.fn() }));
vi.mock("@/lib/catalog/path-config/rebuild", () => ({ markPathConfigStale: vi.fn() }));
vi.mock("@/lib/catalog/catalog-change", () => ({ noteStoreProductChanged: vi.fn() }));
vi.mock("@/lib/attribution/apply-shopify-order", () => ({ applyShopifyOrderTopic: vi.fn() }));
vi.mock("@/lib/shopify/client", () => ({
  mapShopifyWebhookProduct: vi.fn(),
  normalizeShopifyDomain: (value: string) => value,
}));
vi.mock("@/lib/utils/crypto", () => ({ decodeCredentials: vi.fn(() => ({ clientSecret: "secret" })) }));
vi.mock("@/lib/utils/internal-auth", () => ({ verifyHmacSignature: vi.fn(() => true) }));

import { indexProductIfInScope } from "@/lib/catalog/index-product";
import { markAcsProductOutOfStock } from "@/lib/catalog/acs/sync";
import { getStoreConnectionByStoreUrl } from "@/lib/db/store-connections";
import { applyShopifyOrderTopic } from "@/lib/attribution/apply-shopify-order";
import { mapShopifyWebhookProduct } from "@/lib/shopify/client";
import { verifyHmacSignature } from "@/lib/utils/internal-auth";

const connection = {
  id: "connection-1",
  storeUrl: "shop.myshopify.com",
  apiKeyEncrypted: "encrypted",
} as unknown as StoreConnectionRow;

function delivery(topic: string, payload: unknown = { id: 1 }): Request {
  return new Request("http://localhost/api/webhooks/shopify", {
    method: "POST",
    headers: {
      "x-shopify-shop-domain": "shop.myshopify.com",
      "x-shopify-topic": topic,
      "x-shopify-hmac-sha256": "sig",
    },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/webhooks/shopify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStoreConnectionByStoreUrl).mockResolvedValue(connection);
    vi.mocked(verifyHmacSignature).mockReturnValue(true);
    vi.mocked(mapShopifyWebhookProduct).mockReturnValue({ externalId: "gid://shopify/Product/1" } as never);
    vi.mocked(indexProductIfInScope).mockResolvedValue("indexed" as never);
  });

  it.each(["orders/paid", "orders/cancelled", "refunds/create"])(
    "routes %s to sales attribution and never to the catalog",
    async (topic) => {
      const response = await POST(delivery(topic, { id: 99 }));

      expect(response.status).toBe(200);
      expect(applyShopifyOrderTopic).toHaveBeenCalledWith(connection, topic, { id: 99 });
      expect(mapShopifyWebhookProduct).not.toHaveBeenCalled();
      expect(indexProductIfInScope).not.toHaveBeenCalled();
    },
  );

  it("returns 500 when attribution fails so Shopify retries the delivery", async () => {
    vi.mocked(applyShopifyOrderTopic).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(delivery("orders/paid"));

    expect(response.status).toBe(500);
  });

  it("still indexes product updates", async () => {
    const response = await POST(delivery("products/update"));

    expect(response.status).toBe(200);
    expect(indexProductIfInScope).toHaveBeenCalled();
    expect(applyShopifyOrderTopic).not.toHaveBeenCalled();
  });

  it("still downgrades deleted products instead of removing them", async () => {
    await POST(delivery("products/delete", { id: 7 }));

    expect(markAcsProductOutOfStock).toHaveBeenCalledWith("connection-1", "gid://shopify/Product/7");
  });

  it("rejects a delivery with a bad signature before touching anything", async () => {
    vi.mocked(verifyHmacSignature).mockReturnValue(false);

    const response = await POST(delivery("orders/paid"));

    expect(response.status).toBe(401);
    expect(applyShopifyOrderTopic).not.toHaveBeenCalled();
  });
});
