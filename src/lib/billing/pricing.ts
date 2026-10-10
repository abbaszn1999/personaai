/** Prices in nano-dollars (1e-9 USD) so every charge is an integer.
 *
 *  Every vendor price below was checked against the vendor's published pricing on 2026-10-06:
 *  - Gemini 3.x Flash (3.6, 3.7 and 3.8 share one price list), Standard tier, per Google's Gemini
 *    API pricing page. See `geminiTokenRates`.
 *  - AI Commerce Search: $2.50 per 1,000 `servingConfigs.search` calls (Google Cloud, "AI Commerce
 *    Search pricing"), i.e. $0.0025 a search.
 *  - Pruna: `p-image-edit` $0.010 per output image (docs.api.pruna.ai). Avatars only.
 *  - Gemini Nano Banana 2.1 (`gemini-nano-banana-2.1`), Standard tier, per Google's Gemini API
 *    pricing page: $1.50 per 1M input tokens, $7.50 per 1M text and thinking output tokens,
 *    $30 per 1M image output tokens. Try-on renders only. See `geminiImageCostNanos`.
 *  - Decart: realtime Lucy at 720p is $0.02 per second of active generation (docs.platform.decart.ai).
 *
 *  One session unit is priced exactly at one search, so a search always completes a unit and chat
 *  tokens accumulate in the carry until they do too.
 *
 *  `consume_session_units` defaults its unit size to SESSION_UNIT_NANOS. Callers pass this
 *  constant so a price change here is the one the database applies.
 */

/** Gemini bills per token, per 1M tokens: these are nano-dollars per single token. */
export interface GeminiTokenRates {
  input: number;
  /** Reasoning tokens are billed as output. */
  output: number;
  /** Input tokens served from a context cache (Gemini bills them at 10% of the input price). */
  cachedInput: number;
}

/** Introductory Standard-tier prices, through December 31, 2026: $0.75 in, $3.75 out, $0.075 cached. */
const GEMINI_FLASH_INTRO_RATES: GeminiTokenRates = { input: 750, output: 3_750, cachedInput: 75 };
/** The same models double on January 1, 2027: $1.50 in, $7.50 out, $0.15 cached. */
const GEMINI_FLASH_STANDARD_RATES: GeminiTokenRates = { input: 1_500, output: 7_500, cachedInput: 150 };
/** First instant of the standard price list (UTC). */
export const GEMINI_STANDARD_PRICING_STARTS_MS = Date.UTC(2027, 0, 1);

/**
 * What an unpriced model is charged: the highest Flash rates Google lists (Priority tier, 2027:
 * $2.70 in, $13.50 out, $0.27 cached). A model nobody priced here must cost the store at least what
 * it costs us, never nothing.
 */
const UNPRICED_MODEL_RATES: GeminiTokenRates = { input: 2_700, output: 13_500, cachedInput: 270 };

/** Every Gemini 3.x Flash model, Standard tier — 3.6, 3.7 and 3.8 share one price list. */
const FLASH_MODEL = /^gemini-3(?:\.\d+)?-flash(?:-preview)?(?:-[\w.]+)?$/i;
const warnedModels = new Set<string>();

/** The Gemini token prices in force at `at` for `model`. Omitting the model means the agents'
 *  Flash model; an unknown model is charged at `UNPRICED_MODEL_RATES` and logged once. */
export function geminiTokenRates(at: Date | number = Date.now(), model?: string | null): GeminiTokenRates {
  if (model && !FLASH_MODEL.test(model)) {
    if (!warnedModels.has(model)) {
      warnedModels.add(model);
      console.error(`[billing/pricing] no price list for model "${model}"; charging the highest known Flash rates`);
    }
    return UNPRICED_MODEL_RATES;
  }
  const time = typeof at === "number" ? at : at.getTime();
  return time >= GEMINI_STANDARD_PRICING_STARTS_MS ? GEMINI_FLASH_STANDARD_RATES : GEMINI_FLASH_INTRO_RATES;
}

/** Explicit context-cache storage, nano-dollars per token per hour: $0.50 per 1M tokens per hour
 *  through 2026, $1.00 from January 1, 2027. */
export function geminiCacheStorageNanosPerTokenHour(at: Date | number = Date.now()): number {
  const time = typeof at === "number" ? at : at.getTime();
  return time >= GEMINI_STANDARD_PRICING_STARTS_MS ? 1_000 : 500;
}

/**
 * What one explicit cache costs: creating it bills its tokens as input (only when created, not when
 * extended), and keeping it bills storage for every hour of TTL bought.
 */
export function geminiCacheCostNanos(input: {
  tokens: number;
  ttlSeconds: number;
  created: boolean;
  at?: Date | number;
  model?: string | null;
}): number {
  const tokens = wholeTokens(input.tokens);
  const at = input.at ?? Date.now();
  const creation = input.created ? tokens * geminiTokenRates(at, input.model).input : 0;
  const storage = Math.ceil((tokens * geminiCacheStorageNanosPerTokenHour(at) * Math.max(input.ttlSeconds, 0)) / 3_600);
  return creation + storage;
}

export interface GeminiTokenCounts {
  /** `promptTokenCount`: everything sent, including the cached part. */
  inputTokens: number;
  /** Visible output plus reasoning tokens. */
  outputTokens: number;
  /** The part of `inputTokens` that came from a context cache. */
  cachedTokens?: number;
}

function wholeTokens(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** Nano-dollar cost of one Gemini call: cached input at the cached rate, the rest of the input at
 *  the input rate, plus output. Cache storage is not per call and is not included. */
export function geminiTokenCostNanos(
  tokens: GeminiTokenCounts,
  at: Date | number = Date.now(),
  model?: string | null
): number {
  const input = wholeTokens(tokens.inputTokens);
  const output = wholeTokens(tokens.outputTokens);
  const cached = Math.min(wholeTokens(tokens.cachedTokens), input);
  const rates = geminiTokenRates(at, model);
  return (input - cached) * rates.input + cached * rates.cachedInput + output * rates.output;
}

export const ACS_SEARCH_NANOS = 2_500_000;

export const SESSION_UNIT_NANOS = 2_500_000;

/**
 * At-cost top-ups. Stripe bills whole cents, so sessions and garments are sold in packs.
 * One session pack is 1,000 units at $2.50. One garment pack is 100 units at $1.00 ($0.01 each).
 * Lucy is already one cent-aligned minute at $1.20.
 */
export const SESSION_PACK_UNITS = 1_000;
export const SESSION_PACK_CENTS = 250;
export const SESSION_MIN_PACKS = 10;
export const SESSION_MAX_PACKS = 10_000;

export const LIVE_MINUTE_CENTS = 120;
export const LIVE_MIN_MINUTES = 25;
export const LIVE_MAX_MINUTES = 10_000;

export const GARMENT_PACK_UNITS = 100;
export const GARMENT_PACK_CENTS = 100;

/** One garment or avatar unit, in nano-dollars. $0.01, from the pack price. */
export const GARMENT_UNIT_NANOS = (GARMENT_PACK_CENTS * 10_000_000) / GARMENT_PACK_UNITS;

/** Real render cost, in nano-dollars. Both kinds of render are charged in $0.01 units via a
 *  per-account nano carry (see `consume_image_generation`), so no fractional cost is ever lost
 *  or over-collected.
 *
 *  - Avatar: Pruna `p-image-edit`, $0.010 per output image, so exactly one unit.
 *  - Try-on: Gemini Nano Banana 2.1, billed from the token usage the API returns for each
 *    render (`geminiImageCostNanos`). `estimateTryOnCostNanos` is only the pre-check guard. */
export const AVATAR_IMAGE_NANOS = 10_000_000;

/** Nano-dollar cost of generating `imageCount` avatar variations. */
export function avatarCostNanos(imageCount: number): number {
  const count = Number.isFinite(imageCount) ? Math.max(0, Math.floor(imageCount)) : 0;
  return count * AVATAR_IMAGE_NANOS;
}

/** Nano Banana 2.1 token prices, in nano-dollars per single token (price per 1M tokens x 1,000):
 *  $1.50 input, $7.50 text and thinking output, $30 image output. */
export const NANO_BANANA_INPUT_NANOS_PER_TOKEN = 1_500;
export const NANO_BANANA_TEXT_OUTPUT_NANOS_PER_TOKEN = 7_500;
export const NANO_BANANA_IMAGE_OUTPUT_NANOS_PER_TOKEN = 30_000;

/** A 1K (1024px class) output image is 1,120 output tokens. */
export const NANO_BANANA_1K_IMAGE_TOKENS = 1_120;
/** Each image sent as input is read at high resolution: about 1,120 input tokens. The 5-image
 *  render measured in AI Studio billed 5,673 input tokens. */
export const NANO_BANANA_INPUT_IMAGE_TOKENS = 1_120;
/** Thinking plus text output beyond the image: the same render billed 1,062 thought tokens and
 *  303 text output tokens, so the pre-check budgets a little above that. */
export const NANO_BANANA_THINKING_ALLOWANCE_TOKENS = 1_400;

export interface GeminiImageTokenCounts {
  /** `total_input_tokens`: the prompt text plus every image sent. */
  inputTokens: number;
  /** `total_thought_tokens`: reasoning, billed as text output. */
  thoughtTokens: number;
  /** Output tokens that are not the image (`total_output_tokens` minus the image modality). */
  textOutputTokens: number;
  /** Output tokens in the `image` modality. */
  imageOutputTokens: number;
}

function wholeImageTokens(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** Nano-dollar cost of one Nano Banana 2.1 render from its real token usage. */
export function geminiImageCostNanos(tokens: GeminiImageTokenCounts): number {
  return (
    wholeImageTokens(tokens.inputTokens) * NANO_BANANA_INPUT_NANOS_PER_TOKEN +
    (wholeImageTokens(tokens.thoughtTokens) + wholeImageTokens(tokens.textOutputTokens)) *
      NANO_BANANA_TEXT_OUTPUT_NANOS_PER_TOKEN +
    wholeImageTokens(tokens.imageOutputTokens) * NANO_BANANA_IMAGE_OUTPUT_NANOS_PER_TOKEN
  );
}

/** Best-effort cost of one try-on render fitting `garmentCount` garments, for the pre-check guard
 *  and as the fallback charge when a response carries no usage. The person image counts as one
 *  more input image. The real charge is `geminiImageCostNanos` of the returned usage. */
export function estimateTryOnCostNanos(garmentCount: number): number {
  const count = Number.isFinite(garmentCount) ? Math.max(0, Math.floor(garmentCount)) : 0;
  if (count <= 0) return 0;
  return geminiImageCostNanos({
    inputTokens: (count + 1) * NANO_BANANA_INPUT_IMAGE_TOKENS,
    thoughtTokens: NANO_BANANA_THINKING_ALLOWANCE_TOKENS,
    textOutputTokens: 0,
    imageOutputTokens: NANO_BANANA_1K_IMAGE_TOKENS,
  });
}

/** One billed live second, in nano-dollars. $1.20 per minute. */
export const LIVE_SECOND_NANOS = (LIVE_MINUTE_CENTS * 10_000_000) / 60;

export type UsageSurface = "store" | "preview";
export const GARMENT_MIN_PACKS = 50;
export const GARMENT_MAX_PACKS = 5_000;

/** Unused included units roll into the purchased balance only up to twice the monthly include. */
export const ROLLOVER_CAP_MULTIPLIER = 2;

/** Suggested top-up covers this many days at the current burn, then rises to the wallet minimum. */
export const SUGGESTED_TOP_UP_DAYS = 14;

/** Share of attributed, paid Persona GMV charged on the Main plan. Trial records the sales and does not bill them. */
export const GMV_COMMISSION_RATE = 0.03;

/** Below this, Stripe cannot collect an invoice item, so the balance waits for the next invoice. */
export const GMV_MIN_COMMISSION_CENTS = 50;
