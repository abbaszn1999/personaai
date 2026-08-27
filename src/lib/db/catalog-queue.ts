import { db } from "@/lib/supabase/server";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";

/** One unit of indexing work. The full product payload rides along rather than just an id:
 *  re-fetching each product individually at drain time would turn a 20,000-SKU backfill into
 *  20,000 extra store API calls. The payload can go slightly stale between enqueue and drain,
 *  which reconciliation corrects. */
export interface CatalogQueueMessage {
  connectionId: string;
  product: RawCatalogProduct;
  /** Which of the merchant's categories this product was found under. Recorded on the row so a
   *  later deselection can tell whether any still-selected category covers it. */
  sourceCategoryIds: string[];
}

export interface QueuedMessage {
  msgId: number;
  /** How many times this message has been delivered. Used to give up on a product that fails
   *  repeatedly, instead of letting it retry forever and hold the run open. */
  readCount: number;
  body: CatalogQueueMessage;
}

export async function enqueueCatalogMessages(messages: CatalogQueueMessage[]): Promise<number> {
  if (messages.length === 0) return 0;

  const { data, error } = await db.rpc("catalog_queue_send_batch", {
    payloads: messages.map((message) => message as unknown as Record<string, unknown>),
  });

  if (error) {
    console.error("[db/catalog-queue enqueueCatalogMessages]", error);
    return 0;
  }

  return Array.isArray(data) ? data.length : 0;
}

/**
 * Claims a batch for processing. Messages become invisible for `visibilitySeconds` rather
 * than being removed, so a crashed or timed-out drain releases its batch back onto the queue
 * automatically instead of losing it.
 */
export async function readCatalogMessages(quantity: number, visibilitySeconds: number): Promise<QueuedMessage[]> {
  const { data, error } = await db.rpc("catalog_queue_read", {
    qty: quantity,
    visibility_seconds: visibilitySeconds,
  });

  if (error) {
    console.error("[db/catalog-queue readCatalogMessages]", error);
    return [];
  }

  return ((data as Array<Record<string, unknown>>) ?? []).map((row) => ({
    msgId: Number(row.msg_id),
    readCount: Number(row.read_ct ?? 0),
    body: row.message as unknown as CatalogQueueMessage,
  }));
}

export async function ackCatalogMessages(msgIds: number[]): Promise<void> {
  if (msgIds.length === 0) return;
  const { error } = await db.rpc("catalog_queue_delete", { msg_ids: msgIds });
  if (error) console.error("[db/catalog-queue ackCatalogMessages]", error);
}

/** Retires a message that has failed too many times. Archived rather than deleted so the
 *  failure is still inspectable. */
export async function archiveCatalogMessages(msgIds: number[]): Promise<void> {
  if (msgIds.length === 0) return;
  const { error } = await db.rpc("catalog_queue_archive", { msg_ids: msgIds });
  if (error) console.error("[db/catalog-queue archiveCatalogMessages]", error);
}

/**
 * Drops every queued message belonging to a connection. Called when a store is disconnected,
 * since its pending indexing work can no longer land anywhere and would otherwise be enriched
 * and embedded at full cost before failing.
 */
export async function purgeConnectionFromQueue(connectionId: string): Promise<number> {
  const { data, error } = await db.rpc("catalog_queue_purge_connection", {
    p_connection_id: connectionId,
  });

  if (error) {
    console.error("[db/catalog-queue purgeConnectionFromQueue]", error);
    return 0;
  }

  return Number(data ?? 0);
}

export async function getCatalogQueueDepth(): Promise<number> {
  const { data, error } = await db.rpc("catalog_queue_depth");

  if (error) {
    console.error("[db/catalog-queue getCatalogQueueDepth]", error);
    return 0;
  }

  return Number(data ?? 0);
}
