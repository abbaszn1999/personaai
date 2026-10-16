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
import { isRetryableTryOnError, type TryOnErrorCode } from "@/lib/try-on/errors";
import { getPlatformGeminiApiKey } from "./gemini";

const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const DEFAULT_TRY_ON_MODEL = "gemini-nano-banana-2.1";

/**
 * Renders take 12-30 s, longer for 4+ garments or under load. Two attempts share one budget that
 * is kept inside the route's 120 s `maxDuration` together with fetching the pictures: the old
 * "90 s, twice" could promise 180 s the platform would never wait for, so a slow second attempt
 * ended as a dropped connection instead of an answer.
 */
export const ATTEMPT_TIMEOUTS_MS = [55_000, 45_000] as const;
export const TOTAL_BUDGET_MS = 100_000;
/** A second attempt with less than this left would only time out; give up with the real error. */
const MIN_RETRY_MS = 12_000;
const RETRY_DELAY_MS = 1_500;

export class GeminiImageError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code: TryOnErrorCode = "provider_busy"
  ) {
    super(message);
    this.name = "GeminiImageError";
  }

  /** Whether asking the model again can help. */
  get retryable(): boolean {
    return isRetryableTryOnError(this.code);
  }
}

export function tryOnModel(): string {
  return process.env.GEMINI_TRYON_MODEL?.trim() || DEFAULT_TRY_ON_MODEL;
}

/** An optional second model for the retry, so a model that is down does not fail both attempts. */
export function tryOnFallbackModel(): string | null {
  const fallback = process.env.GEMINI_TRYON_FALLBACK_MODEL?.trim();
  return fallback && fallback !== tryOnModel() ? fallback : null;
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
    throw new GeminiImageError(`Gemini returned no image${status}. Please try again.`, undefined, "no_image");
  }
  return {
    image: Buffer.from(image.data, "base64"),
    mimeType: image.mimeType,
    usage: readInteractionUsage(root?.usage),
  };
}

function codeForStatus(status: number): TryOnErrorCode {
  return status === 429 || status >= 500 ? "provider_busy" : "rejected";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends one render request and returns the picture, retrying whatever can plausibly succeed the
 * second time: overload (429/5xx), a timeout, a dropped connection, a 200 with no picture, or an
 * unreadable body. A refusal (other 4xx) is final. The retry may use a different model
 * (`GEMINI_TRYON_FALLBACK_MODEL`) so one model being down does not fail both attempts.
 */
export async function requestImage(
  buildBody: (model: string) => unknown,
  apiKey: string
): Promise<GeminiImageResult> {
  const startedAt = Date.now();
  const fallback = tryOnFallbackModel();
  let lastError: GeminiImageError | null = null;

  for (let attempt = 0; attempt < ATTEMPT_TIMEOUTS_MS.length; attempt++) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (attempt > 0 && remaining < MIN_RETRY_MS) break;
    const timeoutMs = Math.min(ATTEMPT_TIMEOUTS_MS[attempt], remaining);
    const model = attempt > 0 && fallback ? fallback : tryOnModel();

    try {
      const res = await fetch(INTERACTIONS_URL, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(model)),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();

      if (res.ok) {
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new GeminiImageError("Gemini returned an unreadable response. Please try again.", res.status, "no_image");
        }
        return parseInteractionResponse(json);
      }

      lastError = new GeminiImageError(
        `Gemini image request failed (${res.status}): ${text.slice(0, 300)}`,
        res.status,
        codeForStatus(res.status)
      );
    } catch (err) {
      if (err instanceof GeminiImageError) {
        lastError = err;
      } else {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        lastError = timedOut
          ? new GeminiImageError("Gemini took too long to render the image. Please try again.", undefined, "timeout")
          : new GeminiImageError("Couldn't reach Gemini. Please try again.", undefined, "unreachable");
      }
    }

    if (!lastError.retryable) throw lastError;
    if (attempt < ATTEMPT_TIMEOUTS_MS.length - 1) await wait(RETRY_DELAY_MS);
  }

  throw lastError ?? new GeminiImageError("Gemini image request failed.");
}

/**
 * Edits `images[0]` according to `prompt`, using the other images as references. The prompt names
 * images by position ("image 1", "image 2"), so the order of `images` is the contract.
 */
export async function editGeminiImage(input: GeminiImageEditInput): Promise<GeminiImageResult> {
  if (input.images.length === 0) {
    throw new GeminiImageError("Gemini image editing requires at least one image.", undefined, "invalid_request");
  }

  // Encoded once: a retry re-sends the same pictures, and base64 of ten garments is not free.
  const imageParts = input.images.map((image) => ({
    type: "image",
    mime_type: image.mimeType,
    data: image.data.toString("base64"),
  }));
  const buildBody = (model: string) => ({
    model,
    input: [{ type: "text", text: input.prompt }, ...imageParts],
    response_format: { type: "image", aspect_ratio: input.aspectRatio ?? "3:4", image_size: "1K" },
  });

  let apiKey: string;
  try {
    apiKey = getPlatformGeminiApiKey();
  } catch {
    throw new GeminiImageError("Try-on rendering is not configured (GEMINI_API_KEY).", undefined, "not_configured");
  }

  return requestImage(buildBody, apiKey);
}
