import { decodeCredentials } from "@/lib/utils/crypto";
import {
  countShopifyCollectionProducts,
  getShopifyAccessToken,
  listShopifyCatalogPage,
  normalizeShopifyDomain,
} from "@/lib/shopify/client";
import { countWooCatalogProducts, listWooCatalogPage, normalizeWordPressUrl } from "@/lib/woocommerce/client";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
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
}

/** How many category ids to put in one WooCommerce `category` filter. Bounded only to keep the
 *  query string a sane length — a deep tree can expand to hundreds of terms. */
const WOO_CATEGORY_FILTER_CHUNK = 40;

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
        }).then((page) => ({ products: page.products, nextCursor: page.nextCursor })),
    };
  }

  if (connection.platform === "wordpress" || connection.platform === "woocommerce") {
    const siteUrl = normalizeWordPressUrl(connection.storeUrl);
    const username = credentials.wpUsername ?? "";
    const appPassword = credentials.wpAppPassword ?? "";

    const chunks = chunk(categoryIds, WOO_CATEGORY_FILTER_CHUNK);

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
        });
        return { products: result.products, nextCursor: result.hasMore ? String(page + 1) : null };
      },
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
