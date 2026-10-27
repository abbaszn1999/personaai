/**
 * Client for Gemini Nano Banana 2.1 (`gemini-nano-banana-2.1`) image editing through the
 * Interactions API. It builds the shopper's avatars and dresses them in try-on renders.
 *
 * One request carries the prompt and every reference image inline, and the response carries
 * the finished image plus the token usage that Google bills for it. That usage is returned to
 * the caller so each render is charged at its real cost (`geminiImageCostNanos`).
 */
import { NANO_BANANA_1K_IMAGE_TOKENS, type GeminiImageTokenCounts } from "@/lib/billing/pricing";
import { isRetryableTryOnError, type TryOnErrorCode } from "@/lib/try-on/errors";
import { getPlatformGeminiApiKey } from "./gemini";

const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
/**
 * Renders take 12-30 s for one item, and a bundle or a loaded provider can need a minute or more.
 * The first attempt is long so a slow render that is still going to succeed is never thrown away;
 * the short second attempt only exists for an outright failure (5xx, empty image). The budgets
 * stay inside each route's `maxDuration` together with queueing and fetching the pictures, so a
 * slow attempt ends as an answer instead of a dropped connection.
 */
export interface GeminiRequestLimits {
  /** One cap per attempt, in order; the number of entries is the number of attempts. */
  attemptTimeoutsMs: readonly number[];
  /** All attempts together. */
  totalBudgetMs: number;
}

/** Wearing an item or a bundle (route `maxDuration` 240 s: up to 30 s queue + pictures + this). */
export const WEAR_LIMITS: GeminiRequestLimits = { attemptTimeoutsMs: [100_000, 40_000], totalBudgetMs: 150_000 };

/**
 * Avatar creation. Its route streams progress to the browser and allows 300 s, so a slow render
 * can be given the most time; real renders take 25-30 s, so the first attempt alone is ~3x that.
 */
export const AVATAR_LIMITS: GeminiRequestLimits = { attemptTimeoutsMs: [100_000, 80_000], totalBudgetMs: 190_000 };

export const ATTEMPT_TIMEOUTS_MS = WEAR_LIMITS.attemptTimeoutsMs;
export const TOTAL_BUDGET_MS = WEAR_LIMITS.totalBudgetMs;
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

export const DEFAULT_IMAGE_MODEL = "gemini-nano-banana-2.1";

/** Matches the one model `geminiImageCostNanos` has a price list for. */
const PRICED_IMAGE_MODEL = /nano-banana-2\.1/i;
const warnedImageModels = new Set<string>();

/**
 * The model behind every image render, avatars and try-on alike, so the two can never drift
 * apart. `GEMINI_IMAGE_MODEL` sets it; a leftover `GEMINI_TRYON_MODEL` is still honoured so an
 * existing environment keeps working.
 *
 * Renders are billed with the Nano Banana 2.1 token rates whatever the model, so a model that
 * isn't Nano Banana 2.1 is logged once: its real price needs adding to pricing.ts.
 */
export function imageModel(): string {
  const model =
    process.env.GEMINI_IMAGE_MODEL?.trim() || process.env.GEMINI_TRYON_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  if (!PRICED_IMAGE_MODEL.test(model) && !warnedImageModels.has(model)) {
    warnedImageModels.add(model);
    console.error(`[gemini-image] no price list for image model "${model}"; billing at Nano Banana 2.1 rates`);
  }
  return model;
}

export type ImageThinkingLevel = "minimal" | "medium" | "high";

const THINKING_LEVELS: readonly ImageThinkingLevel[] = ["minimal", "medium", "high"];

/**
 * How much the model reasons before it draws. Left unset, Nano Banana 2.1 runs at `medium`, which
 * spends hundreds of thinking tokens (and seconds) on a task whose prompt already says exactly what
 * to do. `minimal` is the fast setting; `GEMINI_IMAGE_THINKING_LEVEL` raises it again without a deploy
 * if bundle quality ever needs it. Anything unrecognised means `minimal`.
 */
export function imageThinkingLevel(): ImageThinkingLevel {
  const raw = process.env.GEMINI_IMAGE_THINKING_LEVEL?.trim().toLowerCase();
  return THINKING_LEVELS.find((level) => level === raw) ?? "minimal";
}

/** An optional second model for the retry, so a model that is down does not fail both attempts. */
export function imageFallbackModel(): string | null {
  const fallback = process.env.GEMINI_IMAGE_FALLBACK_MODEL?.trim() || process.env.GEMINI_TRYON_FALLBACK_MODEL?.trim();
  return fallback && fallback !== imageModel() ? fallback : null;
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
  /** Time allowed per attempt and in total. Defaults to the tighter wearing limits. */
  limits?: GeminiRequestLimits;
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

/** Connection errors that happen before any byte of the request reaches Google. */
const NEVER_SENT_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT"]);

/**
 * True when a failed `fetch` provably never delivered the request (DNS failure, refused or
 * timed-out connect). Anything that could have happened after sending, such as a reset or our
 * own timeout, is not included: that request may already be billed.
 */
export function requestNeverSent(err: unknown): boolean {
  if (!(err instanceof Error) || err.name === "TimeoutError" || err.name === "AbortError") return false;
  const cause = (err as { cause?: unknown }).cause;
  const code = cause && typeof cause === "object" ? (cause as { code?: unknown }).code : undefined;
  return typeof code === "string" && NEVER_SENT_CODES.has(code);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends one render request and returns the picture, retrying overload (429/5xx) and connection
 * failures that never reached Google. A timeout, a connection that dropped after sending, an unreadable
 * body or a 200 with no picture is final, because Google may already have billed that request. A refusal
 * (other 4xx) is final too. The retry may use a different model
 * (`GEMINI_TRYON_FALLBACK_MODEL`) so one model being down does not fail both attempts.
 */
export async function requestImage(
  buildBody: (model: string) => unknown,
  apiKey: string,
  limits: GeminiRequestLimits = WEAR_LIMITS
): Promise<GeminiImageResult> {
  const startedAt = Date.now();
  const fallback = imageFallbackModel();
  let lastError: GeminiImageError | null = null;

  for (let attempt = 0; attempt < limits.attemptTimeoutsMs.length; attempt++) {
    const remaining = limits.totalBudgetMs - (Date.now() - startedAt);
    if (attempt > 0 && remaining < MIN_RETRY_MS) break;
    const timeoutMs = Math.min(limits.attemptTimeoutsMs[attempt], remaining);
    const model = attempt > 0 && fallback ? fallback : imageModel();

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
      if (err instanceof GeminiImageError) throw err;
      const unreachable = new GeminiImageError("Couldn't reach Gemini. Please try again.", undefined, "unreachable");
      if (requestNeverSent(err)) {
        // Google never saw the request, so nothing can have been billed: asking again is safe.
        lastError = unreachable;
      } else {
        // A request that timed out or dropped after it was sent may still have finished on Google's
        // side, and a second attempt would be billed on top of a render we never received or recorded.
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        throw timedOut
          ? new GeminiImageError("Gemini took too long to render the image. Please try again.", undefined, "timeout")
          : unreachable;
      }
    }

    if (!lastError.retryable) throw lastError;
    if (attempt < limits.attemptTimeoutsMs.length - 1) await wait(RETRY_DELAY_MS);
  }

  throw lastError ?? new GeminiImageError("Gemini image request failed.");
}

/** The Interactions API request for one render, kept pure so the exact body can be tested. */
export function buildImageEditBody(
  model: string,
  prompt: string,
  imageParts: ReadonlyArray<{ type: string; mime_type: string; data: string }>,
  aspectRatio: string | undefined,
  thinkingLevel: ImageThinkingLevel
) {
  return {
    model,
    input: [{ type: "text", text: prompt }, ...imageParts],
    response_format: { type: "image", aspect_ratio: aspectRatio ?? "3:4", image_size: "1K" },
    generation_config: { thinking_level: thinkingLevel },
  };
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
  const thinkingLevel = imageThinkingLevel();
  const buildBody = (model: string) => buildImageEditBody(model, input.prompt, imageParts, input.aspectRatio, thinkingLevel);

  let apiKey: string;
  try {
    apiKey = getPlatformGeminiApiKey();
  } catch {
    throw new GeminiImageError("Image rendering is not configured (GEMINI_API_KEY).", undefined, "not_configured");
  }

  // One line per render, so a change to the model, the thinking level or the pictures sent can be
  // judged on real traffic. Sizes are the raw picture bytes, before base64.
  const startedAt = Date.now();
  const describe = (outcome: string) =>
    `[gemini-image] ${outcome} model=${imageModel()} thinking=${thinkingLevel} images=${input.images.length} ` +
    `inputBytes=${input.images.reduce((sum, image) => sum + image.data.length, 0)} ms=${Date.now() - startedAt}`;
  try {
    const result = await requestImage(buildBody, apiKey, input.limits);
    console.info(describe("ok"));
    return result;
  } catch (err) {
    console.info(describe(`failed(${err instanceof GeminiImageError ? err.code : "error"})`));
    throw err;
  }
}
