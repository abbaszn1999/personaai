import { db } from "@/lib/supabase/server";
import { hasProductImage } from "@/lib/catalog/acs/map-product";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { loadSourceHashes } from "@/lib/db/catalog-source-hashes";
import { listSizingProductRecordIds } from "@/lib/db/sizing-product-records";
import { getActiveSizingRun, getLatestPublishedSizingRun } from "@/lib/db/sizing-runs";
import {
  getSyncProductStatus,
  listTrackedSyncProductIds,
  recordPendingSyncProducts,
  type SyncNewProductInput,
  type SyncProductSource,
} from "@/lib/db/sync-new-products";
import { toRawFormat } from "@/lib/sizing/aggregate";
import { normalizeBrandKey } from "@/lib/sizing/keys";
import { personaConfigFor, toScanRow } from "@/lib/sizing/scan";

/**
 * Whether a product new to the store is held for Sync rather than written to ACS on arrival.
 *
 * Only once the store has published from Setup: before that nothing of the store is in ACS and
 * Setup's own publish writes the catalog whole. And not while a Setup publish is writing, because
 * that publish is about to write everything it can see, and the products it walks past are recorded
 * by the next reconcile instead.
 */
export async function syncHoldActive(connectionId: string): Promise<boolean> {
  const [published, active] = await Promise.all([
    getLatestPublishedSizingRun(connectionId),
    getActiveSizingRun(connectionId),
  ]);
  if (!published) return false;
  return !(active?.kind === "setup" && active.stage === "publish");
}

function formatPrice(product: RawCatalogProduct): string | null {
  if (product.price === null) return null;
  if (!product.currency) return product.price.toFixed(2);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: product.currency }).format(product.price);
  } catch {
    return `${product.price.toFixed(2)} ${product.currency}`;
  }
}

/** The queue row for a product, read through the same extraction the Setup scan uses. */
export function syncInputFor(
  product: RawCatalogProduct,
  sourceCategoryIds: string[],
  connection: StoreConnectionRow,
  personaConfig = personaConfigFor(connection),
): SyncNewProductInput {
  const row = toScanRow(product, sourceCategoryIds, connection, personaConfig);
  return {
    externalId: product.externalId,
    sku: product.sku,
    title: product.title,
    imageUrl: product.imageUrl,
    price: formatPrice(product),
    brandLabel: row.brandField?.trim() || null,
    brandKey: normalizeBrandKey(row.brandField),
    sizingCategory: row.sizingGroup ?? "",
    leafKey: row.sizingCategoryId,
    rawSizeFormat: toRawFormat(row.sizes),
  };
}

/**
 * Products ACS already holds, or a sync already tracks.
 *
 * A product Setup published has a source hash, and every sized one is in the scan snapshot; the
 * union survives a hash being forgotten when a product goes out of stock. Null when any part
 * cannot be read: nothing is then treated as new, since calling the whole catalog new would queue
 * it for a sync.
 */
async function loadKnownProductIds(connectionId: string): Promise<Set<string> | null> {
  const [hashes, records, tracked] = await Promise.all([
    loadSourceHashes(connectionId),
    listSizingProductRecordIds(connectionId),
    listTrackedSyncProductIds(connectionId),
  ]);
  if (!hashes || !records || !tracked) return null;
  return new Set([...hashes.keys(), ...records, ...tracked]);
}

async function isKnownProduct(connectionId: string, externalId: string): Promise<boolean | null> {
  const [hash, record] = await Promise.all([
    db.from("catalog_source_hashes").select("external_id").eq("connection_id", connectionId).eq("external_id", externalId).maybeSingle(),
    db.from("sizing_product_records").select("external_id").eq("connection_id", connectionId).eq("external_id", externalId).maybeSingle(),
  ]);
  if (hash.error || record.error) {
    console.error("[sync detect isKnownProduct]", connectionId, externalId, hash.error ?? record.error);
    return null;
  }
  return hash.data !== null || record.data !== null;
}

export interface DetectedProducts {
  /** Products queued for the first time by this pass. */
  recorded: number;
  /** The products this pass found new. Ones already waiting are not here: callers add them from
   *  `listHeldSyncProductIds`, which also covers products a sync is currently working on. */
  heldIds: Set<string>;
}

/**
 * Queues the products in a walk that ACS has never held. Products without an image are never
 * published, so they are left out here exactly as the scan leaves them out of coverage.
 */
export async function detectNewProducts(
  connection: StoreConnectionRow,
  entries: ReadonlyArray<{ product: RawCatalogProduct; sourceCategoryIds: string[] }>,
  source: SyncProductSource,
): Promise<DetectedProducts | null> {
  const known = await loadKnownProductIds(connection.id);
  if (!known) return null;
  const personaConfig = personaConfigFor(connection);
  const fresh = entries.filter((entry) => !known.has(entry.product.externalId) && hasProductImage(entry.product));
  const recorded = await recordPendingSyncProducts(
    connection.id,
    fresh.map((entry) => syncInputFor(entry.product, entry.sourceCategoryIds, connection, personaConfig)),
    source,
  );
  return { recorded, heldIds: new Set(fresh.map((entry) => entry.product.externalId)) };
}

/**
 * The webhook's half: whether this one product waits for Sync. A product already queued gets its
 * row refreshed with the store's latest details; an unknown one is queued.
 */
export async function holdWebhookProduct(
  connection: StoreConnectionRow,
  product: RawCatalogProduct,
  sourceCategoryIds: string[],
): Promise<boolean> {
  const status = await getSyncProductStatus(connection.id, product.externalId);
  if (status === "syncing") return true;
  if (status === "pending" || status === "removed" || status === null) {
    if (status === null) {
      const known = await isKnownProduct(connection.id, product.externalId);
      if (known !== false) return false;
    }
    if (!hasProductImage(product)) return status === "pending";
    await recordPendingSyncProducts(
      connection.id,
      [syncInputFor(product, sourceCategoryIds, connection)],
      "webhook",
    );
    return true;
  }
  return false;
}
