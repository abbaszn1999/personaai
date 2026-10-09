import type { CatalogCandidate, CatalogFacets, CategoryPath } from "@/lib/retrieval/types";
import { deleteProduct, getProduct, listProducts, markOutOfStock, searchProducts, searchProductsRaw } from "./client";
import { isAcsConfigured } from "./config";
import {
  assertConnectionId,
  buildAcsProductId,
  escapeFilterLiteral,
  merchantFilterClause,
  ownsAcsProduct,
} from "./isolation";
import { toCandidate, toCandidateFromProduct } from "./search-adapter";
import type { AcsProduct, AcsSearchResultItem } from "./types";

/**
 * ACS-backed replacements for the three `catalog_products` reads that weren't in scope for the
 * search-adapter phase — `getCatalogFacets`, `getProductGroup` and `getCatalogProductsByExternalIds`
 * — needed before the table can actually be dropped. These are direct reads/lookups, never
 * relevance-ranked.
 */

/** Same permission-boundary contract as the pgvector reads: a required, never-optional scope, and
 *  an empty scope means "nothing selected", not "no restriction". */
export type CategoryScope = readonly string[];

/** No real shopper behind these reads, but ACS requires a `visitorId` on every search call
 *  regardless. A fixed, obviously-synthetic value keeps these reads out of any per-visitor
 *  personalization ACS might apply to real traffic. */
const SYSTEM_VISITOR_ID = "system:catalog-read";

/** Deletes kept in flight at once during a full-catalog sweep. A few hundred concurrent DELETEs
 *  against one API is a self-inflicted rate limit; a bounded window stays well inside quota. */
const DELETE_CONCURRENCY = 20;
const OWNERSHIP_READ_MASK = "id,type,primaryProductId,attributes";

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Pages through a browse-mode (empty query) search until either the results run out or
 *  `maxPages` is hit — the safety cap a single unbounded merchant catalog can't blow through. */
async function browseAll(
  connectionId: string,
  scope: CategoryScope,
  extraFilter: string | undefined,
  pageSize: number,
  maxPages: number
): Promise<AcsSearchResultItem[]> {
  if (scope.length === 0 || !isAcsConfigured()) return [];

  const items: AcsSearchResultItem[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const response = await searchProducts({
      connectionId,
      categoryScope: scope,
      visitorId: SYSTEM_VISITOR_ID,
      query: "",
      pageSize,
      extraFilter,
      pageToken,
    });

    items.push(...(response.results ?? []));
    if (!response.nextPageToken) break;
    pageToken = response.nextPageToken;
  }

  return items;
}

/** Variant lookup: every product sharing a group id, still scoped to the merchant's current
 *  selection. The ACS analogue of the pgvector `product_group_id` equality read. */
export async function getProductGroup(
  connectionId: string,
  productGroupId: string,
  scope: CategoryScope
): Promise<CatalogCandidate[]> {
  if (scope.length === 0) return [];

  const extraFilter = `(attributes.product_group_id: ANY("${escapeFilterLiteral(productGroupId)}"))`;
  // A product group is a handful of colourways/sizes of one item, never large enough to need
  // more than one page.
  const items = await browseAll(connectionId, scope, extraFilter, 100, 1);
  return items.map(toCandidate);
}

/** Bounds how many `GetProduct` calls run at once for one rehydration — a shopper's known-product
 *  list or a pinned item is never more than a page or two of cards, so this is generous headroom
 *  rather than a real throughput limit, same spirit as `DELETE_CONCURRENCY`. */
const GET_CONCURRENCY = 20;

/**
 * Every chat turn rehydrates the cards still on screen, and ACS allows the whole project only a few
 * hundred product reads a minute — re-reading the same cards each turn would exhaust that with a
 * handful of shoppers. A card read a few minutes ago is exact enough to talk about; what is shown
 * again is re-checked against the live store anyway.
 */
const PRODUCT_READ_TTL_MS = 3 * 60_000;
const PRODUCT_READ_CACHE_SIZE = 5_000;
const productReads = new Map<string, { product: AcsProduct | null; expiresAt: number }>();

async function getProductCached(acsProductId: string): Promise<AcsProduct | null> {
  const cached = productReads.get(acsProductId);
  if (cached && cached.expiresAt > Date.now()) return cached.product;
  const product = await getProduct(acsProductId);
  productReads.delete(acsProductId);
  productReads.set(acsProductId, { product, expiresAt: Date.now() + PRODUCT_READ_TTL_MS });
  if (productReads.size > PRODUCT_READ_CACHE_SIZE) productReads.delete(productReads.keys().next().value!);
  return product;
}

/** For tests, and for a caller that has just written products and must read them back. */
export function forgetCachedProductReads(): void {
  productReads.clear();
}

/** True when a product carries at least one of the scope's category ids — the same membership
 *  test `categoryScopeFilterClause` applies server-side for a search, reimplemented here because
 *  a direct `GetProduct` (see below) has no filter clause of its own to enforce it. */
function isInCategoryScope(product: AcsProduct, scope: CategoryScope): boolean {
  const categories = product.categories ?? [];
  return categories.some((category) => scope.includes(category));
}

/**
 * Rehydrates products the client only sent back as ids — the pinned/discussed item and every
 * card still "known" from earlier in the conversation.
 *
 * Deliberately direct `GetProduct` calls, one per id, rather than a `productId: ANY(...)` search:
 * `GetProduct` always returns the full product regardless of `attributesConfig` retrievability,
 * while `SearchService.Search` only returns fields explicitly marked `RETRIEVABLE_ENABLED` — and
 * enabling that can take Google's documented up-to-12-hours to actually propagate into search
 * results. A shopper asking about a product they already clicked on must never wait on that: this
 * is the one read where the exact id is already known going in, so there is no reason to route it
 * through search (and its propagation lag) at all. `merchantFilterClause`'s isolation still holds
 * because `buildAcsProductId` bakes `connectionId` into the id itself — a caller can only ever
 * construct a ready-made id for its own connection's products, never another merchant's.
 */
export async function getCatalogProductsByExternalIds(
  connectionId: string,
  externalIds: string[],
  scope: CategoryScope
): Promise<CatalogCandidate[]> {
  if (externalIds.length === 0 || scope.length === 0 || !isAcsConfigured()) return [];

  const entries = (
    await Promise.all(
      chunk(externalIds, GET_CONCURRENCY).map((batch) =>
        Promise.all(
          batch.map(async (externalId) => {
            const product = await getProductCached(buildAcsProductId(connectionId, externalId));
            return product ? { externalId, product } : null;
          })
        )
      )
    )
  ).flat();

  return entries
    .filter((entry): entry is { externalId: string; product: AcsProduct } => entry !== null && isInCategoryScope(entry.product, scope))
    .map((entry) => toCandidateFromProduct(entry.externalId, entry.product));
}

/** Distinct values actually present in this catalog, same purpose as the pgvector version: fed
 *  into the filter-building prompt so the model only ever builds against real, stocked values.
 *  Sourced from a bounded browse over ACS rather than a single query — there is no facet-count
 *  endpoint this app uses, so the values are derived from a large sample of results instead. */
export async function getCatalogFacets(connectionId: string, scope: CategoryScope): Promise<CatalogFacets> {
  if (scope.length === 0) return { categories: [], brands: [], priceRange: null };

  // 100/page, 20 pages — 2,000 products is enough to see every distinct category/brand/price
  // band on any catalog this app's category-scoped indexing is meant for, at a bounded cost.
  const items = await browseAll(connectionId, scope, undefined, 100, 20);
  const candidates = items.map(toCandidate);

  const categorySet = new Set<string>();
  const categories: Array<{ category: string; subcategory: string | null }> = [];
  const brands = new Set<string>();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  const addFacet = (category: string, subcategory: string | null) => {
    const key = `${category}::${subcategory ?? ""}`;
    if (categorySet.has(key)) return;
    categorySet.add(key);
    categories.push({ category, subcategory });
  };

  for (const candidate of candidates) {
    for (const path of candidate.categoryPaths as CategoryPath[]) {
      const [root, ...rest] = path;
      if (!root) continue;
      addFacet(root, null);
      for (const segment of rest) addFacet(root, segment);
    }

    if (candidate.brand) brands.add(candidate.brand);

    if (candidate.price !== null && Number.isFinite(candidate.price)) {
      min = Math.min(min, candidate.price);
      max = Math.max(max, candidate.price);
    }
  }

  return {
    categories,
    brands: [...brands].sort(),
    priceRange: Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null,
  };
}

/**
 * Downgrades every one of this connection's products that the merchant's *new* category
 * selection no longer covers to `OUT_OF_STOCK` — the ACS analogue of `pruneUncoveredProducts`,
 * with "downgrade" standing in for "delete" per Google's own guidance on preserving user-event
 * history (see `markOutOfStock`'s doc comment).
 *
 * Built on `searchProductsRaw` rather than `searchProducts`: this needs the opposite of an
 * inclusion filter — "not in this scope" — which `searchProducts`'s mandatory scope clause can't
 * express. Each patched product also drops `availability: IN_STOCK`, its own filter condition
 * here, so a re-run of the same page naturally shrinks rather than re-patching what the previous
 * page already handled — no page-token bookkeeping needed.
 */
export async function pruneOutOfScopeAcsProducts(connectionId: string, newScope: CategoryScope): Promise<number> {
  if (newScope.length === 0 || !isAcsConfigured()) return 0;

  try {
    const literals = newScope.map((id) => `"${escapeFilterLiteral(id)}"`).join(",");
    const filter = [
      merchantFilterClause(connectionId),
      `(NOT categories: ANY(${literals}))`,
      `(availability: ANY("IN_STOCK"))`,
    ].join(" AND ");

    let pruned = 0;
    // Safety cap, same order of magnitude as the old pgvector facets read's 5,000-row limit.
    for (let page = 0; page < 50; page++) {
      const response = await searchProductsRaw(filter, { visitorId: SYSTEM_VISITOR_ID, query: "", pageSize: 100 });
      const items = response.results ?? [];
      if (items.length === 0) break;

      await Promise.all(items.map((item) => markOutOfStock(item.id)));
      pruned += items.length;
    }

    return pruned;
  } catch (err) {
    // Never thrown past this point — a merchant's saved category selection must not be put at
    // risk by an ACS hiccup on the cleanup step that follows it (see the caller in
    // `store-connection/route.ts`, which persists the selection before pruning runs).
    console.error("[acs/catalog-reads pruneOutOfScopeAcsProducts]", connectionId, err);
    return 0;
  }
}

/** Mapping saves invalidate every previously indexed category path. Keep the documents for ACS
 * event history, but make all of them unavailable until the next approved full Persona re-index.
 * List the catalog source directly instead of searching: custom-attribute indexing changes can
 * take hours to propagate, while the connection-prefixed product id is immediately reliable. */
export async function deactivateAcsCatalogForRemapping(connectionId: string): Promise<number> {
  if (!isAcsConfigured()) return 0;
  try {
    let deactivated = 0;
    const seenTokens = new Set<string>();
    let pageToken: string | undefined;
    do {
      const response = await listProducts(pageToken);
      const matchingIds = (response.products ?? [])
        .filter((product) => {
          const merchantIds = product.attributes?.merchant_id?.text ?? [];
          return (
            product.availability === "IN_STOCK" &&
            (product.id.startsWith(`${connectionId}_`) || merchantIds.includes(connectionId))
          );
        })
        .map((product) => product.id);

      await Promise.all(matchingIds.map((id) => markOutOfStock(id)));
      deactivated += matchingIds.length;

      pageToken = response.nextPageToken;
      if (pageToken && seenTokens.has(pageToken)) {
        throw new Error("ACS ListProducts returned a repeated page token");
      }
      if (pageToken) seenTokens.add(pageToken);
    } while (pageToken);

    return deactivated;
  } catch (error) {
    console.error("[acs/catalog-reads deactivateAcsCatalogForRemapping]", connectionId, error);
    return 0;
  }
}

/**
 * Takes out of stock every product of this connection that a finished publish did not write.
 *
 * `runId` is the publish that just completed; each product it wrote carries it as
 * `persona_publish_id`. Anything of this connection still in stock under a different (or no) id was
 * written by an earlier catalog — a product the merchant's remapping moved out of scope, or a variant
 * that no longer exists — and would otherwise keep being recommended with stale paths and charts. The
 * old catalog therefore keeps serving right up to the moment the new one has fully replaced it.
 */
export async function retireStaleAcsProducts(connectionId: string, runId: string): Promise<number> {
  if (!isAcsConfigured()) return 0;
  try {
    let retired = 0;
    const seenTokens = new Set<string>();
    let pageToken: string | undefined;
    do {
      const response = await listProducts(pageToken);
      const staleIds = (response.products ?? [])
        .filter((product) => {
          const merchantIds = product.attributes?.merchant_id?.text ?? [];
          const owned = product.id.startsWith(`${connectionId}_`) || merchantIds.includes(connectionId);
          if (!owned || product.availability !== "IN_STOCK") return false;
          return (product.attributes?.persona_publish_id?.text ?? [])[0] !== runId;
        })
        .map((product) => product.id);

      for (const batch of chunk(staleIds, DELETE_CONCURRENCY)) {
        await Promise.all(batch.map((id) => markOutOfStock(id)));
      }
      retired += staleIds.length;

      pageToken = response.nextPageToken;
      if (pageToken && seenTokens.has(pageToken)) {
        throw new Error("ACS ListProducts returned a repeated page token");
      }
      if (pageToken) seenTokens.add(pageToken);
    } while (pageToken);

    return retired;
  } catch (error) {
    console.error("[acs/catalog-reads retireStaleAcsProducts]", connectionId, runId, error);
    return 0;
  }
}

/**
 * Actually deletes every one of this connection's products from ACS — the one caller allowed to,
 * per `markOutOfStock`'s doc comment: a merchant disconnecting their store entirely leaves no
 * ongoing catalog behind, so there is nothing left for that user-event history to serve. Unlike
 * `pruneOutOfScopeAcsProducts` this needs no category-scope clause — every product tagged with
 * this connection's `merchant_id` is in scope for removal, not just the ones outside a new
 * selection — so it is built on `merchantFilterClause` alone rather than going through
 * `searchProducts`'s mandatory (and here, unwanted) inclusion-scope clause.
 */
export async function deleteAllAcsProductsForConnection(connectionId: string): Promise<number> {
  const sweep = await sweepAcsProductsForConnection(connectionId);
  if (!sweep.complete) throw sweep.error ?? new Error("ACS delete sweep stopped early");
  return sweep.deleted;
}

/** Where one sweep of a connection's ACS documents ended. */
export interface AcsConnectionSweep {
  /** Documents this sweep removed. */
  deleted: number;
  /** This connection's documents the sweep found in ACS, removed or not. */
  found: number;
  /** Every document found was deleted, or was already gone. */
  complete: boolean;
  /** The delete ACS refused, when that is what ended the sweep early. */
  error?: unknown;
}

/**
 * `deleteAllAcsProductsForConnection` in passes that fit a serverless function: no delete batch
 * starts after `until`, and a refused delete ends the sweep rather than throwing away the count of
 * what it already removed. The next sweep lists the catalog again and carries on from what is left.
 * A failed listing still throws, since nothing has been deleted at that point.
 */
export async function sweepAcsProductsForConnection(
  connectionId: string,
  options: {
    until?: number;
    /** Called after every listed page and every deleted batch. */
    onProgress?: (progress: { deleted: number; found: number }) => Promise<void> | void;
  } = {},
): Promise<AcsConnectionSweep> {
  assertConnectionId(connectionId);
  if (!isAcsConfigured()) return { deleted: 0, found: 0, complete: true };

  // ProductService.ListProducts reads the catalog's source of truth. SearchService was previously
  // used here, but its eventual consistency made a successful disconnect capable of missing
  // recently imported products. Ownership is `ownsAcsProduct`'s: the merchant_id tag, or the id
  // prefix for documents written before the tag existed.
  const variantIds = new Set<string>();
  const parentIds = new Set<string>();
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;

  do {
    // Only what ownership and the variant-first ordering read: this walks every tenant's documents.
    const response = await listProducts(pageToken, { readMask: OWNERSHIP_READ_MASK });
    for (const product of response.products ?? []) {
      if (ownsAcsProduct(connectionId, product)) {
        // ACS enforces this dependency: a PRIMARY cannot be deleted while any VARIANT points at it.
        // `type` decides whenever it is present. ACS fills a PRIMARY's `primaryProductId` with its
        // own id, so that field marks a variant only when it names another product; it and the
        // composite-id check are kept for older records written without a `type`.
        const isVariant =
          product.type === "VARIANT" ||
          (product.type !== "PRIMARY" &&
            ((Boolean(product.primaryProductId) && product.primaryProductId !== product.id) ||
              product.id.includes("::")));
        (isVariant ? variantIds : parentIds).add(product.id);
      }
    }

    pageToken = response.nextPageToken;
    if (pageToken && seenTokens.has(pageToken)) {
      throw new Error("ACS ListProducts returned a repeated page token");
    }
    if (pageToken) seenTokens.add(pageToken);
    await options.onProgress?.({ deleted: 0, found: variantIds.size + parentIds.size });
  } while (pageToken);

  const found = variantIds.size + parentIds.size;
  let deleted = 0;
  // Two distinct passes are required. Parallelizing a mixed parent/variant batch races the deletes
  // and intermittently lets a parent reach ACS before its children are gone.
  for (const ids of [variantIds, parentIds]) {
    for (const batch of chunk([...ids], DELETE_CONCURRENCY)) {
      if (options.until !== undefined && Date.now() >= options.until) return { deleted, found, complete: false };

      const removed = await Promise.allSettled(batch.map((id) => deleteProduct(id)));
      deleted += removed.filter((result) => result.status === "fulfilled" && result.value).length;

      const failure = removed.find((result) => result.status === "rejected");
      if (failure) return { deleted, found, complete: false, error: failure.reason };
      await options.onProgress?.({ deleted, found });
    }
  }

  return { deleted, found, complete: true };
}

/** Read-only existence + membership check, used by the sync paths to decide whether an
 *  already-indexed product needs downgrading (it exists) or was simply never in scope (it
 *  doesn't), and to recover its currently-recorded `source_category_ids` before merging in a
 *  fresh walk's own findings. */
export async function getAcsProductSourceCategoryIds(connectionId: string, externalId: string): Promise<string[]> {
  if (!isAcsConfigured()) return [];
  const product = await getProduct(buildAcsProductId(connectionId, externalId));
  return product?.attributes?.source_category_ids?.text ?? [];
}

/**
 * The ACS ids of every `VARIANT` child a product's own `map-product.ts` may have written for it —
 * found by `primary_external_id` rather than by reconstructing each variant's own external id
 * (which the caller here, a webhook delete or an out-of-scope downgrade, usually does not have).
 *
 * A `browseAll`-style scoped search rather than a full-catalog listing: bounded to this one
 * merchant and this one product, so a single-product downgrade never has to walk the shared
 * catalog the way `deleteAllAcsProductsForConnection` does for a whole-connection sweep. One page
 * of 100 is generous headroom past any real storefront's colour/size matrix.
 */
export async function getAcsVariantIds(connectionId: string, primaryExternalId: string): Promise<string[]> {
  if (!isAcsConfigured()) return [];
  const filter = `(attributes.primary_external_id: ANY("${escapeFilterLiteral(primaryExternalId)}"))`;
  const response = await searchProductsRaw(`${merchantFilterClause(connectionId)} AND ${filter}`, {
    visitorId: SYSTEM_VISITOR_ID,
    query: "",
    pageSize: 100,
  });
  return (response.results ?? []).map((item) => item.id);
}

/** Marks a product — and every `VARIANT` child `map-product.ts` may have written for it — out of
 *  stock only if the parent actually exists in ACS yet. `patchProduct` 404s on a product that was
 *  never imported, which is exactly the case a webhook's "recategorised out of scope before ever
 *  being indexed" path can hit. */
export async function markAcsProductOutOfStockIfExists(connectionId: string, externalId: string): Promise<boolean> {
  if (!isAcsConfigured()) return false;
  const id = buildAcsProductId(connectionId, externalId);
  const product = await getProduct(id);
  if (!product) return false;
  const variantIds = await getAcsVariantIds(connectionId, externalId);
  await Promise.all([markOutOfStock(id), ...variantIds.map((variantId) => markOutOfStock(variantId))]);
  return true;
}
