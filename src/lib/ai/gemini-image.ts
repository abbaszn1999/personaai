/**
 * Client for Gemini Nano Banana 2.1 (`gemini-nano-banana-2.1`) image editing through the
 * Interactions API. It dresses the shopper's avatar in try-on renders; avatars themselves are
 * still built by Pruna (see lib/ai/pruna.ts).
 *
 * One request carries the prompt and every reference image inline, and the response carries
 * the finished image plus the token usage that Google bills for it. That usage is returned to
 * the caller so each render is charged at its real cost (`geminiImageCostNanos`).
 */
import { NANO_BANANA_1K_IMAGE_TOKENS, type GeminiImageTokenCounts } from "@/lib/billing/pricing";
import { getPlatformGeminiApiKey } from "./gemini";

const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const DEFAULT_TRY_ON_MODEL = "gemini-nano-banana-2.1";

/** Renders take 12-25 s, longer for 4+ garments or under load. Generous but bounded. */
const REQUEST_TIMEOUT_MS = 90_000;
const RETRY_DELAY_MS = 1_500;

export class GeminiImageError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "GeminiImageError";
  }
}

export function tryOnModel(): string {
  return process.env.GEMINI_TRYON_MODEL?.trim() || DEFAULT_TRY_ON_MODEL;
}

export interface GeminiImageInput {
  /** Raw bytes of one reference image, in the order the prompt refers to them (image 1, 2, ...). */
  data: Buffer;
  mimeType: string;
}

export interface GeminiImageEditInput {
  prompt: string;
  images: GeminiImageInput[];
  /** Defaults to 3:4, the avatar framing. */
  aspectRatio?: string;
}

export interface GeminiImageResult {
  image: Buffer;
  mimeType: string;
  /** Null only when the response carried no usable usage block. */
  usage: GeminiImageTokenCounts | null;
}

interface ModalityTokens {
  modality?: string | null;
  tokens?: number | null;
}

interface InteractionUsage {
  total_input_tokens?: number | null;
  total_output_tokens?: number | null;
  total_thought_tokens?: number | null;
  output_tokens_by_modality?: ModalityTokens[] | null;
}

function count(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** First image block anywhere in the response: `output_image`, or an image step content. */
function findImage(node: unknown): { data: string; mimeType: string } | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findImage(item);
      if (found) return found;
    }
    return null;
  }
  const record = node as Record<string, unknown>;
  if (record.type === "image" && typeof record.data === "string" && record.data.length > 0) {
    return {
      data: record.data,
      mimeType: typeof record.mime_type === "string" ? record.mime_type : "image/png",
    };
  }
  for (const value of Object.values(record)) {
    const found = findImage(value);
    if (found) return found;
  }
  return null;
}

/**
 * Reads the billed token counts out of an interaction's `usage`.
 *
 * Image output is the `image` entry of `output_tokens_by_modality`; the rest of
 * `total_output_tokens` is text. Thinking tokens are reported separately and billed as text
 * output. When the modality breakdown is missing, a render is assumed to hold one 1K image so
 * the (much dearer) image rate is never skipped. Returns null when no token counts came back,
 * so the caller can charge the estimate rather than nothing.
 */
export function readInteractionUsage(usage: unknown): GeminiImageTokenCounts | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as InteractionUsage;

  const inputTokens = count(u.total_input_tokens);
  const totalOutput = count(u.total_output_tokens);
  const thoughtTokens = count(u.total_thought_tokens);
  if (inputTokens === 0 && totalOutput === 0 && thoughtTokens === 0) return null;

  const byModality = Array.isArray(u.output_tokens_by_modality) ? u.output_tokens_by_modality : [];
  const modalityImage = byModality
    .filter((entry) => (entry.modality ?? "").toLowerCase() === "image")
    .reduce((sum, entry) => sum + count(entry.tokens), 0);

  const imageOutputTokens =
    modalityImage > 0 ? Math.min(modalityImage, totalOutput || modalityImage) : Math.min(NANO_BANANA_1K_IMAGE_TOKENS, totalOutput);
  const textOutputTokens = Math.max(totalOutput - imageOutputTokens, 0);

  return { inputTokens, thoughtTokens, textOutputTokens, imageOutputTokens };
}

/** Pure parse of a completed interaction response, exported for tests. */
export function parseInteractionResponse(json: unknown): GeminiImageResult {
  const root = json as { output_image?: unknown; usage?: unknown; status?: string } | null;
  const image = findImage(root?.output_image) ?? findImage(json);
  if (!image) {
    const status = typeof root?.status === "string" ? ` (status: ${root.status})` : "";
    throw new GeminiImageError(`Gemini returned no image${status}. Please try again.`);
  }
  return {
    image: Buffer.from(image.data, "base64"),
    mimeType: image.mimeType,
    usage: readInteractionUsage(root?.usage),
  };
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function postInteraction(body: unknown, apiKey: string): Promise<unknown> {
  let lastError: GeminiImageError | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(INTERACTIONS_URL, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await res.text();
      if (res.ok) return JSON.parse(text);

      lastError = new GeminiImageError(
        `Gemini image request failed (${res.status}): ${text.slice(0, 300)}`,
        res.status
      );
      if (!isRetryable(res.status)) break;
    } catch (err) {
      if (err instanceof GeminiImageError) throw err;
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      lastError = new GeminiImageError(
        timedOut ? "Gemini took too long to render the image. Please try again." : "Couldn't reach Gemini. Please try again."
      );
    }
    if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }

  throw lastError ?? new GeminiImageError("Gemini image request failed.");
}

/**
 * Edits `images[0]` according to `prompt`, using the other images as references. The prompt names
 * images by position ("image 1", "image 2"), so the order of `images` is the contract.
 */
export async function editGeminiImage(input: GeminiImageEditInput): Promise<GeminiImageResult> {
  if (input.images.length === 0) {
    throw new GeminiImageError("Gemini image editing requires at least one image.");
  }

  const body = {
    model: tryOnModel(),
    input: [
      { type: "text", text: input.prompt },
      ...input.images.map((image) => ({
        type: "image",
        mime_type: image.mimeType,
        data: image.data.toString("base64"),
      })),
    ],
    response_format: { type: "image", aspect_ratio: input.aspectRatio ?? "3:4", image_size: "1K" },
  };

  let apiKey: string;
  try {
    apiKey = getPlatformGeminiApiKey();
  } catch {
    throw new GeminiImageError("Try-on rendering is not configured (GEMINI_API_KEY).");
  }

  const json = await postInteraction(body, apiKey);
  return parseInteractionResponse(json);
}
