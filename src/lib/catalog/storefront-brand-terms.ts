import { decodeCredentials } from "@/lib/utils/crypto";
import { listWordPressBrandTerms, normalizeWordPressUrl } from "@/lib/woocommerce/client";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type { WooBrandTerm } from "./storefront-links";

const TTL_MS = 60 * 60 * 1000;

function cache(): Map<string, { at: number; terms: WooBrandTerm[] }> {
  const holder = globalThis as typeof globalThis & {
    __personaWooBrandTerms?: Map<string, { at: number; terms: WooBrandTerm[] }>;
  };
  return (holder.__personaWooBrandTerms ??= new Map());
}

/**
 * The store's WooCommerce Brands terms, for turning a brand's name into the slug and id its storefront
 * filter uses. Held for an hour per connection: the list changes when a merchant adds a brand, and the
 * caller is building links, not making a decision that a stale term would corrupt.
 *
 * Empty when the store has no Brands taxonomy or the read fails, which makes the link builder fall back
 * to the plain collection link rather than guessing a slug.
 */
export async function getWooBrandTerms(connection: StoreConnectionRow): Promise<WooBrandTerm[]> {
  if (!connection.apiKeyEncrypted) return [];
  if (connection.platform !== "woocommerce" && connection.platform !== "wordpress") return [];

  const hit = cache().get(connection.id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.terms;

  try {
    const { wpUsername, wpAppPassword } = decodeCredentials(connection.apiKeyEncrypted);
    const terms = await listWordPressBrandTerms(normalizeWordPressUrl(connection.storeUrl), wpUsername, wpAppPassword);
    cache().set(connection.id, { at: Date.now(), terms });
    return terms;
  } catch (err) {
    console.error("[storefront-brand-terms]", connection.id, err);
    return [];
  }
}
