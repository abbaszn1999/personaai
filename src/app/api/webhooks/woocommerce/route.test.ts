import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { POST } from "./route";

vi.mock("@/lib/catalog/index-product", () => ({ indexProductIfInScope: vi.fn() }));
vi.mock("@/lib/catalog/acs/sync", () => ({ markAcsProductOutOfStock: vi.fn() }));
vi.mock("@/lib/db/sync-new-products", () => ({ markSyncProductsRemoved: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionsByStoreUrl: vi.fn() }));
vi.mock("@/lib/catalog/path-config/rebuild", () => ({ markPathConfigStale: vi.fn() }));
vi.mock("@/lib/catalog/catalog-change", () => ({ noteStoreProductChanged: vi.fn() }));
vi.mock("@/lib/attribution/apply-woo-order", () => ({ applyWooOrder: vi.fn() }));
vi.mock("@/lib/woocommerce/client", () => ({ mapWooWebhookProduct: vi.fn() }));
vi.mock("@/lib/utils/internal-auth", () => ({
  deriveWebhookSecret: vi.fn(() => "secret"),
  verifyHmacSignature: vi.fn(() => true),
}));

import { indexProductIfInScope } from "@/lib/catalog/index-product";
import { getStoreConnectionsByStoreUrl } from "@/lib/db/store-connections";
import { applyWooOrder } from "@/lib/attribution/apply-woo-order";
import { mapWooWebhookProduct } from "@/lib/woocommerce/client";
import { deriveWebhookSecret, verifyHmacSignature } from "@/lib/utils/internal-auth";

const connection = { id: "connection-1", storeUrl: "https://shop.example" } as unknown as StoreConnectionRow;

function delivery(topic: string, payload: unknown = { id: 5 }): Request {
  return new Request("http://localhost/api/webhooks/woocommerce", {
    method: "POST",
    headers: {
      "x-wc-webhook-source": "https://shop.example",
      "x-wc-webhook-topic": topic,
      "x-wc-webhook-signature": "sig",
    },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/webhooks/woocommerce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStoreConnectionsByStoreUrl).mockResolvedValue([connection]);
    vi.mocked(deriveWebhookSecret).mockReturnValue("secret");
    vi.mocked(verifyHmacSignature).mockReturnValue(true);
    vi.mocked(mapWooWebhookProduct).mockReturnValue({ externalId: "5" } as never);
    vi.mocked(indexProductIfInScope).mockResolvedValue("indexed" as never);
  });

  it.each(["order.created", "order.updated"])("routes %s to sales attribution", async (topic) => {
    const response = await POST(delivery(topic, { id: 42 }));

    expect(response.status).toBe(200);
    expect(applyWooOrder).toHaveBeenCalledWith(connection, { id: 42 });
    expect(mapWooWebhookProduct).not.toHaveBeenCalled();
    expect(indexProductIfInScope).not.toHaveBeenCalled();
  });

  it("picks the connection whose secret verifies when the store is connected twice", async () => {
    const other = { id: "connection-0", storeUrl: "https://shop.example" } as unknown as StoreConnectionRow;
    vi.mocked(getStoreConnectionsByStoreUrl).mockResolvedValue([other, connection]);
    vi.mocked(deriveWebhookSecret).mockImplementation((id: string) => `secret-${id}`);
    vi.mocked(verifyHmacSignature).mockImplementation((_body, _sig, secret) => secret === "secret-connection-1");

    const response = await POST(delivery("order.created", { id: 42 }));

    expect(response.status).toBe(200);
    expect(applyWooOrder).toHaveBeenCalledWith(connection, { id: 42 });
  });

  it("acknowledges order.deleted without recording anything", async () => {
    const response = await POST(delivery("order.deleted"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: "order.deleted" });
    expect(applyWooOrder).not.toHaveBeenCalled();
    expect(indexProductIfInScope).not.toHaveBeenCalled();
  });

  it("still indexes product updates", async () => {
    const response = await POST(delivery("product.updated"));

    expect(response.status).toBe(200);
    expect(indexProductIfInScope).toHaveBeenCalled();
    expect(applyWooOrder).not.toHaveBeenCalled();
  });
});
