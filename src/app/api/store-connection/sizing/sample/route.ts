import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { createCatalogPager } from "@/lib/catalog/pager";
import { walkPagedCatalog } from "@/lib/catalog/paged-walk";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";
import { resolveCategoryPaths } from "@/lib/catalog/index-product";
import {
  buildCategoryIndex,
  resolveParentCategory,
  resolveProductParent,
} from "@/lib/catalog/category-parents";
import { extractVariantAttributes } from "@/lib/catalog/acs/map-product";
import { listSizingCoverage, type BrandType } from "@/lib/db/sizing-coverage";
import { normalizeBrandKey, UNKNOWN_BRAND_KEY } from "@/lib/sizing/keys";
import { labelFor } from "@/lib/sizing/summary";
import { toRawFormat } from "@/lib/sizing/aggregate";
import { SAMPLE_PAGE_SIZES } from "@/modules/store/sizing/server-types";

const DEFAULT_PAGE_SIZE = 25;

/**
 * How many store pages one request may read while looking for matches.
 *
 * Unfiltered, a single page fills the response and this never comes into play. A selective filter is
 * the reason it exists: asking for "no brand" in a catalog that mostly has brands means walking past
 * a lot of non-matches, and without a ceiling one click could turn into a full catalog walk against
 * a merchant's live store. Hitting it returns what was found plus a cursor, so pressing Next
 * resumes rather than losing the search.
 */
const MAX_HOPS = 12;

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
  description: string | null;
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
 * What each filter chip counts, from coverage rather than from any page of products.
 *
 * `global`, `private` and `unclassified` all group by a real brand name, so their number is how many
 * distinct brands sit in that bucket — the count Tab 2's own lists are built from. `none` has no
 * brand to group by; its single sentinel row's SKU total is the only sense in which it has a count
 * at all, so that bucket reports products instead. The two kinds of number are not interchangeable —
 * a store note that "18 global brands" and "6 unbranded products" is the honest asymmetry, not a
 * formatting choice.
 */
function countByType(
  coverage: Awaited<ReturnType<typeof listSizingCoverage>>
): { chips: Record<BrandType, number>; skus: Record<BrandType, number> } {
  const brands: Record<BrandType, Set<string>> = { global: new Set(), private: new Set(), none: new Set(), unclassified: new Set() };
  const skus: Record<BrandType, number> = { global: 0, private: 0, none: 0, unclassified: 0 };

  for (const row of coverage) {
    brands[row.brandType].add(row.brandKey);
    skus[row.brandType] += row.skuCount;
  }

  const chips: Record<BrandType, number> = {
    global: brands.global.size,
    private: brands.private.size,
    unclassified: brands.unclassified.size,
    // No brand to group by, so its chip and its item total are the same number.
    none: skus.none,
  };

  return { chips, skus };
}

/**
 * One page of the merchant's catalog, resolved through exactly the pipeline the scan uses.
 *
 * Read from the store API rather than from `sizing_coverage`, because coverage deliberately keeps no
 * product rows — and because the point of this stage is to show what the pipeline *currently* sees,
 * so a merchant can catch a mis-mapped size column or a junk brand field here, where fixing it is a
 * store-admin edit, rather than after a research pass has been paid for against the wrong key.
 *
 * Paged rather than a fixed sample of the first N. The first page of a store's default ordering is
 * not a representative slice — on a 6,000-product catalog it tends to be whatever was added last,
 * which for this merchant meant 25 belts and caps and no clothing at all. A merchant checking
 * whether their size column mapped correctly has to be able to reach the products they care about.
 *
 * Brand classification is joined on from coverage when a scan has already run, so the same row reads
 * as "unclassified" before the scan and "global"/"private" after it.
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
        total: 0,
        totalExact: true,
        scanned: coverage.length > 0,
      });
    }

    const requestedType = params.get("brandType");
    const brandTypeFilter = BRAND_TYPES.find((type) => type === requestedType) ?? null;
    const search = (params.get("q") ?? "").trim().toLowerCase();
    const filtering = brandTypeFilter !== null || search.length > 0;

    const { chips: typeChipCounts, skus: typeSkuCounts } = countByType(coverage);

    // The denominator the footer reports "N of ???" against.
    //
    // Under a brand-type filter, coverage already has the exact answer — a scan counts every SKU of
    // that type — with no extra request against the merchant's store, so it replaces the unfiltered
    // catalog total rather than leaving "of 606" showing next to a filter that only matches 28. A
    // text search gets no such denominator: nothing indexes which of the catalog's products contain
    // a substring short of walking all of it, so that case keeps the previous "products searched"
    // framing, which is honest about being a lower bound rather than a count.
    const filteredTotal = brandTypeFilter ? { total: typeSkuCounts[brandTypeFilter], exact: true } : null;

    // Only on request otherwise. The total doesn't change as a merchant flips through pages, so
    // counting on every page turn would add a store request per click for an answer the client
    // already holds.
    const count = filteredTotal ?? (params.get("count") === "1" ? await pager.countProducts() : null);

    const categoryIndex = buildCategoryIndex(connection.categories);

    // One entry per brand: a brand's type is the same in every category it appears in.
    const brandTypes = new Map<string, BrandType>();
    for (const row of coverage) brandTypes.set(row.brandKey, row.brandType);

    const toRow = (raw: RawCatalogProduct): SizingSampleRow => {
      const variants = extractVariantAttributes(raw, connection.acsFieldOverrides);
      const storeCategoryPaths = resolveCategoryPaths(raw, connection);

      const brand = variants.brands[0] ?? raw.brand;
      const brandKey = normalizeBrandKey(brand);

      // Resolved exactly the way the scan resolves it, through the same function, off the merchant's
      // own category mapping and their Stage 2 corrections. The whole point of this preview is to
      // show what the pipeline currently sees, so a second way of deciding a product's parent here
      // would defeat it.
      const inheritedParent = resolveParentCategory(
        raw.sourceCategoryIds,
        connection.categoryParentMap,
        categoryIndex
      );
      const sizingCategory = resolveProductParent(
        { externalId: raw.externalId, categoryIds: raw.sourceCategoryIds },
        connection.categoryParentMap,
        connection.skuParentOverrides,
        categoryIndex
      );

      return {
        externalId: raw.externalId,
        sku: raw.sku,
        title: raw.title,
        description: raw.description,
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

    const matches = (row: SizingSampleRow): boolean => {
      if (brandTypeFilter && row.brandType !== brandTypeFilter) return false;
      if (!search) return true;
      return (
        row.title.toLowerCase().includes(search) ||
        (row.sku ?? "").toLowerCase().includes(search) ||
        (row.brand ?? "").toLowerCase().includes(search)
      );
    };

    const { rows, nextCursor } = await walkPagedCatalog({
      groups: pager.groups,
      fetchPage: (group, cursor) => pager.fetchPage([...group], cursor),
      cursor: params.get("cursor"),
      pageSize,
      maxHops: MAX_HOPS,
      map: toRow,
      match: filtering ? matches : undefined,
    });

    return Response.json({
      rows,
      nextCursor,
      pageSize,
      total: count?.total ?? null,
      totalExact: count?.exact ?? null,
      // What each filter chip counts, across the whole selection, which only exists once the scan
      // has written coverage. Deliberately not derived from the page: a count that changes as you
      // flip through pages is worse than no count at all.
      typeCounts: coverage.length > 0 ? typeChipCounts : null,
      filtering,
      scanned: coverage.length > 0,
    });
  } catch (err) {
    console.error("[store-connection sizing/sample GET]", err);
    return Response.json({ error: "Could not load a catalog sample" }, { status: 500 });
  }
}
