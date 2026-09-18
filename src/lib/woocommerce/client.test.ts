import { describe, expect, it } from "vitest";
import { mapWooWebhookProduct } from "./client";

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
