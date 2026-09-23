import { describe, expect, it } from "vitest";
import { shopifyAttributedLines, shopifyOrderIdentity, shopifyRefundLines } from "./shopify-order";

describe("shopifyOrderIdentity", () => {
  it("anchors the window on order creation and counts the sale when it was paid", () => {
    const identity = shopifyOrderIdentity({
      id: 1001,
      name: "#1001",
      created_at: "2026-09-01T10:00:00-04:00",
      processed_at: "2026-09-12T09:00:00-04:00",
    });
    expect(identity).toEqual({
      orderId: "1001",
      orderName: "#1001",
      placedAt: "2026-09-01T14:00:00.000Z",
      occurredAt: "2026-09-12T13:00:00.000Z",
    });
  });
});

const coat = {
  id: 55,
  variant_id: 99,
  name: "Coat",
  quantity: 2,
  price: "40.00",
  properties: [{ name: "_persona", value: "sess-1" }],
  price_set: { shop_money: { amount: "40.00", currency_code: "USD" } },
  discount_allocations: [{ amount: "5.00", amount_set: { shop_money: { amount: "5.00", currency_code: "USD" } } }],
  tax_lines: [{ price: "3.00", price_set: { shop_money: { amount: "3.00", currency_code: "USD" } } }],
};

const untagged = {
  id: 56,
  variant_id: 100,
  name: "Hat",
  quantity: 1,
  properties: [],
  price_set: { shop_money: { amount: "10.00", currency_code: "USD" } },
};

describe("shopifyAttributedLines", () => {
  it("nets the tagged line after discounts and ignores untagged lines", () => {
    const lines = shopifyAttributedLines({ taxes_included: false, line_items: [coat, untagged] });
    expect(lines).toEqual([
      {
        lineId: "55",
        variantId: "99",
        name: "Coat",
        sessionId: "sess-1",
        amountMajor: 75,
        currency: "USD",
      },
    ]);
  });

  it("removes tax when the order price already includes it", () => {
    const lines = shopifyAttributedLines({ taxes_included: true, line_items: [coat] });
    expect(lines[0]?.amountMajor).toBe(72);
  });
});

describe("shopifyRefundLines", () => {
  const refund = {
    id: 9,
    order_id: 1001,
    refund_line_items: [
      {
        line_item_id: 55,
        subtotal_set: { shop_money: { amount: "40.00", currency_code: "USD" } },
        total_tax_set: { shop_money: { amount: "3.00", currency_code: "USD" } },
      },
    ],
  };

  it("keeps the subtotal when tax is added on top", () => {
    expect(shopifyRefundLines(refund, false)).toEqual([{ lineId: "55", amountMajor: 40, currency: "USD" }]);
  });

  it("subtracts tax when the price included it", () => {
    expect(shopifyRefundLines(refund, true)[0]?.amountMajor).toBe(37);
  });
});
