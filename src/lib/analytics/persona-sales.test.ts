import { describe, expect, it } from "vitest";
import {
  attributedOrdersCsv,
  orderConversionRate,
  percentChange,
  pointChange,
  returnOnSpend,
  summarizePersonaSales,
  utcDayKey,
  type SalesLedgerRow,
} from "./persona-sales";

function sale(overrides: Partial<SalesLedgerRow> = {}): SalesLedgerRow {
  return {
    orderId: "1001",
    productName: "Linen Shirt",
    platformItemId: "v-1",
    kind: "sale",
    amountUsdCents: 10_000,
    matchMethod: "line_tag",
    billable: true,
    sessionId: "s-1",
    occurredAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("summarizePersonaSales", () => {
  it("nets refunds against sales and counts each order once", () => {
    const summary = summarizePersonaSales([
      sale(),
      sale({ platformItemId: "v-2", productName: "Chinos", amountUsdCents: 5_000 }),
      sale({ orderId: "1002", amountUsdCents: 8_000, sessionId: "s-2" }),
      sale({ kind: "refund", amountUsdCents: -3_000, occurredAt: "2026-09-21T09:00:00.000Z" }),
    ]);
    expect(summary.grossUsdCents).toBe(23_000);
    expect(summary.refundsUsdCents).toBe(3_000);
    expect(summary.netUsdCents).toBe(20_000);
    expect(summary.orders).toBe(2);
    expect(summary.avgOrderUsdCents).toBe(11_500);
    expect(summary.refundRate).toBe(13);
    expect(summary.orderSessionIds).toEqual(new Set(["s-1", "s-2"]));
    expect(summary.byDay.get("2026-09-21")).toBe(-3_000);
  });

  it("charges commission only on Main-plan sales", () => {
    const summary = summarizePersonaSales([
      sale({ amountUsdCents: 20_000, billable: true }),
      sale({ orderId: "1002", amountUsdCents: 10_000, billable: false }),
    ]);
    expect(summary.billableNetUsdCents).toBe(20_000);
    expect(summary.commissionUsdCents).toBe(600);
    expect(summary.unbilledNetUsdCents).toBe(10_000);
  });

  it("splits sales by attribution method", () => {
    const summary = summarizePersonaSales([
      sale(),
      sale({ orderId: "w-7", matchMethod: "device_match", amountUsdCents: 4_000 }),
    ]);
    expect(summary.byMethod.line_tag).toEqual({ netUsdCents: 10_000, orders: 1 });
    expect(summary.byMethod.device_match).toEqual({ netUsdCents: 4_000, orders: 1 });
  });

  it("ranks products by net sales", () => {
    const summary = summarizePersonaSales([
      sale({ amountUsdCents: 3_000 }),
      sale({ orderId: "1002", platformItemId: "v-9", productName: "Coat", amountUsdCents: 30_000 }),
    ]);
    expect(summary.topProducts[0]).toMatchObject({ name: "Coat", orders: 1, netUsdCents: 30_000 });
  });

  it("returns zeros for an empty window", () => {
    const summary = summarizePersonaSales([]);
    expect(summary.netUsdCents).toBe(0);
    expect(summary.avgOrderUsdCents).toBe(0);
    expect(summary.refundRate).toBe(0);
    expect(summary.topProducts).toEqual([]);
  });
});

describe("attributedOrdersCsv", () => {
  it("keeps refunds numeric and neutralises formula text", () => {
    const csv = attributedOrdersCsv([
      {
        occurredAt: "2026-09-20T10:00:00.000Z",
        orderId: "1001",
        orderName: null,
        productName: "=HYPERLINK(\"x\")",
        kind: "refund",
        amountOriginal: -12,
        currency: "EUR",
        amountUsdCents: -1300,
        matchMethod: "device_match",
        billable: false,
        chargeId: null,
      },
    ]);
    const [, line] = csv.trim().split("\r\n");
    expect(line).toBe(
      `2026-09-20 10:00:00,#1001,"'=HYPERLINK(""x"")",Refund,-12.00,EUR,-13.00,Same device added it within 7 days,Trial (no commission)`
    );
  });
});

describe("rates", () => {
  it("computes conversion, return on spend, and changes", () => {
    expect(orderConversionRate(3, 120)).toBe(2.5);
    expect(orderConversionRate(3, 0)).toBe(0);
    expect(returnOnSpend(840_000, 100_000)).toBe(8.4);
    expect(returnOnSpend(840_000, null)).toBeNull();
    expect(returnOnSpend(840_000, 0)).toBeNull();
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(5, 0)).toBe(100);
    expect(pointChange(4.5, 3)).toBe(1.5);
  });

  it("buckets timestamps by UTC day", () => {
    expect(utcDayKey("2026-09-20T23:30:00-02:00")).toBe("2026-09-21");
  });
});
