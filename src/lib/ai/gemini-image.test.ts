import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geminiImageCostNanos } from "@/lib/billing/pricing";
import { GeminiImageError, imageModel, parseInteractionResponse, readInteractionUsage } from "./gemini-image";

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
        { type: "thought", summary: "…" },
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
