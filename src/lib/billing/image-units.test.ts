import { describe, expect, it } from "vitest";
import { allocateImageUnits } from "./image-units";

describe("allocateImageUnits", () => {
  it("charges a three-garment try-on entirely to the included allowance", () => {
    expect(allocateImageUnits({ usedThisCycle: 0, includedAllowance: 5000, units: 3, credits: 0 })).toEqual({
      fromIncluded: 3,
      fromCredits: 0,
    });
  });

  it("splits a try-on across the last included units and the purchased balance", () => {
    expect(allocateImageUnits({ usedThisCycle: 4999, includedAllowance: 5000, units: 3, credits: 10 })).toEqual({
      fromIncluded: 1,
      fromCredits: 2,
    });
  });

  it("refuses when the included remainder and the purchased balance together fall short", () => {
    expect(allocateImageUnits({ usedThisCycle: 5000, includedAllowance: 5000, units: 3, credits: 2 })).toBeNull();
  });

  it("charges one unit for an avatar image once the include is used up", () => {
    expect(allocateImageUnits({ usedThisCycle: 5000, includedAllowance: 5000, units: 1, credits: 1 })).toEqual({
      fromIncluded: 0,
      fromCredits: 1,
    });
  });

  it("allows a charge that stays inside the grace floor and refuses one that passes it", () => {
    expect(
      allocateImageUnits({
        usedThisCycle: 12_500,
        includedAllowance: 12_500,
        units: 100,
        credits: 0,
        balanceFloor: -625,
      })
    ).toEqual({ fromIncluded: 0, fromCredits: 100 });
    expect(
      allocateImageUnits({
        usedThisCycle: 12_500,
        includedAllowance: 12_500,
        units: 700,
        credits: 0,
        balanceFloor: -625,
      })
    ).toBeNull();
  });

  it("rejects a non-positive unit count", () => {
    expect(allocateImageUnits({ usedThisCycle: 0, includedAllowance: 5000, units: 0, credits: 10 })).toBeNull();
  });
});
