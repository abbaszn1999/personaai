import { listProducts } from "./client";
import type { AcsAvailability, AcsProduct, AcsProductType } from "./types";
import { normalizeBrandKey } from "@/lib/sizing/keys";
import type { BrandType } from "@/lib/db/sizing-coverage";

// ACS pagination is cursor-based, while this table supports arbitrary page numbers and filters.
// Keep the completed tenant snapshot long enough for a merchant to page through it without
// re-walking ~19k remote records on every click. A successful publish explicitly clears this cache.
const CACHE_TTL_MS = 5 * 60_000;
const MAX_CATALOG_PAGES = 1_000;

interface CachedCatalog {
  expiresAt: number;
  products: AcsProduct[];
}

const cache = new Map<string, CachedCatalog>();

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

function textAttribute(product: AcsProduct, key: string): string[] {
  return product.attributes?.[key]?.text?.filter((value) => value.trim().length > 0) ?? [];
}

export function belongsToConnection(product: AcsProduct, connectionId: string): boolean {
  return product.id.startsWith(`${connectionId}_`) ||
    textAttribute(product, "merchant_id").includes(connectionId);
}

function productBrandType(product: AcsProduct, brandTypes?: ReadonlyMap<string, BrandType>): BrandType {
  const brand = product.brands?.[0]?.trim();
  if (!brand) return "none";
  return brandTypes?.get(normalizeBrandKey(brand)) ?? "unclassified";
}

export function toAcsStageFiveRow(
  product: AcsProduct,
  brandTypes?: ReadonlyMap<string, BrandType>,
): AcsStageFiveRow {
  return {
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
    brandType: productBrandType(product, brandTypes),
    categories: product.categories ?? [],
    sizes: product.sizes ?? [],
    fitLeaf: textAttribute(product, "fit_leaf")[0] ?? null,
    fitGroup: textAttribute(product, "fit_group")[0] ?? null,
    fitAudience: textAttribute(product, "fit_audience")[0] ?? null,
    fitChartVariant: textAttribute(product, "fit_chart_variant")[0] ?? null,
    fitSizeLabels: textAttribute(product, "fit_size_labels"),
    fitRows: textAttribute(product, "fit_rows"),
  };
}

/** Every ACS document this connection owns. `fresh` skips the listing cache, for callers that
 *  must see the catalog as it is now rather than as Stage 5 last paged it. */
export async function readConnectionCatalog(
  connectionId: string,
  options: { fresh?: boolean } = {},
): Promise<AcsProduct[]> {
  const cached = cache.get(connectionId);
  if (!options.fresh && cached && cached.expiresAt > Date.now()) return cached.products;

  const products: AcsProduct[] = [];
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_CATALOG_PAGES; page++) {
    const response = await listProducts(pageToken);
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

  products.sort((left, right) => {
    const leftParent = left.primaryProductId ?? left.id;
    const rightParent = right.primaryProductId ?? right.id;
    const byParent = leftParent.localeCompare(rightParent);
    if (byParent !== 0) return byParent;
    if ((left.type ?? "PRIMARY") !== (right.type ?? "PRIMARY")) {
      return (left.type ?? "PRIMARY") === "PRIMARY" ? -1 : 1;
    }
    return left.id.localeCompare(right.id);
  });

  cache.set(connectionId, { expiresAt: Date.now() + CACHE_TTL_MS, products });
  return products;
}

export async function listAcsStageFiveProducts(
  connectionId: string,
  options: {
    offset: number;
    limit: number;
    query?: string;
    type?: "PRIMARY" | "VARIANT";
    availability?: "IN_STOCK" | "OUT_OF_STOCK";
    brandType?: Extract<BrandType, "global" | "private" | "none">;
    brandTypes?: ReadonlyMap<string, BrandType>;
  },
): Promise<AcsStageFiveListing> {
  const all = await readConnectionCatalog(connectionId);
  const query = options.query?.trim().toLowerCase() ?? "";
  const filtered = all.filter((product) => {
    const type = product.type ?? "PRIMARY";
    if (options.type && type !== options.type) return false;
    if (options.availability && product.availability !== options.availability) return false;
    if (options.brandType && productBrandType(product, options.brandTypes) !== options.brandType) return false;
    if (!query) return true;
    const haystack = [
      product.id,
      product.primaryProductId,
      product.title,
      product.brands?.join(" "),
      product.categories?.join(" "),
      product.sizes?.join(" "),
      textAttribute(product, "sku").join(" "),
      textAttribute(product, "fit_leaf").join(" "),
      textAttribute(product, "fit_chart_variant").join(" "),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });

  const counts = {
    primary: all.filter((product) => (product.type ?? "PRIMARY") === "PRIMARY").length,
    variant: all.filter((product) => product.type === "VARIANT").length,
    inStock: all.filter((product) => product.availability === "IN_STOCK").length,
    outOfStock: all.filter((product) => product.availability === "OUT_OF_STOCK").length,
    otherAvailability: all.filter(
      (product) => product.availability !== "IN_STOCK" && product.availability !== "OUT_OF_STOCK",
    ).length,
  };

  return {
    rows: filtered
      .slice(options.offset, options.offset + options.limit)
      .map((product) => toAcsStageFiveRow(product, options.brandTypes)),
    total: filtered.length,
    counts,
  };
}

export function clearAcsStageFiveCache(connectionId?: string): void {
  if (connectionId) cache.delete(connectionId);
  else cache.clear();
}
