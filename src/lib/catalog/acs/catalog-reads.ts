import type { CatalogCandidate, CatalogFacets, CategoryPath } from "@/lib/retrieval/types";
import { deleteProduct, getProduct, listProducts, markOutOfStock, searchProducts, searchProductsRaw } from "./client";
import { isAcsConfigured } from "./config";
import { buildAcsProductId, escapeFilterLiteral, merchantFilterClause } from "./isolation";
import { toCandidate, toCandidateFromProduct } from "./search-adapter";
import type { AcsProduct, AcsSearchResultItem } from "./types";

/**
 * ACS-backed replacements for the three `catalog_products` reads that weren't in scope for the
 * search-adapter phase — `getCatalogFacets`, `getProductGroup` and `getCatalogProductsByExternalIds`
 * — needed before the table can actually be dropped. These are direct reads/lookups, never
 * relevance-ranked, so none of them go through the relaxation ladder the search modes use.
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
            const product = await getProduct(buildAcsProductId(connectionId, externalId));
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
 * Actually deletes every one of this connection's products from ACS — the one caller allowed to,
 * per `markOutOfStock`'s doc comment: a merchant disconnecting their store entirely leaves no
 * ongoing catalog behind, so there is nothing left for that user-event history to serve. Unlike
 * `pruneOutOfScopeAcsProducts` this needs no category-scope clause — every product tagged with
 * this connection's `merchant_id` is in scope for removal, not just the ones outside a new
 * selection — so it is built on `merchantFilterClause` alone rather than going through
 * `searchProducts`'s mandatory (and here, unwanted) inclusion-scope clause.
 */
export async function deleteAllAcsProductsForConnection(connectionId: string): Promise<number> {
  if (!isAcsConfigured()) return 0;

  // ProductService.ListProducts reads the catalog's source of truth. SearchService was previously
  // used here, but its eventual consistency made a successful disconnect capable of missing
  // recently imported products. The deterministic id prefix is the primary ownership check;
  // merchant_id also covers any legacy products that did not use that id convention.
  const ids = new Set<string>();
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;

  do {
    const response = await listProducts(pageToken);
    for (const product of response.products ?? []) {
      const merchantIds = product.attributes?.merchant_id?.text ?? [];
      if (product.id.startsWith(`${connectionId}_`) || merchantIds.includes(connectionId)) {
        ids.add(product.id);
      }
    }

    pageToken = response.nextPageToken;
    if (pageToken && seenTokens.has(pageToken)) {
      throw new Error("ACS ListProducts returned a repeated page token");
    }
    if (pageToken) seenTokens.add(pageToken);
  } while (pageToken);

  let deleted = 0;
  for (const batch of chunk([...ids], DELETE_CONCURRENCY)) {
    const removed = await Promise.allSettled(batch.map((id) => deleteProduct(id)));
    deleted += removed.filter((result) => result.status === "fulfilled" && result.value).length;

    const failure = removed.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  }

  return deleted;
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
