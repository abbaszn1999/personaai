import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geminiImageCostNanos } from "@/lib/billing/pricing";
import {
  GeminiImageError,
  imageModel,
  parseInteractionResponse,
  readInteractionUsage,
  requestImage,
  AVATAR_LIMITS,
  WEAR_LIMITS,
} from "./gemini-image";
const PNG_BASE64 = Buffer.from("png-bytes").toString("base64");

describe("imageModel", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_IMAGE_MODEL", "");
    vi.stubEnv("GEMINI_TRYON_MODEL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("defaults to Nano Banana 2.1 when nothing is set", () => {
    expect(imageModel()).toBe("gemini-nano-banana-2.1");
  });

  it("reads the one GEMINI_IMAGE_MODEL for every render, avatar or try-on", () => {
    vi.stubEnv("GEMINI_IMAGE_MODEL", " gemini-nano-banana-2.1 ");
    expect(imageModel()).toBe("gemini-nano-banana-2.1");
  });

  it("still honours a leftover GEMINI_TRYON_MODEL, but GEMINI_IMAGE_MODEL wins", () => {
    vi.stubEnv("GEMINI_TRYON_MODEL", "gemini-nano-banana-2.1-legacy");
    expect(imageModel()).toBe("gemini-nano-banana-2.1-legacy");
    vi.stubEnv("GEMINI_IMAGE_MODEL", "gemini-nano-banana-2.1");
    expect(imageModel()).toBe("gemini-nano-banana-2.1");
  });

  it("warns once about a model it has no price list for, and still returns it", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("GEMINI_IMAGE_MODEL", "some-other-image-model");
    expect(imageModel()).toBe("some-other-image-model");
    expect(imageModel()).toBe("some-other-image-model");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("readInteractionUsage", () => {
  it("splits output into image and text using the modality breakdown", () => {
    // The AI Studio log of a real 5-image render.
    const usage = readInteractionUsage({
      total_input_tokens: 5_673,
      total_thought_tokens: 1_062,
      total_output_tokens: 1_423,
      output_tokens_by_modality: [
        { modality: "image", tokens: 1_120 },
        { modality: "text", tokens: 303 },
      ],
    });

    expect(usage).toEqual({
      inputTokens: 5_673,
      thoughtTokens: 1_062,
      textOutputTokens: 303,
      imageOutputTokens: 1_120,
    });
    expect(geminiImageCostNanos(usage!)).toBe(52_347_000);
  });

  it("assumes one 1K image when the modality breakdown is missing, never skipping the image rate", () => {
    const usage = readInteractionUsage({
      total_input_tokens: 3_000,
      total_thought_tokens: 900,
      total_output_tokens: 1_400,
    });

    expect(usage).toEqual({
      inputTokens: 3_000,
      thoughtTokens: 900,
      textOutputTokens: 280,
      imageOutputTokens: 1_120,
    });
  });

  it("never reports more image tokens than the output total", () => {
    const usage = readInteractionUsage({
      total_input_tokens: 10,
      total_output_tokens: 500,
      output_tokens_by_modality: [{ modality: "image", tokens: 9_999 }],
    });

    expect(usage?.imageOutputTokens).toBe(500);
    expect(usage?.textOutputTokens).toBe(0);
  });

  it("returns null when no token counts came back, so the caller charges the estimate", () => {
    expect(readInteractionUsage(undefined)).toBeNull();
    expect(readInteractionUsage({})).toBeNull();
    expect(readInteractionUsage({ total_input_tokens: 0, total_output_tokens: 0 })).toBeNull();
  });

  it("ignores negative and non-numeric counts", () => {
    const usage = readInteractionUsage({
      total_input_tokens: 100,
      total_thought_tokens: -5,
      total_output_tokens: "many",
    });

    expect(usage).toEqual({ inputTokens: 100, thoughtTokens: 0, textOutputTokens: 0, imageOutputTokens: 0 });
  });
});

describe("parseInteractionResponse", () => {
  it("reads the image from output_image", () => {
    const result = parseInteractionResponse({
      output_image: { type: "image", mime_type: "image/jpeg", data: PNG_BASE64 },
      usage: { total_input_tokens: 10, total_output_tokens: 1_120 },
    });

    expect(result.mimeType).toBe("image/jpeg");
    expect(result.image.toString()).toBe("png-bytes");
    expect(result.usage?.inputTokens).toBe(10);
  });

  it("falls back to the first image block inside the steps", () => {
    const result = parseInteractionResponse({
      steps: [
        { type: "thought", summary: "ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦" },
        { type: "model_output", content: [{ type: "text", text: "Here you go" }, { type: "image", data: PNG_BASE64 }] },
      ],
    });

    expect(result.mimeType).toBe("image/png");
    expect(result.image.toString()).toBe("png-bytes");
    expect(result.usage).toBeNull();
  });

  it("throws a GeminiImageError when the response holds no image", () => {
    expect(() => parseInteractionResponse({ status: "completed", steps: [] })).toThrow(GeminiImageError);
    expect(() => parseInteractionResponse(null)).toThrow(GeminiImageError);
  });
});

describe("requestImage", () => {
  const okBody = { output_image: { type: "image", mime_type: "image/png", data: PNG_BASE64 } };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the image on the first success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, okBody));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestImage((model) => ({ model }), "key");
    expect(result.image.toString()).toBe("png-bytes");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 200 that carries no image", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(200, { status: "completed", steps: [] }))
      .mockResolvedValueOnce(reply(200, okBody));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestImage((model) => ({ model }), "key");
    expect(result.image.toString()).toBe("png-bytes");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries an overloaded provider and a dropped connection", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503, { error: "overloaded" }))
      .mockResolvedValueOnce(reply(200, okBody));
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestImage((model) => ({ model }), "key")).resolves.toBeDefined();

    const dropped = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(reply(200, okBody));
    vi.stubGlobal("fetch", dropped);
    await expect(requestImage((model) => ({ model }), "key")).resolves.toBeDefined();
  });

  it("does not retry a refusal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(403, { error: "API key invalid" }));
    vi.stubGlobal("fetch", fetchMock);

    const error = (await requestImage((model) => ({ model }), "key").catch((e) => e)) as GeminiImageError;
    expect(error).toBeInstanceOf(GeminiImageError);
    expect(error.code).toBe("rejected");
    expect(error.retryable).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ends with a retryable error when both attempts fail", async () => {
    // A Response body can be read once, so each call gets its own.
    const fetchMock = vi.fn().mockImplementation(async () => reply(500, { error: "boom" }));
    vi.stubGlobal("fetch", fetchMock);

    const error = (await requestImage((model) => ({ model }), "key").catch((e) => e)) as GeminiImageError;
    expect(error.code).toBe("provider_busy");
    expect(error.retryable).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the fallback model for the second attempt when one is configured", async () => {
    vi.stubEnv("GEMINI_TRYON_MODEL", "primary-model");
    vi.stubEnv("GEMINI_TRYON_FALLBACK_MODEL", "fallback-model");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(500, {}))
      .mockResolvedValueOnce(reply(200, okBody));
    vi.stubGlobal("fetch", fetchMock);

    await requestImage((model) => ({ model }), "key");
    const models = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).model);
    expect(models).toEqual(["primary-model", "fallback-model"]);
  });
});

describe("request limits", () => {
  it("gives avatar creation more room than wearing, within its route's 300 s", () => {
    expect(AVATAR_LIMITS.attemptTimeoutsMs[0]).toBeGreaterThan(WEAR_LIMITS.attemptTimeoutsMs[0]);
    expect(AVATAR_LIMITS.totalBudgetMs).toBeGreaterThan(WEAR_LIMITS.totalBudgetMs);
    expect(AVATAR_LIMITS.totalBudgetMs).toBeLessThan(300_000);
  });

  it("makes a single attempt when only one is allowed", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({}), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await requestImage((model) => ({ model }), "key", { attemptTimeoutsMs: [5_000], totalBudgetMs: 5_000 }).catch(() => {});
    vi.unstubAllGlobals();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
