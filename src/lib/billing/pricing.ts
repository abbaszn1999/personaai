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

/** Temporary monthly included allowance, large enough that metering can run without stopping a
 *  merchant. Real per-plan allowances arrive with the session wallet. */
export const SESSION_INCLUDED_UNITS_PER_CYCLE = 1_000_000;
