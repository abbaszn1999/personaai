import { describe, expect, it } from "vitest";
import {
  ACS_SEARCH_NANOS,
  AVATAR_IMAGE_NANOS,
  GEMINI_STANDARD_PRICING_STARTS_MS,
  GARMENT_UNIT_NANOS,
  LIVE_SECOND_NANOS,
  SESSION_UNIT_NANOS,
  avatarCostNanos,
  geminiTokenCostNanos,
  geminiTokenRates,
  tryOnCostNanos,
} from "./pricing";

const NANOS_PER_DOLLAR = 1_000_000_000;

describe("Gemini 3.x Flash prices", () => {
  it("matches Google's introductory Standard list through 2026-12-31", () => {
    // $0.75 in, $3.75 out, $0.075 cached input — per 1M tokens, i.e. nano-dollars per token.
    expect(geminiTokenRates(Date.UTC(2026, 9, 6))).toEqual({ input: 750, output: 3_750, cachedInput: 75 });
    expect(geminiTokenRates(Date.UTC(2026, 11, 31, 23, 59, 59))).toEqual({ input: 750, output: 3_750, cachedInput: 75 });
  });

  it("doubles on 2027-01-01", () => {
    expect(GEMINI_STANDARD_PRICING_STARTS_MS).toBe(Date.UTC(2027, 0, 1));
    expect(geminiTokenRates(Date.UTC(2027, 0, 1))).toEqual({ input: 1_500, output: 7_500, cachedInput: 150 });
    expect(geminiTokenRates(new Date("2027-06-01T00:00:00Z"))).toEqual({ input: 1_500, output: 7_500, cachedInput: 150 });
  });

  it("keeps the cached rate at a tenth of the input rate in both periods", () => {
    for (const at of [Date.UTC(2026, 9, 6), Date.UTC(2027, 5, 1)]) {
      const rates = geminiTokenRates(at);
      expect(rates.cachedInput * 10).toBe(rates.input);
    }
  });

  it("prices the 2026-10-06 'Find me a jacket' turn: 16,293 of ~17,047 prompt tokens were cached", () => {
    const at = Date.UTC(2026, 9, 6);
    const cost = geminiTokenCostNanos({ inputTokens: 17_047, outputTokens: 0, cachedTokens: 16_293 }, at);
    // 754 uncached tokens at $0.75/M plus 16,293 cached tokens at $0.075/M.
    expect(cost).toBe(754 * 750 + 16_293 * 75);
    expect(cost).toBeLessThan(2_000_000);
    // What the same turn was billed before cached tokens were priced separately.
    expect(17_047 * 750).toBe(12_785_250);
  });

  it("never treats more tokens as cached than were sent, and ignores bad counts", () => {
    const at = Date.UTC(2026, 9, 6);
    expect(geminiTokenCostNanos({ inputTokens: 100, outputTokens: 0, cachedTokens: 500 }, at)).toBe(100 * 75);
    expect(geminiTokenCostNanos({ inputTokens: Number.NaN, outputTokens: -5, cachedTokens: -1 }, at)).toBe(0);
  });
});

describe("other vendor prices", () => {
  it("prices one search at $2.50 per 1,000 and one session unit at one search", () => {
    expect(ACS_SEARCH_NANOS * 1_000).toBe(2.5 * NANOS_PER_DOLLAR);
    expect(SESSION_UNIT_NANOS).toBe(ACS_SEARCH_NANOS);
  });

  it("prices an avatar at Pruna's $0.010 and a garment unit at $0.008", () => {
    expect(AVATAR_IMAGE_NANOS).toBe(0.01 * NANOS_PER_DOLLAR);
    expect(avatarCostNanos(3)).toBe(0.03 * NANOS_PER_DOLLAR);
    expect(GARMENT_UNIT_NANOS).toBe(0.008 * NANOS_PER_DOLLAR);
  });

  it("prices try-on at $0.015 for the first garment and $0.008 for each more", () => {
    expect(tryOnCostNanos(0)).toBe(0);
    expect(tryOnCostNanos(1)).toBe(0.015 * NANOS_PER_DOLLAR);
    expect(tryOnCostNanos(3)).toBe((0.015 + 2 * 0.008) * NANOS_PER_DOLLAR);
  });

  it("prices live try-on at Decart's $0.02 per second ($1.20 a minute)", () => {
    expect(LIVE_SECOND_NANOS).toBe(0.02 * NANOS_PER_DOLLAR);
  });
});
