import { createClient } from "redis";

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
 * With `REDIS_URL` set (a Render Key Value instance) the counts are shared by every instance, so
 * scaling out does not multiply the limits; without it, or while it is unreachable, each process
 * keeps its own buckets. The hard limit on spend is the merchant's wallet either way.
 */
export type EmbedRequestKind = "paid" | "standard" | "telemetry" | "auth";

interface BucketLimit {
  burst: number;
  perMinute: number;
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function limits(): Record<EmbedRequestKind, { client: BucketLimit; store: BucketLimit }> {
  const storePaid = envNumber("EMBED_STORE_PAID_PER_MINUTE", 6_000);
  return {
    // Chat turns, image generation, live try-on tokens.
    paid: { client: { burst: 20, perMinute: 30 }, store: { burst: Math.ceil(storePaid / 2), perMinute: storePaid } },
    // Cart writes, profile reads and edits.
    standard: { client: { burst: 60, perMinute: 120 }, store: { burst: 5_000, perMinute: 15_000 } },
    // Heartbeats and analytics events.
    telemetry: { client: { burst: 30, perMinute: 60 }, store: { burst: 20_000, perMinute: 80_000 } },
    // Shopper sign-in (which has its own per-email and per-IP limits on top).
    auth: { client: { burst: 10, perMinute: 20 }, store: { burst: 1_000, perMinute: 3_000 } },
  };
}

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
    if (all.size >= MAX_TRACKED_BUCKETS) {
      // Oldest first: Map keeps insertion order, and an idle bucket is a full one anyway.
      const oldest = all.keys().next().value;
      if (oldest !== undefined) all.delete(oldest);
    }
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

type SharedClient = ReturnType<typeof createClient>;

let shared: Promise<SharedClient | null> | null = null;
let sharedRetryAt = 0;
const SHARED_RETRY_MS = 30_000;

function sharedStore(): Promise<SharedClient | null> | null {
  const url = process.env.REDIS_URL;
  if (!url || Date.now() < sharedRetryAt) return null;
  shared ??= (async () => {
    const client = createClient({
      url,
      socket: { connectTimeout: 2_000, reconnectStrategy: (retries) => Math.min(retries * 200, 5_000) },
    });
    client.on("error", (error: unknown) => {
      console.warn("[embed rate-limiter] shared store error:", error instanceof Error ? error.message : error);
    });
    await client.connect();
    return client;
  })().catch((error: unknown) => {
    console.warn("[embed rate-limiter] shared store unavailable, limiting per instance:", error instanceof Error ? error.message : error);
    shared = null;
    sharedRetryAt = Date.now() + SHARED_RETRY_MS;
    return null;
  });
  return shared;
}

/** One-minute windows shared by every instance. Coarser than a token bucket, which is fine for a
 *  ceiling: it only has to stop a store or a client far outside normal use. */
async function takeShared(client: SharedClient, key: string, limit: BucketLimit, cost: number): Promise<boolean> {
  const window = Math.floor(Date.now() / 60_000);
  const windowKey = `persona:rl:${key}:${window}`;
  const count = await client.incrBy(windowKey, cost);
  if (count === cost) await client.expire(windowKey, 120);
  return count <= limit.perMinute;
}

/** True when the request may proceed. `clientKey` identifies the caller within the store. */
export async function allowEmbedRequest(
  embedToken: string,
  options: { kind?: EmbedRequestKind; clientKey?: string; cost?: number } = {},
): Promise<boolean> {
  const kind = options.kind ?? "standard";
  const cost = options.cost ?? 1;
  const budget = limits()[kind];
  const clientKey = `${kind}:${embedToken}:${options.clientKey ?? "anonymous"}`;
  const storeKey = `${kind}:${embedToken}`;

  const client = await sharedStore();
  if (client?.isReady) {
    try {
      if (!(await takeShared(client, clientKey, budget.client, cost))) return false;
      return await takeShared(client, storeKey, budget.store, cost);
    } catch (error) {
      console.warn("[embed rate-limiter] shared check failed, limiting per instance:", error instanceof Error ? error.message : error);
    }
  }

  if (!take(clientKey, budget.client, cost)) return false;
  return take(storeKey, budget.store, cost);
}
