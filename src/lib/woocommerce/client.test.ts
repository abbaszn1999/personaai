import { afterEach, describe, expect, it, vi } from "vitest";
import { getWordPressProductCount, listWooCatalogPage, mapWooWebhookProduct, WooCommerceApiError } from "./client";

// Keeps the transient-retry tests below instant rather than paying the real backoff delay —
// nothing here exercises `createTimeoutSignal`'s real timer either.
vi.mock("@/lib/catalog/timeout", () => ({
  createTimeoutSignal: () => ({ signal: undefined, cancel: () => {} }),
  sleep: () => Promise.resolve(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Covers `toWooBuiltInFields`/`toWooCustomFields` through the one exported entry point that
 * exercises them — the webhook mapper takes the same wire shape WooCommerce's REST list endpoint
 * returns, so a fixture built against it is honest about what a real store sends.
 */
describe("mapWooWebhookProduct", () => {
  const basePayload = {
    id: 501,
    name: "Relaxed Fit Linen Shirt",
    description: "<p>Breathable linen.</p>",
    short_description: "",
    price: "68",
    images: [],
    categories: [],
    tags: [],
    attributes: [],
    stock_status: "instock" as const,
  };

  it("surfaces WooCommerce's own built-in fields as field.* custom columns", () => {
    const product = mapWooWebhookProduct({
      ...basePayload,
      short_description: "<p>Camp collar, relaxed fit.</p>",
      tags: [{ name: "Sale" }, { name: "New&amp;In" }],
      regular_price: "78",
      sale_price: "68",
      on_sale: true,
      stock_quantity: 12,
      weight: "0.4",
      dimensions: { length: "30", width: "20", height: "2" },
      featured: true,
    });

    expect(product?.customFields).toEqual({
      "field.tags": "Sale, New&In",
      "field.short_description": "Camp collar, relaxed fit.",
      "field.regular_price": "78",
      "field.sale_price": "68",
      "field.on_sale": "true",
      "field.stock_quantity": "12",
      "field.weight": "0.4",
      "field.dimensions": "30 x 20 x 2",
      "field.featured": "true",
    });
  });

  it("omits a built-in field entirely rather than writing an empty column when the store has nothing to say", () => {
    const product = mapWooWebhookProduct(basePayload);
    expect(product?.customFields).toEqual({});
  });

  it("keeps built-in fields and plugin meta_data side by side without either clobbering the other", () => {
    const product = mapWooWebhookProduct({
      ...basePayload,
      tags: [{ name: "Sale" }],
      meta_data: [{ key: "fit_note", value: "Runs small" }],
    });

    expect(product?.customFields).toEqual({
      "field.tags": "Sale",
      "meta.fit_note": "Runs small",
    });
  });

  it("still drops WordPress's protected _-prefixed meta and non-scalar values", () => {
    const product = mapWooWebhookProduct({
      ...basePayload,
      meta_data: [
        { key: "_edit_lock", value: "123:1" },
        { key: "size_chart", value: { nested: true } },
        { key: "care_label", value: "Machine wash cold" },
      ],
    });

    expect(product?.customFields).toEqual({ "meta.care_label": "Machine wash cold" });
  });

  it("reports a numeric or boolean built-in field even when the value is falsy", () => {
    const product = mapWooWebhookProduct({
      ...basePayload,
      stock_quantity: 0,
      on_sale: false,
      featured: false,
    });

    expect(product?.customFields).toEqual({
      "field.stock_quantity": "0",
      "field.on_sale": "false",
      "field.featured": "false",
    });
  });
});

/**
 * Covers the retry behavior every `wooFetch` call gets for free, exercised through
 * `getWordPressProductCount` — one of the simplest single-request callers.
 */
describe("wooFetch transient retry", () => {
  it("retries a transient 500 and succeeds without surfacing an error", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ message: "Error establishing a database connection" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json", "x-wp-total": "42" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getWordPressProductCount("https://store.example", "admin", "secret")).resolves.toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting its retries and surfaces the WooCommerceApiError", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ message: "Service Unavailable" }), { status: 503 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getWordPressProductCount("https://store.example", "admin", "secret")).rejects.toBeInstanceOf(
      WooCommerceApiError
    );
    // Initial attempt plus two retries.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-transient error like 404", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getWordPressProductCount("https://store.example", "admin", "secret")).rejects.toMatchObject({
      status: 404,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("listWooCatalogPage skipVariants", () => {
  const variableProduct = {
    id: 42,
    name: "Linen Shirt",
    description: "",
    short_description: "",
    price: "68",
    images: [],
    categories: [],
    tags: [],
    attributes: [],
    stock_status: "instock" as const,
    sku: "SHIRT-1",
    permalink: "https://store.example/product/linen-shirt",
    date_modified_gmt: "2026-01-01T00:00:00",
    type: "variable",
  };

  it("skips the per-product /variations request entirely and returns a synthetic variant", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).not.toContain("/variations");
      return new Response(JSON.stringify([variableProduct]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { products } = await listWooCatalogPage("https://store.example", "admin", "secret", {
      page: 1,
      skipVariants: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(products[0]?.variants).toHaveLength(1);
    expect(products[0]?.variants[0]?.externalId).toBe("42");
  });

  it("still fetches variations for a variable product when skipVariants is not set", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/variations")) {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify([variableProduct]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await listWooCatalogPage("https://store.example", "admin", "secret", { page: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
