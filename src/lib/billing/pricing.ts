/** Prices in nano-dollars (1e-9 USD) so every charge is an integer.
 *
 *  Every vendor price below was checked against the vendor's published pricing on 2026-10-06:
 *  - Gemini 3.x Flash (3.6, 3.7 and 3.8 share one price list), Standard tier, per Google's Gemini
 *    API pricing page. See `geminiTokenRates`.
 *  - AI Commerce Search: $2.50 per 1,000 `servingConfigs.search` calls (Google Cloud, "AI Commerce
 *    Search pricing"), i.e. $0.0025 a search.
 *  - Pruna: `p-image-edit` $0.010 per output image (docs.api.pruna.ai).
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

/** The Gemini token prices in force at `at`. All Gemini 3.x Flash models bill identically, which
 *  is why this takes no model: a different tier (Pro, Flash-Lite) would need its own rates. */
export function geminiTokenRates(at: Date | number = Date.now()): GeminiTokenRates {
  const time = typeof at === "number" ? at : at.getTime();
  return time >= GEMINI_STANDARD_PRICING_STARTS_MS ? GEMINI_FLASH_STANDARD_RATES : GEMINI_FLASH_INTRO_RATES;
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
export function geminiTokenCostNanos(tokens: GeminiTokenCounts, at: Date | number = Date.now()): number {
  const input = wholeTokens(tokens.inputTokens);
  const output = wholeTokens(tokens.outputTokens);
  const cached = Math.min(wholeTokens(tokens.cachedTokens), input);
  const rates = geminiTokenRates(at);
  return (input - cached) * rates.input + cached * rates.cachedInput + output * rates.output;
}

export const ACS_SEARCH_NANOS = 2_500_000;

export const SESSION_UNIT_NANOS = 2_500_000;

/**
 * At-cost top-ups. Stripe bills whole cents, so sessions and garments are sold in packs.
 * One session pack is 1,000 units at $2.50. One garment pack is 100 units at $0.80 ($0.008 each).
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
export const GARMENT_PACK_CENTS = 80;

/** One garment or avatar unit, in nano-dollars. $0.008, from the pack price. */
export const GARMENT_UNIT_NANOS = (GARMENT_PACK_CENTS * 10_000_000) / GARMENT_PACK_UNITS;

/** Real Pruna render cost, in nano-dollars, from Pruna's published API pricing:
 *  `p-image-edit` (avatar) is $0.010 per output image; `p-image-try-on` is $0.015 for the
 *  first garment then $0.008 for each additional garment. Both are charged in $0.008 units via
 *  a per-account nano carry (see `consume_image_generation`), so no fractional cost is ever
 *  lost or over-collected.
 *
 *  Open question, not settled by the docs: `prunaTryOn` runs with `turbo: true`, which Pruna's
 *  model card prices at a flat $0.008 per garment, so the first garment would be $0.008 rather
 *  than $0.015. These constants keep the $0.015 first-garment rate this project recorded as
 *  confirmed by Pruna support with turbo on; compare one try-on against the Pruna usage page and
 *  lower TRY_ON_FIRST_GARMENT_NANOS to 8_000_000 if the invoice says otherwise. */
export const AVATAR_IMAGE_NANOS = 10_000_000;
export const TRY_ON_FIRST_GARMENT_NANOS = 15_000_000;
export const TRY_ON_EXTRA_GARMENT_NANOS = 8_000_000;

/** Nano-dollar cost of generating `imageCount` avatar variations. */
export function avatarCostNanos(imageCount: number): number {
  const count = Number.isFinite(imageCount) ? Math.max(0, Math.floor(imageCount)) : 0;
  return count * AVATAR_IMAGE_NANOS;
}

/** Nano-dollar cost of one try-on render fitting `garmentCount` garments in a single call. */
export function tryOnCostNanos(garmentCount: number): number {
  const count = Number.isFinite(garmentCount) ? Math.max(0, Math.floor(garmentCount)) : 0;
  if (count <= 0) return 0;
  return TRY_ON_FIRST_GARMENT_NANOS + (count - 1) * TRY_ON_EXTRA_GARMENT_NANOS;
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
