import { sleep } from "./timeout";
import type { ShopifyThrottleStatus } from "@/lib/shopify/client";

/**
 * Per-`store_connection` token buckets so many shoppers chatting concurrently on the same
 * merchant's widget share one budget instead of each independently hammering that store's
 * API. In-memory and per-process — acceptable for this stage (matches every other in-memory
 * concern in this codebase, e.g. session profile caching); a multi-instance deployment would
 * need a shared store (Redis) instead, out of scope for now.
 */
interface Bucket {
  availableTokens: number;
  maxTokens: number;
  refillRatePerMs: number;
  lastRefillAt: number;
  /** Epoch ms until which this bucket is known-throttled and should not be drawn from. */
  blockedUntil: number;
}

const buckets = new Map<string, Bucket>();

function getBucket(key: string, maxTokens: number, refillPerSec: number): Bucket {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      availableTokens: maxTokens,
      maxTokens,
      refillRatePerMs: refillPerSec / 1000,
      lastRefillAt: Date.now(),
      blockedUntil: 0,
    };
    buckets.set(key, bucket);
  }
  return bucket;
}

function refill(bucket: Bucket): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefillAt;
  bucket.availableTokens = Math.min(bucket.maxTokens, bucket.availableTokens + elapsed * bucket.refillRatePerMs);
  bucket.lastRefillAt = now;
}

async function acquire(key: string, cost: number, maxTokens: number, refillPerSec: number): Promise<void> {
  const bucket = getBucket(key, maxTokens, refillPerSec);
  refill(bucket);

  const now = Date.now();
  if (bucket.blockedUntil > now) {
    await sleep(bucket.blockedUntil - now);
    refill(bucket);
  }

  if (bucket.availableTokens < cost) {
    const deficit = cost - bucket.availableTokens;
    await sleep(Math.ceil(deficit / bucket.refillRatePerMs));
    refill(bucket);
  }

  bucket.availableTokens -= cost;
}

// ─── Shopify: mirrors the real GraphQL cost-based leaky bucket ────────────────

/** Shopify's default Admin API cost bucket (points) and restore rate (points/sec) before
 *  a real response's `throttleStatus` narrows this to the shop's actual values. */
const SHOPIFY_DEFAULT_MAX_POINTS = 1000;
const SHOPIFY_DEFAULT_RESTORE_RATE = 50;
/** A `products(first: N)` search query costs roughly this many points — conservative estimate
 *  reserved up-front; `reportShopifyThrottleStatus` corrects the bucket with the real number
 *  Shopify actually charged right after, from the response's `extensions.cost`. */
const SHOPIFY_SEARCH_QUERY_COST = 50;

export async function acquireShopifyBudget(storeConnectionId: string): Promise<void> {
  await acquire(`shopify:${storeConnectionId}`, SHOPIFY_SEARCH_QUERY_COST, SHOPIFY_DEFAULT_MAX_POINTS, SHOPIFY_DEFAULT_RESTORE_RATE);
}

/** Self-corrects the local bucket estimate with Shopify's real, authoritative cost/throttle
 *  data returned on every GraphQL response — keeps the estimate accurate over time instead of
 *  drifting from the conservative defaults. */
export function reportShopifyThrottleStatus(storeConnectionId: string, status: ShopifyThrottleStatus): void {
  const bucket = getBucket(`shopify:${storeConnectionId}`, status.maximumAvailable, status.restoreRate);
  bucket.maxTokens = status.maximumAvailable;
  bucket.refillRatePerMs = status.restoreRate / 1000;
  bucket.availableTokens = status.currentlyAvailable;
  bucket.lastRefillAt = Date.now();
}

export function reportShopifyThrottled(storeConnectionId: string, retryAfterMs: number): void {
  const bucket = getBucket(`shopify:${storeConnectionId}`, SHOPIFY_DEFAULT_MAX_POINTS, SHOPIFY_DEFAULT_RESTORE_RATE);
  bucket.blockedUntil = Date.now() + retryAfterMs;
}

// ─── WooCommerce: no platform limit exists, so apply a courtesy ceiling ───────

/** WooCommerce/WordPress has no built-in API rate limit to mirror — this is a conservative,
 *  self-imposed ceiling so a busy chat widget never hammers a merchant's own hosting. */
const WORDPRESS_MAX_REQUESTS_PER_SECOND = 3;

export async function acquireWordPressSlot(storeConnectionId: string): Promise<void> {
  await acquire(`wordpress:${storeConnectionId}`, 1, WORDPRESS_MAX_REQUESTS_PER_SECOND, WORDPRESS_MAX_REQUESTS_PER_SECOND);
}

export function reportWordPressThrottled(storeConnectionId: string, retryAfterMs: number): void {
  const bucket = getBucket(`wordpress:${storeConnectionId}`, WORDPRESS_MAX_REQUESTS_PER_SECOND, WORDPRESS_MAX_REQUESTS_PER_SECOND);
  bucket.blockedUntil = Date.now() + retryAfterMs;
}
