import { describe, expect, it } from "vitest";
import { ACS_SEARCH_NANOS, GEMINI_INPUT_TOKEN_NANOS, GEMINI_OUTPUT_TOKEN_NANOS } from "./pricing";
import { addAcsSearch, addTokenCost, createSessionMeter, sessionUsageIdempotencyKey } from "./session-meter";

describe("session meter", () => {
  it("ignores a missing meter", () => {
    expect(() => addTokenCost(undefined, 10, 10)).not.toThrow();
    expect(() => addAcsSearch(undefined)).not.toThrow();
  });

  it("prices tokens in nano-dollars and counts the call even when usage is zero", () => {
    const meter = createSessionMeter();
    addTokenCost(meter, 1_000, 200);
    addTokenCost(meter, 0, 0);

    expect(meter.nanos).toBe(1_000 * GEMINI_INPUT_TOKEN_NANOS + 200 * GEMINI_OUTPUT_TOKEN_NANOS);
    expect(meter.geminiCalls).toBe(2);
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