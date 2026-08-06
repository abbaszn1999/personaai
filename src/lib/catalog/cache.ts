/**
 * Short-TTL cache + in-flight de-duplication for catalog search calls. Two concurrent
 * shoppers (or the same shopper's agent making a near-identical follow-up call) asking a
 * similar thing within the TTL window share one live upstream request instead of each
 * hitting the merchant's store separately.
 *
 * Set `DISABLE_CACHE=true` (see lib/utils/disable-cache.ts) to bypass this entirely — every
 * call hits the store fresh, no de-duping either, which is useful while iterating on catalog
 * changes and you want to rule caching out as a variable.
 */
import { isCacheDisabled } from "@/lib/utils/disable-cache";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const TTL_MS = 5000;

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

/** Runs `fn()` for `key`, reusing a cached result or an already in-flight call when possible. */
export async function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (isCacheDisabled()) return fn();

  const cached = getCached<T>(key);
  if (cached !== undefined) return cached;

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = fn()
    .then((result) => {
      cache.set(key, { value: result, expiresAt: Date.now() + TTL_MS });
      return result;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}
