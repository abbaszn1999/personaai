import { ThinkingLevel } from "@google/genai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();

vi.mock("@/lib/ai/gemini", () => ({
  getGeminiClient: () => ({ models: { generateContent } }),
}));

vi.mock("@/lib/ai/gemini-cache", () => ({
  resolvePrefixCache: () => null,
  forgetPrefixCache: vi.fn(),
}));

import { callStructured } from "./structured-call";

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
});
