import {
  ACS_SEARCH_NANOS,
  GEMINI_INPUT_TOKEN_NANOS,
  GEMINI_OUTPUT_TOKEN_NANOS,
} from "./pricing";

/** Mutable accumulator for one shopper turn. Created by the API route and threaded through
 *  every Gemini call and ACS search that turn causes. Undefined at a call site means "this
 *  path is not a shopper session" — tests and catalog maintenance pass nothing and pay nothing. */
export interface SessionMeter {
  nanos: number;
  acsSearches: number;
  geminiCalls: number;
}

export function createSessionMeter(): SessionMeter {
  return { nanos: 0, acsSearches: 0, geminiCalls: 0 };
}

function wholeTokens(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** Adds one Gemini call. A call that reports no usage still counts, at zero cost, so a missing
 *  `usageMetadata` is visible as calls without nanos rather than as a turn that never happened. */
export function addTokenCost(
  meter: SessionMeter | undefined,
  inputTokens: number,
  outputTokens: number
): void {
  if (!meter) return;
  const input = wholeTokens(inputTokens);
  const output = wholeTokens(outputTokens);
  meter.nanos += input * GEMINI_INPUT_TOKEN_NANOS + output * GEMINI_OUTPUT_TOKEN_NANOS;
  meter.geminiCalls += 1;
}

/** One successful `servingConfigs.search`. Failed calls throw before this runs, so a transport
 *  error is not charged. */
export function addAcsSearch(meter: SessionMeter | undefined): void {
  if (!meter) return;
  meter.nanos += ACS_SEARCH_NANOS;
  meter.acsSearches += 1;
}

/** Stable per shopper message, so a retried request does not charge the turn twice. */
export function sessionUsageIdempotencyKey(sessionId: string, messageId: string | undefined): string | null {
  const session = sessionId.trim();
  const message = messageId?.trim() ?? "";
  if (!session || message.length < 8) return null;
  return `chat:${session}:${message}`;
}
