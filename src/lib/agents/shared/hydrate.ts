import type { Product, ProductVariant } from "@/modules/commerce/types";
import type { VariantOptionGroups } from "@/lib/catalog/sync-types";
import { createTimeoutSignal } from "@/lib/catalog/timeout";
import { getShopifyAccessToken, hydrateShopifyProducts, normalizeShopifyDomain } from "@/lib/shopify/client";
import { hydrateWooProducts, normalizeWordPressUrl } from "@/lib/woocommerce/client";
import { decodeCredentials } from "@/lib/utils/crypto";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { categoryToGarmentSlot } from "@/lib/retrieval/taxonomy";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import { productImageProxyUrl } from "@/lib/images/product-image";
import { variantTypeForOptionName } from "@/lib/catalog/option-groups";
import { hostnameOf, isHostBlocked, recordHostFailure, recordHostSuccess } from "@/lib/net/host-health";

function guessVariantType(optionName: string): ProductVariant["type"] {
  return variantTypeForOptionName(optionName);
}

function toVariants(groups: VariantOptionGroups | undefined, inStock: boolean): ProductVariant[] {
  if (!groups) return [];

  return Object.entries(groups).flatMap(([name, options]) =>
    options.map((option) => ({
      id: option.id,
      label: option.label,
      value: option.label.toLowerCase(),
      type: guessVariantType(name),
      inStock,
    }))
  );
}

/**
 * Converts an indexed row into the `Product` the chat UI renders.
 *
 * `garmentSlot` is computed from `garmentCategory`/`garmentSubcategory` — an internal,
 * title-derived pair kept separate from `categoryPaths`, which holds the store's own real
 * (and possibly multi-level) category names rather than a fixed vocabulary
 * `categoryToGarmentSlot` understands.
 *
 * `categoryId`/`tags` are flattened from every path: `categoryId` uses the primary path's own
 * most specific tag (or its root, if the path is only one level), and `tags` collects every
 * distinct name across every path the product belongs to, not just the first.
 */
/**
 * The product's Persona leaf for the try-on prompt: the fourth segment of a `persona > dept >
 * category > leaf` path, taken from the first path that has one. A category-level mapping has no
 * leaf, so the title-derived canonical subcategory stands in. Undefined when neither exists.
 */
export function garmentLeafOf(candidate: Pick<CatalogCandidate, "categoryPaths" | "garmentSubcategory">): string | undefined {
  for (const path of candidate.categoryPaths) {
    if (path[0] === "persona" && typeof path[3] === "string" && path[3].length > 0) return path[3];
  }
  return candidate.garmentSubcategory ?? undefined;
}

export function toProduct(candidate: CatalogCandidate, variantOptions?: VariantOptionGroups): Product {
  const primary = candidate.categoryPaths[0] ?? null;
  const categoryId = primary ? primary[primary.length - 1] : "";
  const categoryTags = [...new Set(candidate.categoryPaths.flat())];

  return {
    id: candidate.externalId,
    name: candidate.title,
    description: candidate.enrichedDescription ?? "",
    price: candidate.price ?? 0,
    currency: candidate.currency ?? "USD",
    previewImageUrl: productImageProxyUrl(candidate.imageUrl),
    imageUrl: candidate.imageUrl ?? "",
    categoryId,
    tags: [...categoryTags, candidate.brand].filter((tag): tag is string => Boolean(tag)),
    variants: toVariants(variantOptions, candidate.inStock),
    rating: 0,
    reviewCount: 0,
    inStock: candidate.inStock,
    garmentSlot: categoryToGarmentSlot(candidate.garmentCategory, candidate.garmentSubcategory),
    ...(garmentLeafOf(candidate) ? { garmentLeaf: garmentLeafOf(candidate) } : {}),
    attributes: candidate.attributes,
    ...(candidate.fitSizes?.length ? { fitSizes: candidate.fitSizes } : {}),
  };
}

/**
 * Turns the finalists into products, dropping anything that can't be rendered.
 *
 * A product with no photo has nothing useful to show in a visual shopping UI — the same rule
 * the platform mappers already apply at ingest, repeated here because a row can lose its image
 * between indexing and display.
 */
export function toProducts(candidates: CatalogCandidate[]): Product[] {
  return candidates.filter((candidate) => candidate.imageUrl).map((candidate) => toProduct(candidate));
}

/** Bounded so a slow merchant store degrades to stored prices instead of stalling the turn. */
const HYDRATION_TIMEOUT_MS = 5_000;

interface LiveFact {
  price: number | null;
  currency: string | null;
  inStock: boolean;
}

/**
 * Live price and stock per product, shared by every shopper of a store for a short while. Every
 * search turn checks the products it is about to show against the merchant's own store API, and
 * with many shoppers browsing the same rails that is the same handful of products asked for again
 * and again — enough to run into Shopify's per-store rate limit. A minute-old price is still
 * fresher than the index; the store remains the truth on add to cart.
 */
const LIVE_FACT_TTL_MS = 45_000;
const MAX_LIVE_FACTS = 5_000;
const liveFacts = new Map<string, { fact: LiveFact; expiresAt: number }>();

function liveFactKey(connectionId: string, externalId: string): string {
  return `${connectionId}\u0000${externalId}`;
}

function cachedLiveFact(connectionId: string, externalId: string, now: number): LiveFact | null {
  const entry = liveFacts.get(liveFactKey(connectionId, externalId));
  if (!entry) return null;
  if (entry.expiresAt > now) return entry.fact;
  liveFacts.delete(liveFactKey(connectionId, externalId));
  return null;
}

function rememberLiveFact(connectionId: string, externalId: string, fact: LiveFact, now: number): void {
  if (liveFacts.size >= MAX_LIVE_FACTS) {
    const oldest = liveFacts.keys().next().value;
    if (oldest !== undefined) liveFacts.delete(oldest);
  }
  liveFacts.set(liveFactKey(connectionId, externalId), { fact, expiresAt: now + LIVE_FACT_TTL_MS });
}

function withFact(candidate: CatalogCandidate, fact: LiveFact): CatalogCandidate {
  return {
    ...candidate,
    price: fact.price ?? candidate.price,
    currency: fact.currency ?? candidate.currency,
    inStock: fact.inStock,
  };
}

/** Drops every remembered live fact. Tests only. */
export function forgetLiveFacts(): void {
  liveFacts.clear();
}

/**
 * Refreshes price and stock for the finalists against the merchant's live store.
 *
 * Only the handful actually being shown, never the candidate pool — the point of the local
 * index is that ranking doesn't touch the store API. Best-effort by design: if the store is
 * slow or erroring, the shopper sees indexed values, which are minutes old at worst, rather
 * than seeing nothing.
 */
export async function hydrateLiveFacts(
  connection: StoreConnectionRow,
  candidates: CatalogCandidate[]
): Promise<CatalogCandidate[]> {
  if (candidates.length === 0 || !connection.apiKeyEncrypted) return candidates;

  // A store that has just failed repeatedly will fail again, and this is the one call on the
  // turn's critical path — paying a five-second timeout per turn to re-learn that a host is
  // down is five seconds of the shopper's wait spent on an answer we already have.
  const storeHost = hostnameOf(
    connection.platform === "shopify"
      ? `https://${normalizeShopifyDomain(connection.storeUrl)}`
      : normalizeWordPressUrl(connection.storeUrl)
  );
  if (isHostBlocked(storeHost)) return candidates;

  const now = Date.now();
  const known = new Map<string, LiveFact>();
  for (const candidate of candidates) {
    const fact = cachedLiveFact(connection.id, candidate.externalId, now);
    if (fact) known.set(candidate.externalId, fact);
  }
  const fromCache = () =>
    candidates.map((candidate) => {
      const fact = known.get(candidate.externalId);
      return fact ? withFact(candidate, fact) : candidate;
    });
  const externalIds = [...new Set(candidates.map((candidate) => candidate.externalId))].filter((id) => !known.has(id));
  if (externalIds.length === 0) return fromCache();

  const { signal, cancel } = createTimeoutSignal(HYDRATION_TIMEOUT_MS);

  try {
    const credentials = decodeCredentials(connection.apiKeyEncrypted);

    const facts =
      connection.platform === "shopify"
        ? await hydrateShopifyProducts(
            normalizeShopifyDomain(connection.storeUrl),
            await getShopifyAccessToken(
              normalizeShopifyDomain(connection.storeUrl),
              credentials.clientId ?? "",
              credentials.clientSecret ?? "",
              connection.id
            ),
            externalIds,
            signal
          )
        : await hydrateWooProducts(
            normalizeWordPressUrl(connection.storeUrl),
            credentials.wpUsername ?? "",
            credentials.wpAppPassword ?? "",
            externalIds,
            signal,
            connection.storeCurrency
          );

    recordHostSuccess(storeHost);
    for (const fresh of facts) {
      const fact: LiveFact = { price: fresh.price ?? null, currency: fresh.currency ?? null, inStock: fresh.inStock };
      known.set(fresh.externalId, fact);
      rememberLiveFact(connection.id, fresh.externalId, fact, Date.now());
    }
    return fromCache();
  } catch (err) {
    recordHostFailure(storeHost);
    // Name and message only: an aborted `fetch` rejects with a DOMException whose enumerable
    // properties are the twenty-five DOM error constants, and logging the object prints all of
    // them for every timeout while saying nothing the name doesn't.
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[persona hydrateLiveFacts] ${connection.id} ${storeHost ?? "unknown host"} ${reason}`);
    return fromCache();
  } finally {
    cancel();
  }
}
