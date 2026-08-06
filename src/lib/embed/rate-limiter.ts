/**
 * Per-embed-token token bucket. The embed token is a public credential baked into every
 * deployed widget snippet, so unlike the authenticated `/api/agents/*` routes there's no
 * per-shopper login to rate limit against — a single scraped/leaked token could otherwise
 * be scripted to drain the merchant's OpenAI credits. In-memory/per-process, matching the
 * existing pattern in catalog/rate-limiter.ts.
 */
interface Bucket {
  availableTokens: number;
  lastRefillAt: number;
}

const MAX_TOKENS = 20;
const REFILL_PER_SEC = 20 / 60; // 20 requests/minute steady-state per token

const buckets = new Map<string, Bucket>();

function refill(bucket: Bucket): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefillAt;
  bucket.availableTokens = Math.min(MAX_TOKENS, bucket.availableTokens + (elapsed / 1000) * REFILL_PER_SEC);
  bucket.lastRefillAt = now;
}

/** Returns true if the request is allowed, false if this embed token is currently rate limited. */
export function allowEmbedRequest(embedToken: string, cost = 1): boolean {
  let bucket = buckets.get(embedToken);
  if (!bucket) {
    bucket = { availableTokens: MAX_TOKENS, lastRefillAt: Date.now() };
    buckets.set(embedToken, bucket);
  }
  refill(bucket);

  if (bucket.availableTokens < cost) return false;
  bucket.availableTokens -= cost;
  return true;
}
