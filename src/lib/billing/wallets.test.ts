import { describe, expect, it } from "vitest";
import {
  graceFloor,
  overageBlocksCharge,
  overageCentsFromMicro,
  overageMicroCents,
  quoteGarmentUnits,
  quoteLiveMinutes,
  quoteSessionUnits,
  rolloverAdded,
  rolloverAddedForCycle,
  suggestedTopUpQuantity,
  walletHeadroom,
} from "./wallets";

describe("at-cost quotes", () => {
  it("prices session packs at $2.50 per 1,000 with a 10,000 unit minimum", () => {
    expect(quoteSessionUnits(10_000)).toEqual({
      stripeQuantity: 10,
      amountCents: 2_500,
      granted: 10_000,
    });
    expect(quoteSessionUnits(25_000)?.amountCents).toBe(6_250);
    expect(quoteSessionUnits(9_000)).toBeNull();
    expect(quoteSessionUnits(10_500)).toBeNull();
  });

  it("prices garment packs at $0.80 per 100 with a 5,000 unit minimum", () => {
    expect(quoteGarmentUnits(5_000)).toEqual({
      stripeQuantity: 50,
      amountCents: 4_000,
      granted: 5_000,
    });
    expect(quoteGarmentUnits(4_900)).toBeNull();
  });

  it("prices Lucy minutes at $1.20 with a 25 minute minimum", () => {
    expect(quoteLiveMinutes(25)).toEqual({
      stripeQuantity: 25,
      amountCents: 3_000,
      granted: 1_500,
    });
    expect(quoteLiveMinutes(24)).toBeNull();
  });
});

describe("grace and spend cap", () => {
  it("sets the floor at 5% of the included allowance below zero", () => {
    expect(graceFloor(100_000)).toBe(-5_000);
    expect(graceFloor(12_500)).toBe(-625);
    expect(graceFloor(3_000)).toBe(-150);
    expect(walletHeadroom({ used: 100_000, included: 100_000, balance: -4_999 })).toBe(1);
    expect(walletHeadroom({ used: 100_000, included: 100_000, balance: -5_000 })).toBe(0);
  });

  it("prices overage at cost and blocks only charges that would add more once the cap is hit", () => {
    const micro = overageMicroCents({
      sessionOverageUnits: 1_000,
      liveOverageSeconds: 60,
      garmentOverageUnits: 100,
    });
    expect(overageCentsFromMicro(micro)).toBe(250 + 120 + 80);
    expect(overageBlocksCharge({ capCents: 450, overageMicroCents: micro, addsOverage: true })).toBe(true);
    expect(overageBlocksCharge({ capCents: 450, overageMicroCents: micro, addsOverage: false })).toBe(false);
    expect(overageBlocksCharge({ capCents: null, overageMicroCents: micro, addsOverage: true })).toBe(false);
  });
});

describe("rollover", () => {
  it("banks unused include for a carrying plan and leaves a non-carrying plan unchanged", () => {
    expect(rolloverAdded({ carries: true, balance: 0, allowance: 100_000, used: 40_000 })).toBe(60_000);
    expect(rolloverAdded({ carries: false, balance: 0, allowance: 50_000, used: 0 })).toBe(0);
  });

  it("stops at twice the monthly include and skips the first cycle", () => {
    expect(rolloverAdded({ carries: true, balance: 190_000, allowance: 100_000, used: 80_000 })).toBe(10_000);
    expect(rolloverAdded({ carries: true, balance: 250_000, allowance: 100_000, used: 0 })).toBe(0);
    expect(
      rolloverAddedForCycle({
        hasPreviousCycle: false,
        previousCarries: true,
        balance: 0,
        allowance: 100_000,
        used: 0,
      })
    ).toBe(0);
    expect(
      rolloverAddedForCycle({
        hasPreviousCycle: true,
        previousCarries: false,
        balance: 0,
        allowance: 50_000,
        used: 0,
      })
    ).toBe(0);
  });
});

describe("suggested top-up", () => {
  it("raises two weeks of burn to the wallet minimum and the pack size", () => {
    expect(suggestedTopUpQuantity({ dailyBurn: 10, packSize: 100, minPacks: 50, maxPacks: 5_000 })).toBe(5_000);
    expect(suggestedTopUpQuantity({ dailyBurn: 1_000, packSize: 100, minPacks: 50, maxPacks: 5_000 })).toBe(14_000);
    expect(suggestedTopUpQuantity({ dailyBurn: 0, packSize: 1_000, minPacks: 10, maxPacks: 10_000 })).toBe(10_000);
  });
});
