/** Prices in nano-dollars (1e-9 USD) so every charge is an integer.
 *
 *  Gemini 3.6 Flash, as billed on the Gemini API: $0.75 / 1M input tokens and $3.75 / 1M output
 *  tokens, including reasoning tokens. AI Commerce Search is $0.0025 per `servingConfigs.search`
 *  call. One session unit is priced exactly at one search, so a search always completes a unit
 *  and chat tokens accumulate in the carry until they do too.
 *
 *  `consume_session_units` defaults its unit size to SESSION_UNIT_NANOS. Callers pass this
 *  constant so a price change here is the one the database applies.
 */

export const GEMINI_INPUT_TOKEN_NANOS = 750;
export const GEMINI_OUTPUT_TOKEN_NANOS = 3_750;

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

/** One billed live second, in nano-dollars. $1.20 per minute. */
export const LIVE_SECOND_NANOS = (LIVE_MINUTE_CENTS * 10_000_000) / 60;

export type UsageSurface = "store" | "preview";
export const GARMENT_MIN_PACKS = 50;
export const GARMENT_MAX_PACKS = 5_000;

/** Each wallet may run this far past zero, as a fraction of that plan's included allowance. */
export const WALLET_GRACE_FRACTION = 0.05;

/** Unused included units roll into the purchased balance only up to twice the monthly include. */
export const ROLLOVER_CAP_MULTIPLIER = 2;

/** Suggested top-up covers this many days at the current burn, then rises to the wallet minimum. */
export const SUGGESTED_TOP_UP_DAYS = 14;

/** Share of attributed, paid Persona GMV charged on the Main plan. Trial records the sales and does not bill them. */
export const GMV_COMMISSION_RATE = 0.03;

/** Below this, Stripe cannot collect an invoice item, so the balance waits for the next invoice. */
export const GMV_MIN_COMMISSION_CENTS = 50;
