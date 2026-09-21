import type { Product } from "@/modules/commerce/types";
import { getStoreConnectionByOwner, type StoreConnectionRow } from "@/lib/db/store-connections";
import { decodeCredentials } from "@/lib/utils/crypto";
import { getShopifyAccessToken, searchShopifyProducts, ShopifyApiError } from "@/lib/shopify/client";
import { searchWordPressProducts, WooCommerceApiError, normalizeWordPressUrl } from "@/lib/woocommerce/client";
import { dedupe } from "./cache";
import { createTimeoutSignal, sleep } from "./timeout";
import { buildQueryFallbackChain } from "./query-helpers";
import { resolveCategoryIds } from "./resolve-category";
import {
  acquireShopifyBudget,
  acquireWordPressSlot,
  reportShopifyThrottled,
  reportShopifyThrottleStatus,
  reportWordPressThrottled,
} from "./rate-limiter";

export class CatalogSearchError extends Error {
  constructor(
    message: string,
    public status = 502,
    public throttled = false,
    public retryAfterMs?: number
  ) {
    super(message);
    this.name = "CatalogSearchError";
  }
}

export interface SearchCatalogInput {
  /** Never accepted from the client/model — the store connection is always resolved
   *  server-side from the authenticated caller, never from a client-supplied id. */
  ownerId: string;
  query?: string;
  categoryId?: string;
  maxPrice?: number;
  limit?: number;
}

/** How closely the returned products actually match what was asked for, so the agent can
 *  caveat appropriately instead of presenting a broad browse as an exact match:
 *  - "exact": the specific query (and category, if any) matched directly.
 *  - "partial": a fallback tier matched instead — either the resolved category alone (text
 *    ignored) or a simplified/keyword version of the original query.
 *  - "broad": nothing specific matched at all; this is a scoped browse of selected categories.
 *  - "none": even a scoped browse returned nothing (store has no matching products). */
export type CatalogMatchType = "exact" | "partial" | "broad" | "none";

export interface CatalogSearchResult {
  products: Product[];
  matchType: CatalogMatchType;
}

interface OneShotSearchInput {
  query?: string;
  categoryId?: string;
  maxPrice?: number;
  limit?: number;
}

const SEARCH_TIMEOUT_MS = 8000;
/** Max primary (non-broad) tiers before the final scoped browse. Leaves room for at least one
 *  keyword variant even when a category also resolved. */
const MAX_PRIMARY_ATTEMPTS = 4;
const MAX_THROTTLE_RETRIES = 2;

/**
 * Live product search, scoped server-side to the authenticated caller's own connected store.
 * Real store search endpoints (WooCommerce's REST `search` especially) do a fairly literal
 * phrase match, so a natural-language query from the LLM ("warm winter outfit") very often
 * matches nothing even when perfectly good products exist. This progressively falls back
 * through several tiers — resolved category + full query, resolved category alone, query
 * variants, then a browse scoped to merchant-selected categories — stopping at the first tier
 * that returns real results.
 */
export async function searchCatalog(input: SearchCatalogInput): Promise<CatalogSearchResult> {
  const connection = await getStoreConnectionByOwner(input.ownerId);
  if (!connection || connection.status !== "connected" || !connection.apiKeyEncrypted) {
    throw new CatalogSearchError("No connected store was found for this account.", 404);
  }

  const selectedCategories = connection.categories.filter((c) => connection.selectedCategoryIds.includes(c.id));
  const selectedCategoryParam =
    selectedCategories.length > 0 ? selectedCategories.map((c) => c.id).join(",") : undefined;
  const categoryIds = resolveCategoryIds(selectedCategories, input.categoryId, input.query ?? "");
  const categoryIdParam = categoryIds.length > 0 ? categoryIds.join(",") : undefined;
  const queryVariants = buildQueryFallbackChain(input.query ?? "");

  const primaryTiers: Array<{ input: OneShotSearchInput; matchType: CatalogMatchType }> = [];

  // Prefer: category + best query, then category alone, then at least two query variants.
  if (categoryIdParam && queryVariants.length > 0) {
    primaryTiers.push({ input: { query: queryVariants[0], categoryId: categoryIdParam }, matchType: "exact" });
  }
  if (categoryIdParam) {
    primaryTiers.push({ input: { categoryId: categoryIdParam }, matchType: "partial" });
  }

  // Skip the first query variant when it was already tried with the category, so keyword
  // fallbacks still get a chance before the broad browse.
  const queryStart = categoryIdParam && queryVariants.length > 0 ? 1 : 0;
  for (let i = queryStart; i < queryVariants.length; i++) {
    const query = queryVariants[i];
    primaryTiers.push({
      input: { query },
      matchType: i === 0 && !categoryIdParam ? "exact" : "partial",
    });
  }

  let lastProducts: Product[] = [];
  for (const tier of primaryTiers.slice(0, MAX_PRIMARY_ATTEMPTS)) {
    const products = await runOneSearchWithRetry(connection, {
      ...tier.input,
      maxPrice: input.maxPrice,
      limit: input.limit,
    });
    if (products.length > 0) {
      return { products, matchType: tier.matchType };
    }
    lastProducts = products;
  }

  // Last resort — browse within the merchant's selected categories when possible, not the
  // entire published catalog.
  const broadProducts = await runOneSearchWithRetry(connection, {
    categoryId: selectedCategoryParam,
    maxPrice: input.maxPrice,
    limit: input.limit,
  });
  if (broadProducts.length > 0) {
    return { products: broadProducts, matchType: "broad" };
  }

  return { products: lastProducts, matchType: "none" };
}

async function runOneSearchWithRetry(connection: StoreConnectionRow, input: OneShotSearchInput): Promise<Product[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_THROTTLE_RETRIES; attempt++) {
    try {
      return await runOneSearch(connection, input);
    } catch (err) {
      lastError = err;
      const throttled =
        (err instanceof CatalogSearchError && err.throttled) ||
        (err instanceof ShopifyApiError && err.throttled) ||
        (err instanceof WooCommerceApiError && err.throttled);

      const retryAfterMs =
        (err instanceof CatalogSearchError && err.retryAfterMs) ||
        (err instanceof ShopifyApiError && err.retryAfterMs) ||
        (err instanceof WooCommerceApiError && err.retryAfterMs) ||
        2000;

      if (!throttled || attempt === MAX_THROTTLE_RETRIES) throw err;
      await sleep(retryAfterMs);
    }
  }
  throw lastError instanceof Error ? lastError : new CatalogSearchError("Catalog search failed.");
}

function runOneSearch(connection: StoreConnectionRow, input: OneShotSearchInput): Promise<Product[]> {
  const cacheKey = JSON.stringify({
    connectionId: connection.id,
    query: input.query ?? "",
    categoryId: input.categoryId ?? "",
    maxPrice: input.maxPrice ?? null,
    limit: input.limit ?? 6,
  });

  return dedupe(cacheKey, () => dispatchSearch(connection, input));
}

function dispatchSearch(connection: StoreConnectionRow, input: OneShotSearchInput): Promise<Product[]> {
  if (connection.platform === "shopify") {
    return searchShopifyCatalog(connection, input);
  }
  if (connection.platform === "wordpress" || connection.platform === "woocommerce") {
    return searchWordPressCatalog(connection, input);
  }
  throw new CatalogSearchError("Live product search isn't available for this store platform yet.", 400);
}

async function searchShopifyCatalog(connection: StoreConnectionRow, input: OneShotSearchInput): Promise<Product[]> {
  const { clientId, clientSecret } = decodeCredentials(connection.apiKeyEncrypted!);
  await acquireShopifyBudget(connection.id);

  const { signal, cancel } = createTimeoutSignal(SEARCH_TIMEOUT_MS);
  try {
    const accessToken = await getShopifyAccessToken(connection.storeUrl, clientId, clientSecret, connection.id);
    const { results, throttleStatus } = await searchShopifyProducts(
      connection.storeUrl,
      accessToken,
      { query: input.query, maxPrice: input.maxPrice, collectionId: input.categoryId, limit: input.limit },
      signal
    );

    if (throttleStatus) {
      reportShopifyThrottleStatus(connection.id, throttleStatus);
    }
    return results;
  } catch (err) {
    if (err instanceof ShopifyApiError && err.throttled) {
      reportShopifyThrottled(connection.id, err.retryAfterMs ?? 2000);
      throw new CatalogSearchError(err.message, 429, true, err.retryAfterMs ?? 2000);
    }
    console.error("[lib/catalog searchShopifyCatalog]", err);
    const message = err instanceof ShopifyApiError ? err.message : "Failed to search the connected Shopify store.";
    throw new CatalogSearchError(message);
  } finally {
    cancel();
  }
}

async function searchWordPressCatalog(connection: StoreConnectionRow, input: OneShotSearchInput): Promise<Product[]> {
  const { wpUsername, wpAppPassword } = decodeCredentials(connection.apiKeyEncrypted!);
  await acquireWordPressSlot(connection.id);

  const { signal, cancel } = createTimeoutSignal(SEARCH_TIMEOUT_MS);
  try {
    const siteUrl = normalizeWordPressUrl(connection.storeUrl);
    return await searchWordPressProducts(
      siteUrl,
      wpUsername,
      wpAppPassword,
      { query: input.query, maxPrice: input.maxPrice, categoryId: input.categoryId, limit: input.limit },
      signal
    );
  } catch (err) {
    if (err instanceof WooCommerceApiError && err.throttled) {
      reportWordPressThrottled(connection.id, err.retryAfterMs ?? 2000);
      throw new CatalogSearchError(err.message, 429, true, err.retryAfterMs ?? 2000);
    }
    console.error("[lib/catalog searchWordPressCatalog]", err);
    const message = err instanceof WooCommerceApiError ? err.message : "Failed to search the connected WordPress store.";
    throw new CatalogSearchError(message);
  } finally {
    cancel();
  }
}
