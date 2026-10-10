import { ACS_SEARCH_NANOS, geminiTokenCostNanos, type GeminiTokenCounts } from "./pricing";

/** Mutable accumulator for one shopper turn. Created by the API route and threaded through
 *  every Gemini call and ACS search that turn causes. Undefined at a call site means "this
 *  path is not a shopper session" — tests and catalog maintenance pass nothing and pay nothing. */
export interface SessionMeter {
  nanos: number;
  acsSearches: number;
  geminiCalls: number;
  /** Every Gemini call's prompt tokens, the cached part included. */
  inputTokens: number;
  cachedTokens: number;
  /** Visible output plus thinking. */
  outputTokens: number;
  /** The model the turn's calls ran on (the last one, when a turn used several). */
  model: string | null;
  /**
   * Calls still running when the turn's reply was sent — a backup request that lost the race, a
   * request the shopper walked away from. Google bills them all the same, so the turn is charged
   * only once every one of them has settled and added its cost.
   */
  pending: Promise<unknown>[];
}

export function createSessionMeter(): SessionMeter {
  return {
    nanos: 0,
    acsSearches: 0,
    geminiCalls: 0,
    inputTokens: 0,
    cachedTokens: 0,
    outputTokens: 0,
    model: null,
    pending: [],
  };
}

/** Adds one Gemini call. Cached input tokens are billed at the cached rate, the rest of the input
 *  at the input rate. A call that reports no usage still counts, at zero cost, so a missing
 *  `usageMetadata` is visible as calls without nanos rather than as a turn that never happened. */
export function addTokenCost(
  meter: SessionMeter | undefined,
  tokens: GeminiTokenCounts,
  at?: Date | number,
  model?: string | null
): void {
  if (!meter) return;
  meter.nanos += geminiTokenCostNanos(tokens, at, model);
  meter.geminiCalls += 1;
  meter.inputTokens += Math.max(0, Math.floor(tokens.inputTokens || 0));
  meter.cachedTokens += Math.max(0, Math.floor(tokens.cachedTokens || 0));
  meter.outputTokens += Math.max(0, Math.floor(tokens.outputTokens || 0));
  if (model) meter.model = model;
}

/** Registers a call whose cost is added when it settles, so the turn waits for it before charging. */
export function trackPendingCost(meter: SessionMeter | undefined, call: Promise<unknown>): void {
  // Always handled: a failed call is the caller's to report, never an unhandled rejection here.
  const settled = call.catch(() => undefined);
  if (meter) meter.pending.push(settled);
}

/** One successful `servingConfigs.search`. Failed calls throw before this runs, so a transport
 *  error is not charged. */
export function addAcsSearch(meter: SessionMeter | undefined): void {
  if (!meter) return;
  meter.nanos += ACS_SEARCH_NANOS;
  meter.acsSearches += 1;
}

/**
 * Unique per request, not per shopper message: a Retry of the same message runs every model call
 * and search again, and each run is paid for. Re-flushing one request's meter still cannot charge
 * twice, because its key is the same. With a request id the turn is always charged, even one that
 * carries no message id of its own (a button press); without one it falls back to the message id.
 */
export function sessionUsageIdempotencyKey(
  sessionId: string,
  messageId: string | undefined,
  requestId?: string
): string | null {
  const session = sessionId.trim();
  const message = messageId?.trim() ?? "";
  if (!session) return null;
  if (requestId && requestId.trim().length >= 8) return `chat:${session}:${message || "turn"}:${requestId.trim()}`;
  if (message.length < 8) return null;
  return `chat:${session}:${message}`;
}
