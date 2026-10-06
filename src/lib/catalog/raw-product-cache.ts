import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { createCatalogPager, type CatalogPager } from "./pager";
import { boundMetafieldKeys } from "./acs-mapping";
import type { RawCatalogProduct } from "./sync-types";
import { loadSnapshot, saveSnapshot } from "@/lib/cache/snapshot-store";

/**
 * The merchant's own products as last read from their store, by external id.
 *
 * Stage 2's pages and Stage 5's preview both need the full live product (variants, options, custom
 * fields), and reading it is the slow part of both: a catalog of a few thousand products is tens of
 * seconds of Shopify or WooCommerce round trips. Neither needs it to the second, so one read serves
 * both for `maxAgeMs`, a chart or mapping change re-resolves against what is already here instead of
 * re-reading the store, and a webhook for a product drops just that product.
 *
 * The fingerprint covers everything that changes what a read returns — platform, store, the bound
 * Shopify metafields, the store currency — so a changed Stage 1 binding never serves products read
 * without it.
 */
interface CachedProduct {
  raw: RawCatalogProduct | null;
  fetchedAt: number;
}

interface ConnectionProducts {
  fingerprint: string;
  products: Map<string, CachedProduct>;
  loaded: boolean;
  loading?: Promise<void>;
  saveTimer?: ReturnType<typeof setTimeout>;
  lastUsed: number;
}

interface StoredProducts {
  fingerprint: string;
  products: Array<[string, number, RawCatalogProduct | null]>;
}

const MAX_CONNECTIONS = 6;
const SAVE_DELAY_MS = 5_000;

function cache(): Map<string, ConnectionProducts> {
  const holder = globalThis as typeof globalThis & { __personaRawProducts?: Map<string, ConnectionProducts> };
  holder.__personaRawProducts ??= new Map();
  return holder.__personaRawProducts;
}

function fingerprintFor(connection: StoreConnectionRow): string {
  return JSON.stringify([
    connection.platform,
    connection.storeUrl,
    connection.storeCurrency,
    boundMetafieldKeys(connection.acsFieldMapping).sort(),
  ]);
}

const storagePath = (connectionId: string) => `raw-products/${connectionId}.json.gz`;

function evict(all: Map<string, ConnectionProducts>) {
  if (all.size <= MAX_CONNECTIONS) return;
  const victims = [...all.entries()]
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
    .slice(0, all.size - MAX_CONNECTIONS);
  for (const [id] of victims) all.delete(id);
}

async function slotFor(connection: StoreConnectionRow): Promise<ConnectionProducts> {
  const all = cache();
  const fingerprint = fingerprintFor(connection);
  let slot = all.get(connection.id);
  if (!slot || slot.fingerprint !== fingerprint) {
    slot = { fingerprint, products: new Map(), loaded: false, lastUsed: Date.now() };
    all.set(connection.id, slot);
    evict(all);
  }
  slot.lastUsed = Date.now();

  const current = slot;
  if (!current.loaded) {
    current.loading ??= (async () => {
      const stored = await loadSnapshot<StoredProducts>(storagePath(connection.id));
      if (stored?.fingerprint === fingerprint && Array.isArray(stored.products)) {
        for (const [id, fetchedAt, raw] of stored.products) {
          if (!current.products.has(id)) current.products.set(id, { raw, fetchedAt });
        }
      }
      current.loaded = true;
    })();
    await current.loading;
  }
  return current;
}

function scheduleSave(connectionId: string, slot: ConnectionProducts) {
  if (slot.saveTimer) clearTimeout(slot.saveTimer);
  slot.saveTimer = setTimeout(() => {
    slot.saveTimer = undefined;
    const stored: StoredProducts = {
      fingerprint: slot.fingerprint,
      products: [...slot.products].map(([id, entry]) => [id, entry.fetchedAt, entry.raw]),
    };
    void saveSnapshot(storagePath(connectionId), stored);
  }, SAVE_DELAY_MS);
}

/**
 * The requested products, read from the store only where the cache has nothing young enough. A
 * product the store no longer returns is remembered as gone for the same window, so a deleted id is
 * not re-requested on every page.
 */
export async function getRawProducts(
  connection: StoreConnectionRow,
  externalIds: readonly string[],
  options: { maxAgeMs: number; pager?: CatalogPager | null },
): Promise<Map<string, RawCatalogProduct>> {
  const slot = await slotFor(connection);
  const now = Date.now();
  const missing = [...new Set(externalIds)].filter((id) => {
    const cached = slot.products.get(id);
    return !cached || now - cached.fetchedAt > options.maxAgeMs;
  });

  if (missing.length > 0) {
    const pager = options.pager ?? await createCatalogPager(connection);
    if (pager) {
      const fetched = await pager.fetchByIds(missing);
      const fetchedAt = Date.now();
      const returned = new Set<string>();
      for (const raw of fetched) {
        returned.add(raw.externalId);
        slot.products.set(raw.externalId, { raw, fetchedAt });
      }
      for (const id of missing) {
        if (!returned.has(id)) slot.products.set(id, { raw: null, fetchedAt });
      }
      scheduleSave(connection.id, slot);
    }
  }

  const result = new Map<string, RawCatalogProduct>();
  for (const id of externalIds) {
    const raw = slot.products.get(id)?.raw;
    if (raw) result.set(id, raw);
  }
  return result;
}

/** Oldest read among these products, for saying how current a screen built from them is. */
export function oldestFetchedAt(connectionId: string, externalIds: readonly string[]): number | null {
  const slot = cache().get(connectionId);
  if (!slot) return null;
  let oldest: number | null = null;
  for (const id of externalIds) {
    const fetchedAt = slot.products.get(id)?.fetchedAt;
    if (fetchedAt !== undefined && (oldest === null || fetchedAt < oldest)) oldest = fetchedAt;
  }
  return oldest;
}

/** Drops products a webhook says have changed, or a whole store's when no ids are given. */
export function forgetRawProducts(connectionId: string, externalIds?: readonly string[]): void {
  const slot = cache().get(connectionId);
  if (!slot) return;
  if (!externalIds) {
    slot.products.clear();
  } else {
    for (const id of externalIds) slot.products.delete(id);
  }
  scheduleSave(connectionId, slot);
}
