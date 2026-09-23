import { describe, expect, it, vi } from "vitest";
import { toUsdCents, usdCentsFromRate } from "./fx";

describe("usdCentsFromRate", () => {
  it("leaves dollars unchanged", () => {
    expect(usdCentsFromRate(12.5, "usd", {})).toEqual({ amountUsdCents: 1250, fxRate: 1 });
  });

  it("divides by the units-per-dollar rate", () => {
    expect(usdCentsFromRate(10, "SAR", { SAR: 3.75 })).toEqual({ amountUsdCents: 267, fxRate: 3.75 });
  });

  it("throws when the currency has no rate", () => {
    expect(() => usdCentsFromRate(10, "SAR", {})).toThrow(/No USD rate/);
  });
});

describe("toUsdCents", () => {
  it("does not fetch a rate for dollars", async () => {
    const loadRates = vi.fn(async () => ({ SAR: 3.75 }));
    await expect(toUsdCents(4, "USD", "2026-09-23", loadRates)).resolves.toEqual({ amountUsdCents: 400, fxRate: 1 });
    expect(loadRates).not.toHaveBeenCalled();
  });

  it("uses the loader for other currencies", async () => {
    const loadRates = vi.fn(async () => ({ AED: 3.67 }));
    await expect(toUsdCents(3.67, "AED", "2026-09-23", loadRates)).resolves.toEqual({ amountUsdCents: 100, fxRate: 3.67 });
    expect(loadRates).toHaveBeenCalledWith("2026-09-23");
  });
});
