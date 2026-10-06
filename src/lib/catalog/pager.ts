import { decodeCredentials } from "@/lib/utils/crypto";
import {
  countShopifyCollectionProducts,
  getShopifyAccessToken,
  listShopifyCatalogPage,
  listShopifyProductsByIds,
  normalizeShopifyDomain,
} from "@/lib/shopify/client";
import {
  countWooCatalogProducts,
  fetchWooStoreCurrency,
  listWooCatalogPage,
  listWooProductsByIds,
  normalizeWordPressUrl,
} from "@/lib/woocommerce/client";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { boundMetafieldKeys } from "./acs-mapping";
import { expandCategorySelection } from "./category-scope";
import type { RawCatalogProduct } from "./sync-types";

/**
 * How to page one merchant's catalog, with the platform differences already resolved.
 *
 * Extracted so the indexing walk (`enqueue-sync.ts`) and the sizing scan (`lib/sizing/scan.ts`)
 * share one definition of "how do I read this store's products". The two walks accumulate
 * completely different things — one buffers products to merge category membership before
 * enqueueing, the other folds each product into aggregates and keeps none — so only the paging is
 * shared. Duplicating *that* is what would actually bite: Shopify's opaque cursor and Woo's page
 * numbers are each one-off enough that a second copy would drift, and a drifted cursor doesn't
 * error, it silently walks a fraction of the catalog and reports success.
 */
export interface CatalogPager {
  /** Category id sets to walk in turn. Shopify can only descend from one collection at a time, so
   *  its groups are singletons; WooCommerce filters on a union, so its groups are chunks. */
  groups: string[][];
  fetchPage(
    categoryIds: string[],
    cursor: string | null
  ): Promise<{ products: RawCatalogProduct[]; nextCursor: string | null }>;
  /** How many products the whole selection holds, for showing "25 of 600" without walking it.
   *
   *  `exact` is false when the total had to be summed across groups, because a product in two of
   *  them is counted twice and there is no cross-group deduplication short of the walk itself. The
   *  flag exists so the UI can say "about" instead of quietly overstating a merchant's catalog. */
  countProducts(): Promise<{ total: number; exact: boolean }>;
  /** Reads exactly these products, no category walk, however many are asked for.
   *
   *  Used to refresh volatile details for ids already selected by the Stage 2 snapshot. Ignores the
   *  category selection because those ids came from it. Split into requests no larger than the
   *  platform answers in one go, so a long list is never silently cut to the first page. Order is
   *  the platform's, not the argument's, so a caller that needs its own order has to restore it. */
  fetchByIds(externalIds: readonly string[]): Promise<RawCatalogProduct[]>;
}

export interface PagerOptions {
  updatedAfter?: string;
  /** Restrict to these of the merchant's categories rather than the whole selection. Ids are
   *  expanded to their descendants either way. */
  onlyCategoryIds?: readonly string[];
  /** Rows per request. Left unset by the bulk walks, which want each platform's own maximum; set by
   *  the browsable preview, where a page is what a merchant reads rather than what a worker buffers.
   *  Both clients clamp it to their API's ceiling. */
  pageSize?: number;
  /**
   * Read whatever custom fields each product carries instead of only the bound ones, so Stage 1 can
   * offer them as columns.
   *
   * Set by the discovery sample alone. On Shopify it turns the metafields selection from a named list
   * into an open connection, which is affordable for one small page and ruinous for a full walk.
   */
  discoverCustomFields?: boolean;
}

/** How many category ids to put in one WooCommerce `category` filter. Bounded only to keep the
 *  query string a sane length — a deep tree can expand to hundreds of terms. */
const WOO_CATEGORY_FILTER_CHUNK = 40;

/** Ids per by-id request. WooCommerce's `include` returns at most `per_page` (100) rows, so a longer
 *  list loses everything past the first hundred; Shopify's `nodes(ids:)` takes 250, but each node
 *  carries up to 250 variants and a smaller request keeps one throttled retry cheap. */
const FETCH_BY_IDS_CHUNK = 100;
/** By-id requests in flight at once. Woo is often a small shared host, and every variable product in
 *  a chunk already fans out to its own `/variations` reads. */
const FETCH_BY_IDS_CONCURRENCY = { shopify: 3, woo: 2 } as const;
const FETCH_BY_IDS_ATTEMPTS = 5;

const WOO_CURRENCY_MEMO_MS = 60 * 60_000;

async function rememberedWooCurrency(
  connectionId: string,
  read: () => Promise<string | null>
): Promise<string | null> {
  const holder = globalThis as typeof globalThis & {
    __personaWooCurrency?: Map<string, { currency: string | null; at: number }>;
  };
  holder.__personaWooCurrency ??= new Map();
  const memo = holder.__personaWooCurrency.get(connectionId);
  if (memo && Date.now() - memo.at <= WOO_CURRENCY_MEMO_MS) return memo.currency;
  const currency = await read();
  holder.__personaWooCurrency.set(connectionId, { currency, at: Date.now() });
  return currency;
}

function throttleDelayMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const { throttled, retryAfterMs } = error as { throttled?: unknown; retryAfterMs?: unknown };
  if (throttled !== true) return null;
  return typeof retryAfterMs === "number" && retryAfterMs > 0 ? Math.min(retryAfterMs, 20_000) : 2_000;
}

async function withThrottleRetry<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      const delay = throttleDelayMs(error);
      if (delay === null || attempt >= FETCH_BY_IDS_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function fetchByIdsInChunks(
  externalIds: readonly string[],
  concurrency: number,
  read: (ids: string[]) => Promise<RawCatalogProduct[]>
): Promise<RawCatalogProduct[]> {
  const ids = [...new Set(externalIds)];
  const chunks = chunk(ids, FETCH_BY_IDS_CHUNK);
  const results: RawCatalogProduct[][] = new Array(chunks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, chunks.length) }, async () => {
    while (next < chunks.length) {
      const index = next++;
      results[index] = await withThrottleRetry(() => read(chunks[index]));
    }
  });
  await Promise.all(workers);
  return results.flat();
}

/**
 * Builds the pager for a connection, or returns null when there is nothing in scope to walk.
 *
 * Null rather than a pager over the whole store is the point. An empty selection means the merchant
 * has not chosen yet, and treating that as "read everything" is exactly the runaway cost this
 * pipeline is built to prevent.
 */
export async function createCatalogPager(
  connection: StoreConnectionRow,
  options: PagerOptions = {}
): Promise<CatalogPager | null> {
  const requested = options.onlyCategoryIds ?? connection.selectedCategoryIds;
  const categoryIds = expandCategorySelection(requested, connection.categories);
  if (categoryIds.length === 0) return null;

  const credentials = connection.apiKeyEncrypted ? decodeCredentials(connection.apiKeyEncrypted) : {};

  if (connection.platform === "shopify") {
    const domain = normalizeShopifyDomain(connection.storeUrl);
    const accessToken = await getShopifyAccessToken(
      domain,
      credentials.clientId ?? "",
      credentials.clientSecret ?? "",
      connection.id
    );

    const collections = categoryIds.map((id) => [id]);
    // Derived from the connection rather than taken as an option: every caller wants exactly the
    // metafields the merchant bound, and one of them forgetting to ask would drop a mapped column
    // from the index without any error to notice.
    const metafieldKeys = boundMetafieldKeys(connection.acsFieldMapping);

    return {
      // One collection at a time: Shopify has no union filter for collection membership.
      groups: collections,
      countProducts: async () => {
        // Counted live only for a single collection, where the answer is exact. Beyond that the sum
        // would double-count shared products anyway, so the stored per-collection counts are used
        // instead of spending one request per collection to reach the same approximation.
        if (collections.length === 1) {
          return { total: await countShopifyCollectionProducts(domain, accessToken, collections[0][0]), exact: true };
        }

        const selected = new Set(categoryIds);
        const total = connection.categories
          .filter((category) => selected.has(category.id))
          .reduce((sum, category) => sum + (category.productCount ?? 0), 0);

        return { total, exact: false };
      },
      fetchPage: (group, cursor) =>
        listShopifyCatalogPage(domain, accessToken, {
          categoryIds: group,
          cursor: cursor ?? undefined,
          updatedAfter: options.updatedAfter,
          pageSize: options.pageSize,
          metafieldKeys,
          discoverCustomFields: options.discoverCustomFields,
        }).then((page) => ({ products: page.products, nextCursor: page.nextCursor })),
      fetchByIds: (externalIds) =>
        fetchByIdsInChunks(externalIds, FETCH_BY_IDS_CONCURRENCY.shopify, (ids) =>
          listShopifyProductsByIds(domain, accessToken, ids, {
            metafieldKeys,
            discoverCustomFields: options.discoverCustomFields,
          })
        ),
    };
  }

  if (connection.platform === "wordpress" || connection.platform === "woocommerce") {
    const siteUrl = normalizeWordPressUrl(connection.storeUrl);
    const username = credentials.wpUsername ?? "";
    const appPassword = credentials.wpAppPassword ?? "";

    const chunks = chunk(categoryIds, WOO_CATEGORY_FILTER_CHUNK);
    // A connection made before the currency was saved is read here rather than priced in USD, and
    // remembered so every page of a walk does not ask again.
    const currency = connection.storeCurrency ?? (await rememberedWooCurrency(connection.id, () =>
      fetchWooStoreCurrency(siteUrl, username, appPassword)
    ));

    return {
      // Filtered as a union, so a parent and all its descendants are one walk returning each
      // product once — rather than one walk per term returning products filed on both a parent and
      // a child twice over. Chunked only to keep the query string within a sane length.
      groups: chunks,
      countProducts: async () => {
        // One request per chunk, each an exact deduplicated total for its own union. A selection
        // small enough to fit in a single chunk — which is the usual case — is therefore exact
        // outright; only a store with hundreds of categories pays the approximation.
        const totals = await Promise.all(
          chunks.map((group) =>
            countWooCatalogProducts(siteUrl, username, appPassword, {
              categoryIds: group,
              updatedAfter: options.updatedAfter,
            })
          )
        );

        return { total: totals.reduce((sum, value) => sum + value, 0), exact: chunks.length === 1 };
      },
      // Woo pages by number rather than cursor, so the cursor carries the next page index.
      fetchPage: async (group, cursor) => {
        const page = cursor ? Number(cursor) : 1;
        const result = await listWooCatalogPage(siteUrl, username, appPassword, {
          categoryIds: group,
          page,
          updatedAfter: options.updatedAfter,
          pageSize: options.pageSize,
          currency,
        });
        return { products: result.products, nextCursor: result.hasMore ? String(page + 1) : null };
      },
      fetchByIds: (externalIds) =>
        fetchByIdsInChunks(externalIds, FETCH_BY_IDS_CONCURRENCY.woo, (ids) =>
          listWooProductsByIds(siteUrl, username, appPassword, ids, undefined, currency)
        ),
    };
  }

  throw new Error(`Catalog indexing isn't available for the "${connection.platform}" platform yet.`);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The category ids to record for a product returned while walking `group`.
 *
 * A single-id group means the product provably came from that one category, so the id is recorded
 * even if the product doesn't list it. That covers Shopify, which reports only a bounded number of
 * a product's collections: a product in more collections than that can come back from a collection
 * it appears not to belong to, and recording its membership verbatim would index the product and
 * then immediately treat it as out of scope, making it invisible.
 *
 * A multi-id group can't attribute the match to any particular id, so only what the product itself
 * reports is used. Claiming the whole group would assert memberships the product doesn't have, and
 * those would keep it alive through a deselection that should have removed it.
 */
export function membership(product: RawCatalogProduct, group: readonly string[]): string[] {
  const own = product.sourceCategoryIds ?? [];
  return group.length === 1 ? [...own, group[0]] : own;
}
