import { decodeCredentials } from "@/lib/utils/crypto";
import { getShopifyAccessToken, listShopifyCatalogPage, normalizeShopifyDomain } from "@/lib/shopify/client";
import { listWooCatalogPage, normalizeWordPressUrl } from "@/lib/woocommerce/client";
import { enqueueCatalogMessages, type CatalogQueueMessage } from "@/lib/db/catalog-queue";
import { updateCatalogSyncState, type StoreConnectionRow } from "@/lib/db/store-connections";
import type { RawCatalogProduct } from "./sync-types";
import { expandCategorySelection } from "./category-scope";
import { sleep } from "./timeout";

/** Enqueue in chunks rather than one message per round trip — 20,000 individual inserts is
 *  the difference between a sync that finishes in a minute and one that takes an hour. */
const ENQUEUE_CHUNK = 200;

/** Ceiling on pages walked per category group, so a misconfigured cursor can't loop forever
 *  against a merchant's store. At 250/page this covers a 250,000-product group. */
const MAX_PAGES = 1000;

/** How many category ids to put in one WooCommerce `category` filter. Bounded only to keep the
 *  query string a sane length — a deep tree can expand to hundreds of terms. */
const WOO_CATEGORY_FILTER_CHUNK = 40;

/** Courtesy pause between pages. Neither platform's limits are hit at this rate, and a
 *  background job has no reason to compete with live shopper traffic for the same budget. */
const PAGE_DELAY_MS = 250;

export interface EnqueueResult {
  enqueued: number;
  pages: number;
  /** Products seen in more than one selected category. Enqueued once; counted here because it is
   *  the difference between the merchant's category totals and the real indexing cost. */
  duplicates: number;
}

export interface EnqueueOptions {
  updatedAfter?: string;
  /** Restrict to these of the merchant's categories rather than the whole selection. Used when a
   *  merchant adds a category to an already-indexed catalog, so the pass costs only the addition
   *  instead of re-walking everything. Ids are expanded to their descendants either way. */
  onlyCategoryIds?: readonly string[];
}

/**
 * Walks the selected slice of a merchant's catalog and puts one message per product on the
 * enrichment queue.
 *
 * Scoped to the merchant's chosen categories rather than the whole store. Enrichment and
 * embedding are billed per product, so on a large catalog where only a few categories are in
 * scope, a full walk charges for the entire store to index a fraction of it.
 *
 * Enqueue and process stay separate steps: enrichment is slow, paid, and fails independently, so
 * doing it inline here would mean one Gemini blip costs the whole walk rather than one message.
 */
export async function enqueueCatalogSync(
  connection: StoreConnectionRow,
  options: EnqueueOptions = {}
): Promise<EnqueueResult> {
  const credentials = connection.apiKeyEncrypted ? decodeCredentials(connection.apiKeyEncrypted) : {};

  const requested = options.onlyCategoryIds ?? connection.selectedCategoryIds;
  const categoryIds = expandCategorySelection(requested, connection.categories);

  // Refusing to fall back to a full walk is the point. An empty selection means the merchant has
  // not chosen yet, and treating that as "index everything" is exactly the runaway cost this is
  // built to prevent.
  if (categoryIds.length === 0) {
    return { enqueued: 0, pages: 0, duplicates: 0 };
  }

  if (connection.platform === "shopify") {
    const domain = normalizeShopifyDomain(connection.storeUrl);
    const accessToken = await getShopifyAccessToken(
      domain,
      credentials.clientId ?? "",
      credentials.clientSecret ?? "",
      connection.id
    );

    // One collection at a time: Shopify has no union filter for collection membership.
    const groups = categoryIds.map((id) => [id]);

    return walkCategoryGroups(connection.id, groups, (group, cursor) =>
      listShopifyCatalogPage(domain, accessToken, {
        categoryIds: group,
        cursor: cursor ?? undefined,
        updatedAfter: options.updatedAfter,
      }).then((page) => ({ products: page.products, nextCursor: page.nextCursor }))
    );
  }

  if (connection.platform === "wordpress" || connection.platform === "woocommerce") {
    const siteUrl = normalizeWordPressUrl(connection.storeUrl);
    const username = credentials.wpUsername ?? "";
    const appPassword = credentials.wpAppPassword ?? "";

    // Filtered as a union, so a parent and all its descendants are one walk returning each product
    // once — rather than one walk per term returning products filed on both a parent and a child
    // twice over. Chunked only to keep the query string within a sane length.
    const groups = chunk(categoryIds, WOO_CATEGORY_FILTER_CHUNK);

    // Woo pages by number rather than cursor, so the cursor carries the next page index.
    return walkCategoryGroups(connection.id, groups, async (group, cursor) => {
      const page = cursor ? Number(cursor) : 1;
      const result = await listWooCatalogPage(siteUrl, username, appPassword, {
        categoryIds: group,
        page,
        updatedAfter: options.updatedAfter,
      });
      return { products: result.products, nextCursor: result.hasMore ? String(page + 1) : null };
    });
  }

  throw new Error(`Catalog indexing isn't available for the "${connection.platform}" platform yet.`);
}

type FetchPage = (
  categoryIds: string[],
  cursor: string | null
) => Promise<{ products: RawCatalogProduct[]; nextCursor: string | null }>;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Pages through each category in turn, enqueueing every product once.
 *
 * The dedupe is what keeps this honest. Categories overlap — a dress can sit in "Dresses",
 * "Summer" and "Sale" — and each appearance would otherwise be enqueued separately and enriched
 * separately, at full price, for one product. Every category a product was found in is recorded
 * on its single message, because that set is what decides later whether deselecting one category
 * should remove it.
 */
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
function membership(product: RawCatalogProduct, group: readonly string[]): string[] {
  const own = product.sourceCategoryIds ?? [];
  return group.length === 1 ? [...own, group[0]] : own;
}

async function walkCategoryGroups(
  connectionId: string,
  groups: readonly string[][],
  fetchPage: FetchPage
): Promise<EnqueueResult> {
  const sourcesByProduct = new Map<string, { product: RawCatalogProduct; sourceCategoryIds: Set<string> }>();
  let pages = 0;
  let duplicates = 0;

  for (const group of groups) {
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await fetchPage(group, cursor);
      pages += 1;

      for (const product of result.products) {
        const existing = sourcesByProduct.get(product.externalId);
        if (existing) {
          for (const id of membership(product, group)) existing.sourceCategoryIds.add(id);
          duplicates += 1;
          continue;
        }
        sourcesByProduct.set(product.externalId, {
          product,
          sourceCategoryIds: new Set(membership(product, group)),
        });
      }

      if (!result.nextCursor) break;
      cursor = result.nextCursor;
      await sleep(PAGE_DELAY_MS);
    }
  }

  const messages: CatalogQueueMessage[] = [...sourcesByProduct.values()].map((entry) => ({
    connectionId,
    product: entry.product,
    sourceCategoryIds: [...entry.sourceCategoryIds],
  }));

  let enqueued = 0;
  for (let i = 0; i < messages.length; i += ENQUEUE_CHUNK) {
    enqueued += await enqueueCatalogMessages(messages.slice(i, i + ENQUEUE_CHUNK));
  }

  return { enqueued, pages, duplicates };
}

/**
 * Runs the scoped catalog walk for one connection and puts the result on the queue.
 *
 * The status flip to `indexing` happens before the walk, not after. Retrieval reads that flag to
 * decide whether to fall back to live store search, and claiming it up front is also what stops a
 * second scheduled run from starting the same walk while this one is mid-flight.
 */
export async function startCatalogBackfill(
  connection: StoreConnectionRow,
  options: EnqueueOptions = {}
): Promise<EnqueueResult> {
  await updateCatalogSyncState(connection.id, { status: "indexing", progress: 0, total: 0 });

  try {
    const result = await enqueueCatalogSync(connection, options);
    await updateCatalogSyncState(connection.id, { total: result.enqueued });

    // Cleared only after the walk succeeded. Clearing up front would lose the list if the walk
    // died partway, leaving categories the merchant selected silently never indexed.
    if (connection.catalogPendingCategoryIds.length > 0) {
      await updateCatalogSyncState(connection.id, { pendingCategoryIds: [] });
    }

    return result;
  } catch (err) {
    console.error("[catalog startCatalogBackfill]", connection.id, err);
    await updateCatalogSyncState(connection.id, { status: "error" });
    throw err;
  }
}
