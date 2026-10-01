import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { listSizingProductRecordsPage } from "@/lib/db/sizing-product-records";
import { createCatalogPager } from "@/lib/catalog/pager";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";
import { resolveCategoryPaths, resolveGarmentCategory } from "@/lib/catalog/index-product";
import { sizingForRawProduct } from "@/lib/catalog/sizing-for-product";
import { loadSizingResolutionContext } from "@/lib/sizing/product-chart";
import { normalizeBrandKey } from "@/lib/sizing/keys";
import { rawCatalogProductToAcsProducts } from "./map-product";
import { toAcsStageFiveRow, type AcsStageFiveListing } from "./stage-five-listing";
import type { BrandType } from "@/lib/db/sizing-coverage";
import type { AcsProduct } from "./types";

export interface AcsStageFivePreview extends AcsStageFiveListing {
  /** Number of PRIMARY records in this final ACS-record page. */
  pageProductCount: number;
}

export interface GeneratedSizingSummary {
  total: number;
  variantCount: number;
  matched: number;
  chartKeys: string[];
  canonicalBrandKeys: string[];
  brandMappingCurrent: boolean;
}

const FETCH_BY_IDS_LIMIT = 250;
const SUMMARY_PAGE_SIZE = 250;
const GENERATED_CACHE_TTL_MS = 5 * 60_000;
interface GeneratedCatalogSnapshot {
  products: AcsProduct[];
  summary: GeneratedSizingSummary;
}
const generatedCache = new Map<string, {
  expiresAt: number;
  value: Promise<GeneratedCatalogSnapshot>;
}>();

async function fetchPreviewProducts(
  pager: NonNullable<Awaited<ReturnType<typeof createCatalogPager>>>,
  externalIds: string[],
): Promise<RawCatalogProduct[]> {
  const fetched: RawCatalogProduct[] = [];
  for (let index = 0; index < externalIds.length; index += FETCH_BY_IDS_LIMIT) {
    fetched.push(...await pager.fetchByIds(externalIds.slice(index, index + FETCH_BY_IDS_LIMIT)));
  }

  // Store APIs do not guarantee that an ids query returns records in input order. Keep pagination
  // stable so changing 25 → 500 does not reshuffle the same source products.
  const byId = new Map(fetched.map((product) => [product.externalId, product]));
  return externalIds.flatMap((externalId) => {
    const product = byId.get(externalId);
    return product ? [product] : [];
  });
}

async function generateCatalogSnapshot(
  connection: StoreConnectionRow,
): Promise<GeneratedCatalogSnapshot> {
  const cached = generatedCache.get(connection.id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = (async () => {
    const [pager, sizingContext] = await Promise.all([
      createCatalogPager(connection),
      loadSizingResolutionContext(connection),
    ]);
    if (!pager) {
      return {
        products: [],
        summary: {
          total: 0,
          variantCount: 0,
          matched: 0,
          chartKeys: [],
          canonicalBrandKeys: [],
          brandMappingCurrent: sizingContext.brandMappingCurrent,
        },
      };
    }

    const products: AcsProduct[] = [];
    const chartKeys = new Set<string>();
    const canonicalBrandKeys = new Set<string>();
    let matched = 0;
    let variantCount = 0;
    let offset = 0;
    let total = 0;

    do {
      const page = await listSizingProductRecordsPage(connection.id, {
        offset,
        limit: SUMMARY_PAGE_SIZE,
      });
      total = page.total;
      if (page.records.length === 0) break;
      const rawProducts = await fetchPreviewProducts(
        pager,
        page.records.map((record) => record.externalId),
      );
      for (const raw of rawProducts) {
        const categoryPaths = resolveCategoryPaths(raw, connection);
        if (categoryPaths.length === 0) continue;
        const sizing = sizingForRawProduct(raw, connection, sizingContext);
        const { garmentCategory, garmentSubcategory } = resolveGarmentCategory(raw);
        const generated = rawCatalogProductToAcsProducts({
          raw,
          connectionId: connection.id,
          categoryPaths,
          garmentCategory,
          garmentSubcategory,
          fieldMapping: connection.acsFieldMapping,
          sizing,
        });
        products.push(...generated);
        variantCount += generated.filter((product) => product.type === "VARIANT").length;
        if (sizing) {
          matched += 1;
          chartKeys.add(sizing.chartKey);
          const canonicalBrandKey = sizing.chartKey.split("|", 1)[0];
          if (canonicalBrandKey) canonicalBrandKeys.add(canonicalBrandKey);
        }
      }
      offset += page.records.length;
    } while (offset < total);

    return {
      products,
      summary: {
        total,
        variantCount,
        matched,
        chartKeys: [...chartKeys],
        canonicalBrandKeys: [...canonicalBrandKeys],
        brandMappingCurrent: sizingContext.brandMappingCurrent,
      },
    };
  })();

  generatedCache.set(connection.id, {
    expiresAt: Date.now() + GENERATED_CACHE_TTL_MS,
    value,
  });
  try {
    return await value;
  } catch (error) {
    generatedCache.delete(connection.id);
    throw error;
  }
}

export async function summarizeGeneratedSizing(
  connection: StoreConnectionRow,
): Promise<GeneratedSizingSummary> {
  return (await generateCatalogSnapshot(connection)).summary;
}

export async function listGeneratedAcsStageFiveProducts(
  connection: StoreConnectionRow,
  options: {
    offset: number;
    limit: number;
    query?: string;
    type?: "PRIMARY" | "VARIANT";
    availability?: "IN_STOCK" | "OUT_OF_STOCK";
    brandKeys?: string[] | null;
    brandTypes?: ReadonlyMap<string, BrandType>;
  },
): Promise<AcsStageFivePreview> {
  const { products } = await generateCatalogSnapshot(connection);
  const query = options.query?.trim().toLowerCase() ?? "";
  const brandKeys = options.brandKeys ? new Set(options.brandKeys) : null;
  const filtered = products.filter((product) => {
    const type = product.type ?? "PRIMARY";
    if (options.type && type !== options.type) return false;
    if (options.availability && product.availability !== options.availability) return false;
    if (brandKeys) {
      const brandKey = normalizeBrandKey(product.brands?.[0] ?? null);
      if (!brandKeys.has(brandKey)) return false;
    }
    if (!query) return true;
    const attributes = product.attributes ?? {};
    const haystack = [
      product.id,
      product.primaryProductId,
      product.title,
      product.brands?.join(" "),
      product.categories?.join(" "),
      product.sizes?.join(" "),
      attributes.sku?.text?.join(" "),
      attributes.fit_leaf?.text?.join(" "),
      attributes.fit_chart_variant?.text?.join(" "),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });
  const page = filtered.slice(options.offset, options.offset + options.limit);
  const counts = {
    primary: page.filter((product) => (product.type ?? "PRIMARY") === "PRIMARY").length,
    variant: page.filter((product) => product.type === "VARIANT").length,
    inStock: page.filter((product) => product.availability === "IN_STOCK").length,
    outOfStock: page.filter((product) => product.availability === "OUT_OF_STOCK").length,
    otherAvailability: page.filter(
      (product) => product.availability !== "IN_STOCK" && product.availability !== "OUT_OF_STOCK",
    ).length,
  };

  return {
    rows: page.map((product) => toAcsStageFiveRow(product, options.brandTypes)),
    total: filtered.length,
    pageProductCount: counts.primary,
    counts,
  };
}

export function clearGeneratedStageFiveCache(connectionId?: string): void {
  if (connectionId) generatedCache.delete(connectionId);
  else generatedCache.clear();
}
