import { beforeEach, describe, expect, it, vi } from "vitest";

const consumeSessionUnits = vi.fn(async (input: unknown) => {
  void input;
  return 100;
});
vi.mock("@/lib/db/session-usage", () => ({ consumeSessionUnits: (input: unknown) => consumeSessionUnits(input) }));

const { flushSessionMeter } = await import("./flush-session-meter");
const { addAcsSearch, addTokenCost, createSessionMeter, trackPendingCost } = await import("./session-meter");

const base = {
  ownerId: "owner-1",
  sessionId: "session-1",
  history: [{ role: "user", id: "msg-u-1710000000000" }],
  cycleStartIso: "2026-10-01T00:00:00.000Z",
  includedAllowance: 0,
  source: "store" as const,
};

beforeEach(() => consumeSessionUnits.mockClear());

describe("flushSessionMeter", () => {
  it("waits for a request still running and charges the turn with it included", async () => {
    const meter = createSessionMeter();
    addTokenCost(meter, { inputTokens: 1_000, outputTokens: 100 }, undefined, "gemini-3.8-flash");
    addAcsSearch(meter);
    const late = new Promise<void>((resolve) =>
      setTimeout(() => {
        addTokenCost(meter, { inputTokens: 1_000, outputTokens: 100 }, undefined, "gemini-3.8-flash");
        resolve();
      }, 20)
    );
    trackPendingCost(meter, late);

    await flushSessionMeter({ ...base, meter, requestId: "req-12345678" });

    expect(consumeSessionUnits).toHaveBeenCalledTimes(1);
    expect(consumeSessionUnits.mock.calls[0][0]).toMatchObject({
      geminiCalls: 2,
      acsSearches: 1,
      inputTokens: 2_000,
      outputTokens: 200,
      model: "gemini-3.8-flash",
      idempotencyKey: "chat:session-1:msg-u-1710000000000:req-12345678",
    });
  });

  it("charges a turn that carries no message id when the request has its own id", async () => {
    const meter = createSessionMeter();
    addAcsSearch(meter);
    await flushSessionMeter({ ...base, history: [], meter, requestId: "req-87654321" });
    expect(consumeSessionUnits).toHaveBeenCalledTimes(1);
  });

  it("charges nothing for a turn that ran nothing", async () => {
    await flushSessionMeter({ ...base, meter: createSessionMeter(), requestId: "req-12345678" });
    expect(consumeSessionUnits).not.toHaveBeenCalled();
  });
});
