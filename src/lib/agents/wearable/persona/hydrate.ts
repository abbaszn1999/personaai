import type { Product, ProductVariant } from "@/modules/shopping-agent/types";
import type { VariantOptionGroups } from "@/lib/catalog/sync-types";
import { createTimeoutSignal } from "@/lib/catalog/timeout";
import { getShopifyAccessToken, hydrateShopifyProducts, normalizeShopifyDomain } from "@/lib/shopify/client";
import { hydrateWooProducts, normalizeWordPressUrl } from "@/lib/woocommerce/client";
import { decodeCredentials } from "@/lib/utils/crypto";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { categoryToGarmentSlot } from "@/lib/retrieval/taxonomy";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import { productImageProxyUrl } from "@/lib/images/product-image";
import { hostnameOf, isHostBlocked, recordHostFailure, recordHostSuccess } from "@/lib/net/host-health";

function guessVariantType(optionName: string): ProductVariant["type"] {
  const name = optionName.toLowerCase();
  if (name.includes("size")) return "size";
  if (name.includes("colour") || name.includes("color")) return "color";
  return "style";
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
    attributes: candidate.attributes,
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

  const { signal, cancel } = createTimeoutSignal(HYDRATION_TIMEOUT_MS);

  try {
    const credentials = decodeCredentials(connection.apiKeyEncrypted);
    const externalIds = candidates.map((candidate) => candidate.externalId);

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
            signal
          );

    recordHostSuccess(storeHost);
    const byId = new Map(facts.map((fact) => [fact.externalId, fact]));

    return candidates.map((candidate) => {
      const fresh = byId.get(candidate.externalId);
      if (!fresh) return candidate;
      return {
        ...candidate,
        price: fresh.price ?? candidate.price,
        currency: fresh.currency ?? candidate.currency,
        inStock: fresh.inStock,
      };
    });
  } catch (err) {
    recordHostFailure(storeHost);
    // Name and message only: an aborted `fetch` rejects with a DOMException whose enumerable
    // properties are the twenty-five DOM error constants, and logging the object prints all of
    // them for every timeout while saying nothing the name doesn't.
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[persona hydrateLiveFacts] ${connection.id} ${storeHost ?? "unknown host"} ${reason}`);
    return candidates;
  } finally {
    cancel();
  }
}
