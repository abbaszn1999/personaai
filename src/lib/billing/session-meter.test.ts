import { describe, expect, it } from "vitest";
import { ACS_SEARCH_NANOS, geminiTokenRates } from "./pricing";
import { addAcsSearch, addTokenCost, createSessionMeter, sessionUsageIdempotencyKey } from "./session-meter";

const INTRO = Date.UTC(2026, 9, 6);

describe("session meter", () => {
  it("ignores a missing meter", () => {
    expect(() => addTokenCost(undefined, { inputTokens: 10, outputTokens: 10 })).not.toThrow();
    expect(() => addAcsSearch(undefined)).not.toThrow();
  });

  it("prices tokens in nano-dollars and counts the call even when usage is zero", () => {
    const meter = createSessionMeter();
    const rates = geminiTokenRates(INTRO);
    addTokenCost(meter, { inputTokens: 1_000, outputTokens: 200 }, INTRO);
    addTokenCost(meter, { inputTokens: 0, outputTokens: 0 }, INTRO);

    expect(meter.nanos).toBe(1_000 * rates.input + 200 * rates.output);
    expect(meter.geminiCalls).toBe(2);
  });

  it("bills cached input tokens at the cached rate and only the rest at the input rate", () => {
    const meter = createSessionMeter();
    const rates = geminiTokenRates(INTRO);
    addTokenCost(meter, { inputTokens: 1_000, outputTokens: 0, cachedTokens: 900 }, INTRO);

    expect(meter.nanos).toBe(100 * rates.input + 900 * rates.cachedInput);
  });

  it("prices one ACS search as one session unit", () => {
    const meter = createSessionMeter();
    addAcsSearch(meter);
    addAcsSearch(meter);

    expect(meter.acsSearches).toBe(2);
    expect(meter.nanos).toBe(2 * ACS_SEARCH_NANOS);
  });

  it("builds an idempotency key from the session and the shopper message", () => {
    expect(sessionUsageIdempotencyKey("session-1", "msg-u-1710000000000")).toBe(
      "chat:session-1:msg-u-1710000000000"
    );
    expect(sessionUsageIdempotencyKey("session-1", "short")).toBeNull();
    expect(sessionUsageIdempotencyKey("  ", "msg-u-1710000000000")).toBeNull();
  });
});
