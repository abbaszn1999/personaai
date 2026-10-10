import { ThinkingLevel } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();

vi.mock("@/lib/ai/gemini", () => ({
  getGeminiClient: () => ({ models: { generateContent } }),
}));

const forgetPrefixCache = vi.fn();

vi.mock("@/lib/ai/gemini-cache", () => ({
  resolvePrefixCache: () => null,
  forgetPrefixCache: (name: string) => forgetPrefixCache(name),
}));

import { GeminiChatError } from "@/lib/ai/gemini-chat";
import { callStructured, hedged } from "./structured-call";

const ok = { text: '{"a":1}', usageMetadata: {} };
const minimalRejected = new Error(
  '{"error":{"code":400,"message":"Thinking level MINIMAL is not supported for this model. Please retry with other thinking level.","status":"INVALID_ARGUMENT"}}',
);

function request(model: string, thinking: "off" | "on" = "off") {
  return { apiKey: "k", model, prefix: "p", userText: "u", schema: {}, thinking, label: "test" };
}

function levelOf(call: number): unknown {
  return generateContent.mock.calls[call][0].config.thinkingConfig?.thinkingLevel;
}

describe("callStructured thinking level", () => {
  beforeEach(() => generateContent.mockReset());

  it("sends MINIMAL when thinking is off", async () => {
    generateContent.mockResolvedValueOnce(ok);
    await callStructured(request("model-minimal-ok"));
    expect(levelOf(0)).toBe(ThinkingLevel.MINIMAL);
  });

  it("retries at LOW once a model rejects MINIMAL, and sends LOW from then on", async () => {
    generateContent.mockRejectedValueOnce(minimalRejected).mockResolvedValue(ok);
    const result = await callStructured<{ a: number }>(request("model-no-minimal"));
    expect(result.value).toEqual({ a: 1 });
    expect(levelOf(0)).toBe(ThinkingLevel.MINIMAL);
    expect(levelOf(1)).toBe(ThinkingLevel.LOW);

    await callStructured(request("model-no-minimal"));
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(levelOf(2)).toBe(ThinkingLevel.LOW);
  });

  it("retries every concurrent call that was sent MINIMAL before the model was learned", async () => {
    generateContent
      .mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw minimalRejected;
      })
      .mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        throw minimalRejected;
      })
      .mockResolvedValue(ok);
    const [first, second] = await Promise.all([
      callStructured<{ a: number }>(request("model-concurrent")),
      callStructured<{ a: number }>(request("model-concurrent")),
    ]);
    expect(first.value).toEqual({ a: 1 });
    expect(second.value).toEqual({ a: 1 });
  });

  it("sends LOW when thinking is low", async () => {
    generateContent.mockResolvedValueOnce(ok);
    await callStructured({ ...request("model-low"), thinking: "low" as const });
    expect(levelOf(0)).toBe(ThinkingLevel.LOW);
  });

  it("sends no thinking config when thinking is on", async () => {
    generateContent.mockResolvedValueOnce(ok);
    await callStructured(request("model-thinking-on", "on"));
    expect(levelOf(0)).toBeUndefined();
  });

  it("does not retry other errors", async () => {
    generateContent.mockRejectedValueOnce(new Error("boom"));
    await expect(callStructured(request("model-boom"))).rejects.toThrow("boom");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("reports a timed-out call as a timeout", async () => {
    generateContent.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await expect(callStructured(request("model-slow"))).rejects.toMatchObject({ status: 504 });
  });
});

describe("callStructured usage log", () => {
  const usageMetadata = { promptTokenCount: 12_236, cachedContentTokenCount: 12_192, candidatesTokenCount: 140, thoughtsTokenCount: 8 };

  beforeEach(() => {
    generateContent.mockReset();
    forgetPrefixCache.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it("logs one line per call with the cache mode and token counts", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    generateContent.mockResolvedValueOnce({ text: '{"a":1}', usageMetadata });
    await callStructured({ ...request("model-log"), cacheName: "cachedContents/abc", label: "persona" });
    expect(generateContent.mock.calls[0][0].config.cachedContent).toBe("cachedContents/abc");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(
      /^\[gemini usage\] label=persona model=model-log cache=explicit prompt=12236 cached=12192 out=148 ms=\d+$/
    );
  });

  it("reports inline when no cache was sent or the cache was gone", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    generateContent.mockResolvedValueOnce({ text: '{"a":1}', usageMetadata: { promptTokenCount: 50 } });
    await callStructured(request("model-log"));
    expect(log.mock.calls[0][0]).toMatch(/cache=inline prompt=50 cached=0 out=0 /);

    generateContent
      .mockRejectedValueOnce(new Error("CachedContent not found (or permission denied)"))
      .mockResolvedValueOnce({ text: '{"a":1}', usageMetadata });
    await callStructured({ ...request("model-log"), cacheName: "cachedContents/gone" });
    expect(forgetPrefixCache).toHaveBeenCalledWith("cachedContents/gone");
    expect(generateContent.mock.calls[2][0].config.systemInstruction).toBe("p");
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[1][0]).toMatch(/cache=inline prompt=12236 cached=12192 out=148 /);
  });
});

describe("hedged", () => {
  const later = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
  const failLater = (ms: number, error: unknown) => new Promise<never>((_resolve, reject) => setTimeout(() => reject(error), ms));

  it("never sends the second request when the first answers in time", async () => {
    const second = vi.fn(() => later(5, "second"));
    expect(await hedged(() => later(5, "first"), second, 50)).toBe("first");
    expect(second).not.toHaveBeenCalled();
  });

  it("takes the second request when the first stalls", async () => {
    const started = Date.now();
    expect(await hedged(() => later(500, "first"), () => later(10, "second"), 20)).toBe("second");
    expect(Date.now() - started).toBeLessThan(400);
  });

  it("still takes a stalled first request that answers before the second", async () => {
    expect(await hedged(() => later(40, "first"), () => later(400, "second"), 20)).toBe("first");
  });

  it("sends the second request at once when the first times out early", async () => {
    const timeout = new GeminiChatError("timed out", 504);
    expect(await hedged(() => failLater(5, timeout), () => later(5, "second"), 1_000)).toBe("second");
  });

  it("sends the second request at once when Gemini is briefly unavailable", async () => {
    const unavailable = new GeminiChatError('{"error":{"code":503,"status":"UNAVAILABLE"}}', 503);
    expect(await hedged(() => failLater(5, unavailable), () => later(5, "second"), 1_000)).toBe("second");
  });

  it("never retries into a rate limit", async () => {
    const second = vi.fn(() => later(5, "second"));
    await expect(hedged(() => failLater(5, new GeminiChatError("busy", 429, true)), second, 1_000)).rejects.toThrow("busy");
    expect(second).not.toHaveBeenCalled();
  });

  it("throws a refusal without a second request", async () => {
    const second = vi.fn(() => later(5, "second"));
    await expect(hedged(() => failLater(5, new GeminiChatError("bad", 400)), second, 1_000)).rejects.toThrow("bad");
    expect(second).not.toHaveBeenCalled();
  });

  it("throws the first error when both fail", async () => {
    const first = new GeminiChatError("first timed out", 504);
    await expect(hedged(() => failLater(60, first), () => failLater(5, new Error("second")), 20)).rejects.toBe(first);
  });
});
