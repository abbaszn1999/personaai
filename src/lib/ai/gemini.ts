import { GoogleGenAI } from "@google/genai";

/** Default output resolution; override per-deployment via GEMINI_IMAGE_SIZE. */
const DEFAULT_IMAGE_SIZE = "1K";

const DEFAULT_MODEL = "gemini-3-pro-image-preview";

export class GeminiApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "GeminiApiError";
  }
}

export type GeminiImagePart = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiApiError("Gemini API key is not configured (GEMINI_API_KEY).");
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

/**
 * Calls Nano Banana Pro (Gemini 3 Pro Image) via the stable `models.generateContent` API with
 * a mix of text and reference-image parts, and returns the single generated image.
 *
 * Deliberately uses `models.generateContent`, not the newer `interactions.create` API — the
 * Interactions API is still Beta ("subject to breaking changes" per its own docs) and in
 * practice rejects `response_format.delivery: "inline"` for images with a 400 even though the
 * SDK types and docs both list it as valid. `generateContent` is the same stable surface every
 * official example/guide for this model actually uses.
 */
export async function generateGeminiImage(
  input: GeminiImagePart[],
  opts?: { aspectRatio?: string }
): Promise<{ imageBase64: string; mimeType: string }> {
  const ai = getClient();
  const model = process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL;
  const imageSize = process.env.GEMINI_IMAGE_SIZE ?? DEFAULT_IMAGE_SIZE;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: input.map((part) =>
            part.type === "text" ? { text: part.text } : { inlineData: { data: part.data, mimeType: part.mimeType } }
          ),
        },
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: opts?.aspectRatio,
          imageSize,
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data);

    if (!imagePart?.inlineData?.data) {
      throw new GeminiApiError("Gemini did not return an image for this request.");
    }

    return {
      imageBase64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType ?? "image/png",
    };
  } catch (err) {
    if (err instanceof GeminiApiError) throw err;
    const message = err instanceof Error ? err.message : "Gemini image generation failed.";
    throw new GeminiApiError(message);
  }
}

/** Fetches a remote image (e.g. a product photo) and base64-encodes it for use as a Gemini reference image. */
export async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new GeminiApiError(`Failed to fetch reference image (${res.status}): ${url}`, res.status);
  }
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { data: buffer.toString("base64"), mimeType };
}
