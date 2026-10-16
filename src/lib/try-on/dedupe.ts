/**
 * Makes a retried try-on request reuse the first request's render instead of starting (and
 * paying for) another one.
 *
 * The widget retries on its own when a request fails at the network level. A request that "failed"
 * for the browser may well still be rendering on the server, or may even have finished with the
 * response lost on the way back; without this, the retry would run a second Gemini call and bill
 * the store twice for one tap. Each request carries an id; a repeat of an id that is running joins
 * it, and a repeat of one that succeeded recently gets the stored answer.
 *
 * A failure is forgotten immediately, so a retry after a real failure does run again. The map
 * lives in one process: a retry that lands on another instance simply renders again, which costs
 * what the old behaviour always did.
 */

const RESULT_TTL_MS = 3 * 60_000;
const MAX_ENTRIES = 200;

interface Entry<T> {
  promise: Promise<T>;
  expiresAt: number;
}

const entries = new Map<string, Entry<unknown>>();

function prune(now: number): void {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/** A request id is only trusted in a plain, bounded shape: it becomes a map key. */
export function parseRequestId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null;
}

export function dedupeRequest<T>(scope: string, requestId: string | null, run: () => Promise<T>): Promise<T> {
  if (!requestId) return run();

  const now = Date.now();
  prune(now);
  const key = `${scope}:${requestId}`;
  const existing = entries.get(key) as Entry<T> | undefined;
  if (existing) return existing.promise;

  const promise = run();
  entries.set(key, { promise, expiresAt: now + RESULT_TTL_MS });
  promise.catch(() => {
    if (entries.get(key)?.promise === promise) entries.delete(key);
  });
  return promise;
}

/** Test hook. */
export function clearDedupedRequests(): void {
  entries.clear();
}
