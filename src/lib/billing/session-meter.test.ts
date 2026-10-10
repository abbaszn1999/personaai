import { describe, expect, it, vi } from "vitest";
import { ACS_SEARCH_NANOS, geminiTokenRates } from "./pricing";
import { addAcsSearch, addTokenCost, createSessionMeter, sessionUsageIdempotencyKey, trackPendingCost } from "./session-meter";

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

describe("session meter detail and stragglers", () => {
  it("keeps the turn's token detail and model next to its cost", () => {
    const meter = createSessionMeter();
    addTokenCost(meter, { inputTokens: 13_000, outputTokens: 220, cachedTokens: 12_700 }, INTRO, "gemini-3.8-flash");
    addTokenCost(meter, { inputTokens: 13_100, outputTokens: 180, cachedTokens: 12_700 }, INTRO, "gemini-3.8-flash");
    expect(meter).toMatchObject({ inputTokens: 26_100, cachedTokens: 25_400, outputTokens: 400, model: "gemini-3.8-flash", geminiCalls: 2 });
  });

  it("charges an unpriced model at the highest known rates, never less", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const known = createSessionMeter();
    const unknown = createSessionMeter();
    addTokenCost(known, { inputTokens: 1_000, outputTokens: 100 }, INTRO, "gemini-3.8-flash");
    addTokenCost(unknown, { inputTokens: 1_000, outputTokens: 100 }, INTRO, "gemini-9-ultra");
    expect(unknown.nanos).toBeGreaterThan(known.nanos);
  });

  it("tracks a call still running, without ever turning its failure into an unhandled rejection", async () => {
    const meter = createSessionMeter();
    trackPendingCost(meter, Promise.reject(new Error("timed out")));
    trackPendingCost(undefined, Promise.reject(new Error("no meter")));
    await expect(Promise.all(meter.pending)).resolves.toEqual([undefined]);
  });

  it("keys each request on its own, so a retry of the same message is charged again", () => {
    const first = sessionUsageIdempotencyKey("session-1", "msg-u-1710000000000", "req-aaaaaaaa");
    const retry = sessionUsageIdempotencyKey("session-1", "msg-u-1710000000000", "req-bbbbbbbb");
    expect(first).not.toBe(retry);
    expect(sessionUsageIdempotencyKey("session-1", undefined, "req-cccccccc")).toBe("chat:session-1:turn:req-cccccccc");
  });
});
