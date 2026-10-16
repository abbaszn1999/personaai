/**
 * Sending a try-on render request, and deciding what a failure of it means.
 *
 * A render is one long request (12-30 s, sometimes far more), which is exactly the kind a
 * mobile connection drops, a deploy interrupts, or a proxy cuts. Reading each of those as a
 * final "Failed to fetch" is what shoppers kept seeing, so:
 *
 * - a request that never got an answer (network error, gateway 502/503/504, the client's own
 *   timeout) is repeated automatically, with the same `requestId` so the server joins the render
 *   already running or returns the one it finished, instead of billing a second time;
 * - an answer from our own server carries a `code` and says whether asking again can help, and
 *   the server has already retried what it could, so those are not repeated blind;
 * - nothing here ever returns a browser or provider string. A failure is a `kind`, and the
 *   widget words it in the shopper's language.
 */

export type TryOnFailureKind =
  /** No answer: offline, a dropped connection, or a gateway error. */
  | "network"
  /** The render ran out of time. */
  | "timeout"
  /** The service is overloaded; waiting a little helps. */
  | "busy"
  /** One of the item pictures could not be loaded. */
  | "garment"
  /** Try-on is not available on this store right now (including an empty provider balance). */
  | "unavailable"
  | "generic";

export class TryOnRequestError extends Error {
  constructor(
    public kind: TryOnFailureKind,
    /** Whether a manual Retry is worth offering. */
    public retryable: boolean,
    /** Whether the request is worth repeating automatically, with no shopper action. */
    public autoRetry = false
  ) {
    super(`try-on failed: ${kind}`);
    this.name = "TryOnRequestError";
  }
}

interface ErrorBodyShape {
  code?: unknown;
  retryable?: unknown;
}

export function classifyTryOnResponse(status: number, body: ErrorBodyShape | null): TryOnRequestError {
  const code = typeof body?.code === "string" ? body.code : null;

  if (code) {
    const retryable = typeof body?.retryable === "boolean" ? body.retryable : status >= 500;
    switch (code) {
      case "timeout":
        return new TryOnRequestError("timeout", retryable);
      case "no_image":
      case "provider_busy":
      case "unreachable":
      case "rate_limited":
        return new TryOnRequestError("busy", retryable);
      // The server's own queue was full; a few seconds later there is a free slot.
      case "busy":
        return new TryOnRequestError("busy", true, true);
      case "garment_image":
        return new TryOnRequestError("garment", retryable);
      case "rejected":
      case "not_configured":
      case "insufficient_balance":
      case "unauthorized":
        return new TryOnRequestError("unavailable", false);
      default:
        return new TryOnRequestError("generic", retryable);
    }
  }

  // No code means the answer did not come from our route: a proxy, a restarting server, a cold start.
  if (status === 502 || status === 503 || status === 504 || status === 408) {
    return new TryOnRequestError("network", true, true);
  }
  return new TryOnRequestError("generic", status >= 500);
}

/** A request that threw never reached an answer: either our own timeout fired or the network failed. */
export function classifyTryOnThrown(timedOut: boolean): TryOnRequestError {
  return new TryOnRequestError(timedOut ? "timeout" : "network", true, true);
}

export interface TryOnRequestOptions {
  /** One attempt's cap. The server needs up to ~105 s, so this sits above it. */
  attemptTimeoutMs?: number;
  /** All attempts together. */
  totalBudgetMs?: number;
  maxAttempts?: number;
  /** Below this much budget a further attempt could not finish, so the last error is final. */
  minAttemptMs?: number;
  backoffMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const DEFAULTS = {
  attemptTimeoutMs: 115_000,
  totalBudgetMs: 175_000,
  maxAttempts: 3,
  minAttemptMs: 15_000,
  backoffMs: [1_000, 2_500] as readonly number[],
};

/**
 * Runs `send` until it yields an image, retrying only what {@link classifyTryOnResponse} and
 * {@link classifyTryOnThrown} mark as worth repeating. Throws a {@link TryOnRequestError}.
 */
export async function requestTryOnImage(
  send: (signal: AbortSignal) => Promise<Response>,
  options: TryOnRequestOptions = {}
): Promise<string> {
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULTS.attemptTimeoutMs;
  const totalBudgetMs = options.totalBudgetMs ?? DEFAULTS.totalBudgetMs;
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
  const minAttemptMs = options.minAttemptMs ?? DEFAULTS.minAttemptMs;
  const backoffMs = options.backoffMs ?? DEFAULTS.backoffMs;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const startedAt = now();

  let last: TryOnRequestError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = totalBudgetMs - (now() - startedAt);
    if (attempt > 1 && remaining < minAttemptMs) break;

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.min(attemptTimeoutMs, remaining));

    try {
      const res = await send(controller.signal);
      const data = (await res.json().catch(() => null)) as (ErrorBodyShape & { imageUrl?: unknown }) | null;
      if (res.ok && typeof data?.imageUrl === "string" && data.imageUrl) return data.imageUrl;
      last = classifyTryOnResponse(res.status, data);
    } catch {
      last = classifyTryOnThrown(timedOut);
    } finally {
      clearTimeout(timer);
    }

    if (!last.autoRetry || attempt === maxAttempts) throw last;
    await sleep(backoffMs[Math.min(attempt - 1, backoffMs.length - 1)] ?? 1_000);
  }

  throw last ?? new TryOnRequestError("generic", true);
}

/** A fresh id per tap on Wear; every retry of that tap reuses it. */
export function newTryOnRequestId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `tryon_${random}`.slice(0, 64);
}
