import { describe, expect, it } from "vitest";
import { geminiImageCostNanos } from "@/lib/billing/pricing";
import { GeminiImageError, parseInteractionResponse, readInteractionUsage } from "./gemini-image";

const PNG_BASE64 = Buffer.from("png-bytes").toString("base64");

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
