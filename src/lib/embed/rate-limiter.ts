/**
 * Token buckets for the public `/api/embed/*` routes, in two layers:
 *
 * - per client (the signed-in shopper's session, or the caller's IP before sign-in), so one
 *   browser — or one script holding a scraped embed token — cannot hammer a store;
 * - per store (embed token), a ceiling high enough for real traffic that still caps what any number
 *   of clients can cost the merchant in a minute.
 *
 * Kinds are budgeted separately. Telemetry (the 15-second heartbeat, analytics events) used to share
 * one 20-requests-a-minute budget per store with chat and try-on, so a handful of shoppers merely
 * having the widget open locked every one of them out of the paid features.
 *
 * In-memory and per process, like the other limiters here; the hard limit on spend is the
 * merchant's wallet.
 */
export type EmbedRequestKind = "paid" | "standard" | "telemetry" | "auth";

interface BucketLimit {
  burst: number;
  perMinute: number;
}

const LIMITS: Record<EmbedRequestKind, { client: BucketLimit; store: BucketLimit }> = {
  // Chat turns, image generation, live try-on tokens.
  paid: { client: { burst: 20, perMinute: 30 }, store: { burst: 300, perMinute: 600 } },
  // Cart writes, profile reads and edits.
  standard: { client: { burst: 60, perMinute: 120 }, store: { burst: 1_000, perMinute: 3_000 } },
  // Heartbeats and analytics events.
  telemetry: { client: { burst: 30, perMinute: 60 }, store: { burst: 3_000, perMinute: 12_000 } },
  // Shopper sign-in (which has its own per-email and per-IP limits on top).
  auth: { client: { burst: 10, perMinute: 20 }, store: { burst: 200, perMinute: 600 } },
};

interface Bucket {
  availableTokens: number;
  lastRefillAt: number;
}

function buckets(): Map<string, Bucket> {
  const holder = globalThis as typeof globalThis & { __personaEmbedBuckets?: Map<string, Bucket> };
  holder.__personaEmbedBuckets ??= new Map();
  return holder.__personaEmbedBuckets;
}

const MAX_TRACKED_BUCKETS = 100_000;

function take(key: string, limit: BucketLimit, cost: number): boolean {
  const all = buckets();
  const now = Date.now();
  let bucket = all.get(key);
  if (!bucket) {
    if (all.size > MAX_TRACKED_BUCKETS) all.clear();
    bucket = { availableTokens: limit.burst, lastRefillAt: now };
    all.set(key, bucket);
  }
  const elapsedSeconds = (now - bucket.lastRefillAt) / 1000;
  bucket.availableTokens = Math.min(limit.burst, bucket.availableTokens + elapsedSeconds * (limit.perMinute / 60));
  bucket.lastRefillAt = now;
  if (bucket.availableTokens < cost) return false;
  bucket.availableTokens -= cost;
  return true;
}

/** True when the request may proceed. `clientKey` identifies the caller within the store. */
export function allowEmbedRequest(
  embedToken: string,
  options: { kind?: EmbedRequestKind; clientKey?: string; cost?: number } = {},
): boolean {
  const kind = options.kind ?? "standard";
  const cost = options.cost ?? 1;
  const limits = LIMITS[kind];
  const clientOk = take(`${kind}:${embedToken}:${options.clientKey ?? "anonymous"}`, limits.client, cost);
  if (!clientOk) return false;
  return take(`${kind}:${embedToken}`, limits.store, cost);
}
