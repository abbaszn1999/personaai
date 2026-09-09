import { enqueueCatalogMessages, type CatalogQueueMessage } from "@/lib/db/catalog-queue";
import { updateCatalogSyncState, type StoreConnectionRow } from "@/lib/db/store-connections";
import type { RawCatalogProduct } from "./sync-types";
import { createCatalogPager, membership, type CatalogPager } from "./pager";
import { sleep } from "./timeout";

/** Enqueue in chunks rather than one message per round trip — 20,000 individual inserts is
 *  the difference between a sync that finishes in a minute and one that takes an hour. */
const ENQUEUE_CHUNK = 200;

/** Ceiling on pages walked per category group, so a misconfigured cursor can't loop forever
 *  against a merchant's store. At 250/page this covers a 250,000-product group. */
const MAX_PAGES = 1000;

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
  const pager = await createCatalogPager(connection, options);

  // A null pager means nothing is in scope. Refusing to fall back to a full walk is the point: an
  // empty selection means the merchant has not chosen yet, and treating that as "index everything"
  // is exactly the runaway cost this is built to prevent.
  if (!pager) {
    return { enqueued: 0, pages: 0, duplicates: 0 };
  }

  return walkCategoryGroups(connection.id, pager);
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
async function walkCategoryGroups(connectionId: string, pager: CatalogPager): Promise<EnqueueResult> {
  const sourcesByProduct = new Map<string, { product: RawCatalogProduct; sourceCategoryIds: Set<string> }>();
  let pages = 0;
  let duplicates = 0;

  for (const group of pager.groups) {
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await pager.fetchPage(group, cursor);
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
