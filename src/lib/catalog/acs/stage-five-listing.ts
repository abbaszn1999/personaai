import { listProducts } from "./client";
import type { AcsAvailability, AcsProduct, AcsProductType } from "./types";
import { normalizeBrandKey } from "@/lib/sizing/keys";
import type { BrandType } from "@/lib/db/sizing-coverage";
import { createSwrCache } from "@/lib/cache/swr-cache";

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

export interface AcsStageFiveRow {
  id: string;
  type: AcsProductType;
  primaryProductId: string | null;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  availability: AcsAvailability | "UNKNOWN";
  brand: string | null;
  brandType: BrandType;
  categories: string[];
  sizes: string[];
  fitLeaf: string | null;
  fitGroup: string | null;
  fitAudience: string | null;
  fitChartVariant: string | null;
  fitSizeLabels: string[];
  fitRows: string[];
}

export interface AcsStageFiveListing {
  rows: AcsStageFiveRow[];
  total: number;
  counts: {
    primary: number;
    variant: number;
    inStock: number;
    outOfStock: number;
    otherAvailability: number;
  };
}

/** One Stage 5 row plus what its filters need, kept instead of the full ACS document. */
export interface StageFiveRecord {
  row: Omit<AcsStageFiveRow, "brandType">;
  brandKey: string;
  haystack: string;
}

export interface StageFiveFilters {
  query?: string;
  type?: "PRIMARY" | "VARIANT";
  availability?: "IN_STOCK" | "OUT_OF_STOCK";
  brandKeys?: readonly string[] | null;
}

function textAttribute(product: AcsProduct, key: string): string[] {
  return product.attributes?.[key]?.text?.filter((value) => value.trim().length > 0) ?? [];
}

export function belongsToConnection(product: AcsProduct, connectionId: string): boolean {
  return product.id.startsWith(`${connectionId}_`) ||
    textAttribute(product, "merchant_id").includes(connectionId);
}

function brandTypeOf(brand: string | null, brandTypes?: ReadonlyMap<string, BrandType>): BrandType {
  const trimmed = brand?.trim();
  if (!trimmed) return "none";
  return brandTypes?.get(normalizeBrandKey(trimmed)) ?? "unclassified";
}

export function toAcsStageFiveRow(
  product: AcsProduct,
  brandTypes?: ReadonlyMap<string, BrandType>,
): AcsStageFiveRow {
  return withBrandType(toStageFiveRecord(product), brandTypes);
}

export function toStageFiveRecord(product: AcsProduct): StageFiveRecord {
  const row: StageFiveRecord["row"] = {
    id: product.id,
    type: product.type ?? "PRIMARY",
    primaryProductId: product.primaryProductId ?? null,
    title: product.title,
    sku: textAttribute(product, "sku")[0] ?? null,
    imageUrl: product.images?.[0]?.uri ?? null,
    price: product.priceInfo?.price ?? null,
    currency: product.priceInfo?.currencyCode ?? null,
    availability: product.availability ?? "UNKNOWN",
    brand: product.brands?.[0] ?? null,
    categories: product.categories ?? [],
    sizes: product.sizes ?? [],
    fitLeaf: textAttribute(product, "fit_leaf")[0] ?? null,
    fitGroup: textAttribute(product, "fit_group")[0] ?? null,
    fitAudience: textAttribute(product, "fit_audience")[0] ?? null,
    fitChartVariant: textAttribute(product, "fit_chart_variant")[0] ?? null,
    fitSizeLabels: textAttribute(product, "fit_size_labels"),
    fitRows: textAttribute(product, "fit_rows"),
  };
  const haystack = [
    product.id,
    product.primaryProductId,
    product.title,
    product.brands?.join(" "),
    product.categories?.join(" "),
    product.sizes?.join(" "),
    row.sku,
    row.fitLeaf,
    row.fitChartVariant,
  ].filter(Boolean).join(" ").toLowerCase();
  return { row, brandKey: normalizeBrandKey(row.brand), haystack };
}

/** Brand type is joined at read time, so a Global/Private override shows without a rebuild. */
export function withBrandType(record: StageFiveRecord, brandTypes?: ReadonlyMap<string, BrandType>): AcsStageFiveRow {
  return { ...record.row, brandType: brandTypeOf(record.row.brand, brandTypes) };
}

export function filterStageFiveRecords(
  records: readonly StageFiveRecord[],
  filters: StageFiveFilters,
): StageFiveRecord[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  const brandKeys = filters.brandKeys ? new Set(filters.brandKeys) : null;
  return records.filter((record) => {
    if (filters.type && record.row.type !== filters.type) return false;
    if (filters.availability && record.row.availability !== filters.availability) return false;
    if (brandKeys && !brandKeys.has(record.brandKey)) return false;
    return !query || record.haystack.includes(query);
  });
}

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
  const products = await walkConnectionCatalog(connectionId);
  if (options.publishedAt !== undefined) {
    listings.set(connectionId, products.map(toStageFiveRecord), acsListingFingerprint(options.publishedAt));
  }
  return products;
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
  const result = await listings.get(connectionId, {
    fingerprint: acsListingFingerprint(options.publishedAt),
    maxAgeMs: LISTING_MAX_AGE_MS,
    build: async () => (await walkConnectionCatalog(connectionId, LISTING_READ_MASK)).map(toStageFiveRecord),
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
