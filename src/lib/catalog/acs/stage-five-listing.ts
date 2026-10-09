import { listProducts } from "./client";
import type { AcsProduct } from "./types";
import type { BrandType } from "@/lib/db/sizing-coverage";
import { createSwrCache } from "@/lib/cache/swr-cache";
import {
  belongsToConnection,
  brandTypeOf,
  filterStageFiveRecords,
  toStageFiveRecord,
  withBrandType,
  type AcsStageFiveListing,
  type StageFiveFilters,
  type StageFiveRecord,
} from "./stage-five-record";

const MAX_CATALOG_PAGES = 1_000;

/**
 * How long the published mirror is shown without re-reading ACS. The shared catalog has to be paged
 * end to end (every tenant's records) to find one store's, which is ~15 seconds at today's size, so
 * reads are served from the last walk and refreshed behind it. A publish changes the fingerprint and
 * a webhook write marks it stale, so neither waits for this.
 */
const LISTING_MAX_AGE_MS = 3 * 60_000;

/** Only what the Stage 5 table and its filters read. `attributes` stays whole: it carries the
 *  tenant id and every `fit_*` field the sizing preview opens. */
const LISTING_READ_MASK = [
  "id",
  "type",
  "primaryProductId",
  "title",
  "images",
  "priceInfo",
  "availability",
  "brands",
  "categories",
  "sizes",
  "attributes",
].join(",");

export {
  belongsToConnection,
  filterStageFiveRecords,
  toAcsStageFiveRow,
  toStageFiveRecord,
  withBrandType,
  type AcsStageFiveListing,
  type AcsStageFiveRow,
  type StageFiveFilters,
  type StageFiveRecord,
} from "./stage-five-record";

function sortCatalog(products: AcsProduct[]): AcsProduct[] {
  return products.sort((left, right) => {
    const leftParent = left.primaryProductId ?? left.id;
    const rightParent = right.primaryProductId ?? right.id;
    const byParent = leftParent.localeCompare(rightParent);
    if (byParent !== 0) return byParent;
    if ((left.type ?? "PRIMARY") !== (right.type ?? "PRIMARY")) {
      return (left.type ?? "PRIMARY") === "PRIMARY" ? -1 : 1;
    }
    return left.id.localeCompare(right.id);
  });
}

async function walkConnectionCatalog(connectionId: string, readMask?: string): Promise<AcsProduct[]> {
  const products: AcsProduct[] = [];
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_CATALOG_PAGES; page++) {
    const response = await listProducts(pageToken, readMask ? { readMask } : undefined);
    for (const product of response.products ?? []) {
      if (belongsToConnection(product, connectionId)) products.push(product);
    }

    if (!response.nextPageToken) break;
    if (seenTokens.has(response.nextPageToken)) {
      throw new Error("ACS returned a repeated catalog page token.");
    }
    seenTokens.add(response.nextPageToken);
    pageToken = response.nextPageToken;
  }

  return sortCatalog(products);
}

const listings = createSwrCache<StageFiveRecord[]>({
  name: "acs-listing",
  maxEntries: 6,
  persist: true,
  // Right after a publish the previous mirror is still what ACS held moments ago; showing it, marked
  // as updating, beats a blank table for the length of a full catalog walk.
  staleOnInputChange: true,
});

/** What the published mirror is a function of: the publish it reflects. */
export function acsListingFingerprint(publishedAt: string | null): string {
  return `published:${publishedAt ?? "never"}`;
}

/**
 * Every ACS document this connection owns, complete, read now. For callers that act on the catalog
 * (path config rebuild); the walk also refreshes the Stage 5 mirror, since it has just read
 * everything that mirror shows.
 */
export async function readConnectionCatalog(
  connectionId: string,
  options: { publishedAt?: string | null } = {},
): Promise<AcsProduct[]> {
  const startedAt = Date.now();
  const products = await walkConnectionCatalog(connectionId);
  if (options.publishedAt !== undefined) {
    listings.set(connectionId, products.map(toStageFiveRecord), acsListingFingerprint(options.publishedAt));
  }
  void import("./mirror").then((mirror) => mirror.reconcileMirror(connectionId, products, startedAt));
  return products;
}

/** Reconciliations running in this process, one per store at most. */
const reconciling = new Map<string, Promise<void>>();

/**
 * Walks this store's ACS documents and makes the mirror match them. Skipped while a publish is
 * writing — every one of its writes reaches the mirror anyway, and a walk overlapping them could
 * only reconcile against a catalog that is still changing.
 */
function reconcileInBackground(connectionId: string): void {
  if (reconciling.has(connectionId)) return;
  const job = (async () => {
    const { getLatestSizingRun } = await import("@/lib/db/sizing-runs");
    const run = await getLatestSizingRun(connectionId);
    if (run?.stage === "publish" && (run.status === "pending" || run.status === "running")) return;
    const startedAt = Date.now();
    const products = await walkConnectionCatalog(connectionId, LISTING_READ_MASK);
    await (await import("./mirror")).reconcileMirror(connectionId, products, startedAt);
  })()
    .catch((error) => console.error("[acs/stage-five-listing reconcile]", connectionId, error))
    .finally(() => reconciling.delete(connectionId));
  reconciling.set(connectionId, job);
}

export async function listAcsStageFiveProducts(
  connectionId: string,
  options: StageFiveFilters & {
    offset: number;
    limit: number;
    publishedAt: string | null;
    brandType?: Extract<BrandType, "global" | "private" | "none">;
    brandTypes?: ReadonlyMap<string, BrandType>;
  },
): Promise<AcsStageFiveListing & { builtAt: number; refreshing: boolean }> {
  // The mirror pages this store in the database. It answers only once a walk has reconciled it, so
  // until then (and whenever it is not trusted) this falls through to the walk below, which is also
  // what reconciles it.
  const mirror = await import("./mirror");
  const mirrored = await mirror.readMirrorPage(connectionId, options);
  if (mirrored) {
    if (Date.now() - mirrored.completeAt > mirror.MIRROR_RECONCILE_MAX_AGE_MS) reconcileInBackground(connectionId);
    return { rows: mirrored.rows, total: mirrored.total, counts: mirrored.counts, builtAt: Date.now(), refreshing: false };
  }

  const result = await listings.get(connectionId, {
    fingerprint: acsListingFingerprint(options.publishedAt),
    maxAgeMs: LISTING_MAX_AGE_MS,
    build: async () => {
      const startedAt = Date.now();
      const products = await walkConnectionCatalog(connectionId, LISTING_READ_MASK);
      void mirror.reconcileMirror(connectionId, products, startedAt);
      return products.map(toStageFiveRecord);
    },
  });
  const all = result.value;
  const filtered = filterStageFiveRecords(all, options).filter(
    (record) => !options.brandType || brandTypeOf(record.row.brand, options.brandTypes) === options.brandType,
  );

  const counts = {
    primary: all.filter((record) => record.row.type === "PRIMARY").length,
    variant: all.filter((record) => record.row.type === "VARIANT").length,
    inStock: all.filter((record) => record.row.availability === "IN_STOCK").length,
    outOfStock: all.filter((record) => record.row.availability === "OUT_OF_STOCK").length,
    otherAvailability: all.filter(
      (record) => record.row.availability !== "IN_STOCK" && record.row.availability !== "OUT_OF_STOCK",
    ).length,
  };

  return {
    rows: filtered
      .slice(options.offset, options.offset + options.limit)
      .map((record) => withBrandType(record, options.brandTypes)),
    total: filtered.length,
    counts,
    builtAt: result.builtAt,
    refreshing: result.refreshing,
  };
}

/** The mirror no longer matches ACS (a publish settled, a webhook rewrote a product). The next read
 *  still answers instantly from it, and refreshes. */
export function clearAcsStageFiveCache(connectionId: string): void {
  listings.invalidate(connectionId);
}
