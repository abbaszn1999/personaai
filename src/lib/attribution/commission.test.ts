import { describe, expect, it } from "vitest";
import { computeCommission } from "./commission";

describe("computeCommission", () => {
  it("bills 3% of unbilled billable GMV", () => {
    const result = computeCommission([
      { amountUsdCents: 10_000, billable: true, charged: false },
      { amountUsdCents: -2_000, billable: true, charged: false },
    ]);
    expect(result).toEqual({ gmvUsdCents: 8_000, commissionUsdCents: 240, deferred: false });
  });

  it("defers a negative balance to the next invoice", () => {
    const result = computeCommission([{ amountUsdCents: -500, billable: true, charged: false }]);
    expect(result.commissionUsdCents).toBe(0);
    expect(result.deferred).toBe(true);
  });

  it("defers a commission under 50 cents", () => {
    const result = computeCommission([{ amountUsdCents: 1_000, billable: true, charged: false }]);
    expect(result.commissionUsdCents).toBe(0);
    expect(result.deferred).toBe(true);
    expect(result.gmvUsdCents).toBe(1_000);
  });

  it("ignores trial rows and rows already on an invoice", () => {
    const result = computeCommission([
      { amountUsdCents: 50_000, billable: false, charged: false },
      { amountUsdCents: 50_000, billable: true, charged: true },
      { amountUsdCents: 10_000, billable: true, charged: false },
    ]);
    expect(result.commissionUsdCents).toBe(300);
  });
});
