/**
 * Testing/dev escape hatch: set `DISABLE_CACHE=true` in `.env.local` to make every in-process
 * cache in this codebase (catalog search dedupe, Shopify access-token cache, garment-slot
 * classification cache) act as a pure pass-through — every call does real work every time, so
 * nothing here can leave you wondering whether you're looking at stale data while iterating on
 * store/catalog changes.
 *
 * Deliberately does NOT touch the ephemeral *storage* caches (avatar-cache.ts,
 * backdrop-cache.ts) — those hold the only copy of generated/uploaded bytes that exist, so
 * "disabling" them would break the feature rather than just slow it down. It also doesn't touch
 * the rate limiters — those protect the merchant's store from being hammered, not this app's own
 * data freshness.
 */
export function isCacheDisabled(): boolean {
  return process.env.DISABLE_CACHE === "true";
}
