import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { createCatalogPager } from "@/lib/catalog/pager";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";
import { resolveCategoryPaths } from "@/lib/catalog/index-product";
import { buildPersonaMappingConfig, resolvePersonaPaths } from "@/lib/catalog/persona-mapping";
import { extractVariantAttributes } from "@/lib/catalog/acs/map-product";
import { listSizingCoverage, type BrandType } from "@/lib/db/sizing-coverage";
import {
  listSizingProductRecordsPage,
  type SizingProductRecordRow,
} from "@/lib/db/sizing-product-records";
import { normalizeBrandKey, UNKNOWN_BRAND_KEY } from "@/lib/sizing/keys";
import { isSizingGroup, SIZING_GROUP_KEYS } from "@/lib/sizing/measurements";
import { labelFor } from "@/lib/sizing/summary";
import { toRawFormat } from "@/lib/sizing/aggregate";
import { SAMPLE_PAGE_SIZES } from "@/modules/store/sizing/server-types";

const DEFAULT_PAGE_SIZE = 25;

/**
 * Rows requested per store round-trip — always the platform's own ceiling, never the merchant's
 * chosen display page size.
 *
 * These are two different numbers that used to be conflated: "how many rows show on screen" (25 by
 * default) has nothing to do with "how many products are worth reading from the store in one
 * request" (WooCommerce and Shopify both cap far higher). Fetching only 25 products per hop while
 * hunting for a filter that matches 1% of the catalog meant needing four times as many round-trips
 * to a merchant's live store as necessary — which is what made switching to a sparse filter like
 * "Private brands" or "Not yet classified" feel like it had hung.
 */
const STORE_FETCH_PAGE_SIZE = 100;

const BRAND_TYPES: readonly BrandType[] = ["global", "private", "none", "unclassified"];

export interface SizingSampleRow {
  externalId: string;
  sku: string | null;
  title: string;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  inStock: boolean;
  brand: string | null;
  brandType: BrandType;
  /** The parent this product is sized on, or null when it isn't sized at all. Already includes any
   *  Stage 2 correction — this is what the scan will actually use. */
  sizingCategory: string | null;
  sizingCategoryLabel: string | null;
  /** What the category mapping alone would have given it. Differs from `sizingCategory` only where
   *  the merchant corrected this product, which is how the row can say so rather than presenting a
   *  hand-made choice as though the path produced it. */
  inheritedCategory: string | null;
  sizes: string[];
  /** The deduplicated size string this product contributes to its coverage row. */
  rawFormat: string | null;
  storeCategoryPath: string[];
}

/**
 * Everything the two filter rows count, from coverage rather than from any page of products.
 *
 * Two different units, on purpose, because each chip's number has to mean what its own label says.
 * "Global brands" and "Private brands" name brands, so they count distinct brands. "Null / no brand"
 * names stock with no brand on it — there is nothing there to count as a brand — so it counts items,
 * as does "All items" and every parent chip. Reading down the row, each badge answers the noun beside
 * it. Making them uniformly items instead produced "Global brands 3,146" on a store with 86 brands,
 * which is a label and a number contradicting each other.
 *
 * Item counts are still needed for every bucket, as the denominator the footer counts a filtered page
 * against: clicking a chip filters items whatever its badge counts.
 *
 * Coverage is one row per brand per sizing category, and a product contributes to exactly one of
 * those pairs, so every item sum here is free of double counting.
 */
function countCoverage(coverage: Awaited<ReturnType<typeof listSizingCoverage>>) {
  const brands: Record<BrandType, Set<string>> = {
    global: new Set(),
    private: new Set(),
    none: new Set(),
    unclassified: new Set(),
  };
  const items: Record<BrandType, number> = { global: 0, private: 0, none: 0, unclassified: 0 };
  // Seeded with all five so a parent nothing maps to comes back as an explicit zero. Left absent it
  // is indistinguishable from "not counted yet", and the chip stays clickable — which pages the whole
  // catalog to confirm the nothing the chip could have said outright.
  const byParent = new Map<string, number>(SIZING_GROUP_KEYS.map((group) => [group, 0]));

  for (const row of coverage) {
    brands[row.brandType].add(row.brandKey);
    items[row.brandType] += row.skuCount;
    byParent.set(row.sizingCategory, (byParent.get(row.sizingCategory) ?? 0) + row.skuCount);
  }

  const chips: Record<BrandType, number> = {
    global: brands.global.size,
    private: brands.private.size,
    unclassified: brands.unclassified.size,
    // The one bucket with no brand to count, so its chip and its item total are the same number.
    none: items.none,
  };

  return { chips, items, byParent };
}

/**
 * One exact page of the merchant's completed Stage 2 scan.
 *
 * Membership, filters and order come from the deduplicated scan snapshot, which means a requested
 * page of 100 contains 100 matching products when that many remain. Volatile display fields such as
 * price, image, stock and sizes are then refreshed by id from the store API.
 *
 * Brand classification is joined from coverage; Stage 2 stays blocked until that classification is
 * complete, so the merchant never sees a half-classified table.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    const params = new URL(request.url).searchParams;
    const requestedSize = Number(params.get("pageSize"));
    const pageSize = (SAMPLE_PAGE_SIZES as readonly number[]).includes(requestedSize)
      ? requestedSize
      : DEFAULT_PAGE_SIZE;

    const [pager, coverage] = await Promise.all([
      createCatalogPager(connection, { pageSize: STORE_FETCH_PAGE_SIZE }),
      listSizingCoverage(connection.id),
    ]);

    // Null means nothing is in scope — the merchant hasn't chosen categories yet. An empty page is
    // the honest answer; the pager deliberately refuses to read the whole store instead.
    if (!pager) {
      return Response.json({
        rows: [],
        nextCursor: null,
        pageSize,
        selectionTotal: 0,
        selectionTotalExact: true,
        filteredTotal: null,
        scanned: coverage.length > 0,
      });
    }

    const requestedType = params.get("brandType");
    const brandTypeFilter = BRAND_TYPES.find((type) => type === requestedType) ?? null;
    const requestedParent = params.get("parent");
    const parentFilter = requestedParent && isSizingGroup(requestedParent) ? requestedParent : null;
    const search = (params.get("q") ?? "").trim().toLowerCase();
    const filtering = brandTypeFilter !== null || parentFilter !== null || search.length > 0;

    const { chips: typeChipCounts, items: typeItemCounts, byParent } = countCoverage(coverage);
    const classificationComplete =
      coverage.length > 0 && coverage.every((row) => row.brandType !== "unclassified");

    // "All items" means products in one of the five sizing families, not every product reachable
    // through the selected category roots. Main-category-only products are deliberately outside
    // Stage 2 and coverage is the exact deduplicated count of what remains. Before coverage exists,
    // leave the count unknown rather than showing the store's broader category total.
    const selectionTotal =
      params.get("count") === "1" && coverage.length > 0
        ? Object.values(typeItemCounts).reduce((sum, count) => sum + count, 0)
        : null;

    const personaConfig = buildPersonaMappingConfig(
      connection.personaTaxonomyScope,
      connection.personaCategoryMap,
      connection.categories,
    );

    // One entry per brand: a brand's type is the same in every category it appears in.
    const brandTypes = new Map<string, BrandType>();
    for (const row of coverage) brandTypes.set(row.brandKey, row.brandType);

    const toRow = (raw: RawCatalogProduct, indexed?: SizingProductRecordRow): SizingSampleRow => {
      const variants = extractVariantAttributes(raw, connection.acsFieldMapping);
      const storeCategoryPaths = resolveCategoryPaths(raw, connection);
      const primaryPersonaPath = resolvePersonaPaths(raw.sourceCategoryIds, personaConfig)[0] ?? null;

      const brand = variants.brands[0] ?? raw.brand;
      const brandKey = normalizeBrandKey(brand);
      const override = connection.skuParentOverrides[raw.externalId];

      // Resolved exactly the way the scan resolves it, through the same function, off the merchant's
      // own category mapping and their Stage 2 corrections. The whole point of this preview is to
      // show what the pipeline currently sees, so a second way of deciding a product's parent here
      // would defeat it.
      const inheritedParent = primaryPersonaPath?.sizingGroup ?? null;
      const sizingCategory = indexed?.sizingCategory ??
        (isSizingGroup(override) ? override : primaryPersonaPath?.sizingGroup ?? null);

      return {
        externalId: raw.externalId,
        sku: raw.sku,
        title: raw.title,
        imageUrl: raw.imageUrl,
        price: raw.price,
        currency: raw.currency,
        inStock: raw.inStock,
        brand,
        // `none` rather than `unclassified` for genuinely unbranded rows even before a scan: there is
        // no name to classify, so it is a fact about the row, not a pending decision.
        brandType: brandKey === UNKNOWN_BRAND_KEY ? "none" : (brandTypes.get(brandKey) ?? "unclassified"),
        sizingCategory,
        sizingCategoryLabel: sizingCategory ? labelFor(sizingCategory) : null,
        inheritedCategory: inheritedParent,
        sizes: [...variants.sizes],
        rawFormat: toRawFormat(variants.sizes),
        storeCategoryPath: storeCategoryPaths[0] ?? [],
      };
    };

    const parsedOffset = Number(params.get("cursor"));
    const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
    const brandKeys = brandTypeFilter
      ? [...new Set(coverage.filter((row) => row.brandType === brandTypeFilter).map((row) => row.brandKey))]
      : null;
    const indexedPage = await listSizingProductRecordsPage(connection.id, {
      limit: pageSize,
      offset,
      brandKeys,
      sizingCategory: parentFilter,
      search,
    });
    const rawProducts = await pager.fetchByIds(indexedPage.records.map((record) => record.externalId));
    const rawById = new Map(rawProducts.map((raw) => [raw.externalId, raw]));
    const rows = indexedPage.records.flatMap((record) => {
      const raw = rawById.get(record.externalId);
      return raw ? [toRow(raw, record)] : [];
    });
    const consumed = offset + indexedPage.records.length;
    const nextCursor = consumed < indexedPage.total ? String(consumed) : null;

    return Response.json({
      rows,
      nextCursor,
      pageSize,
      selectionTotal,
      selectionTotalExact: selectionTotal === null ? null : true,
      filteredTotal: filtering ? indexedPage.total : null,
      // What each filter chip counts, across the whole selection, which only exists once the scan
      // has written coverage. Deliberately not derived from the page: a count that changes as you
      // flip through pages is worse than no count at all.
      typeCounts: classificationComplete ? typeChipCounts : null,
      typeItemCounts: classificationComplete ? typeItemCounts : null,
      parentCounts: coverage.length > 0 ? Object.fromEntries(byParent) : null,
      filtering,
      scanned: classificationComplete,
    });
  } catch (err) {
    console.error("[store-connection sizing/sample GET]", err);
    return Response.json({ error: "Could not load a catalog sample" }, { status: 500 });
  }
}
