import { createCatalogPager, membership } from "@/lib/catalog/pager";
import { resolveCategoryPaths } from "@/lib/catalog/index-product";
import { buildCategoryIndex, resolveProductParent } from "@/lib/catalog/category-parents";
import { extractVariantAttributes } from "@/lib/catalog/acs/map-product";
import { sleep } from "@/lib/catalog/timeout";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { replaceSizingCoverage } from "@/lib/db/sizing-coverage";
import { replaceSizingNullRecords } from "@/lib/db/sizing-null-records";
import { updateSizingRun, type SizingRunRow } from "@/lib/db/sizing-runs";
import { CoverageAggregator, type AggregateStats } from "./aggregate";
import { identifyBrands } from "./identify";

/**
 * Pass 1 of the pipeline: read the merchant's catalog once and write down what it contains.
 *
 * This is the only stage that touches every product, and it is deliberately the cheapest — no model
 * call, no per-product row written anywhere. Everything paid for downstream reads the aggregates
 * this produces, which is what keeps a 20,000-SKU store costing about what a 500-SKU store does.
 *
 * It walks the store API rather than reading an existing mirror because there isn't one: the
 * `catalog_products` table was dropped in the ACS cutover, and this scan runs *before* the index, so
 * ACS has nothing to read either. The walk is free (it is the merchant's own store) and paced by the
 * same courtesy delay the indexing walk uses.
 */

/** Ceiling on pages per category group, so a misconfigured cursor can't loop forever against a
 *  merchant's store. Matches the indexing walk. */
const MAX_PAGES = 1000;

/** Courtesy pause between pages, so a background scan never competes with live shopper traffic for
 *  a merchant's own rate limit. */
const PAGE_DELAY_MS = 250;

/** How often the run's product counter is flushed. Every page would be a write per ~250 products
 *  purely so a progress bar moves; this keeps the poll responsive without making the scan's cost a
 *  function of its own progress reporting. */
const PROGRESS_FLUSH_PRODUCTS = 500;

export interface ScanResult {
  stats: AggregateStats;
  /** Coverage rows written — the number of (brand x sizing category) pairs this store carries. */
  rows: number;
  pages: number;
}

/**
 * What the walk keeps per product, and nothing more.
 *
 * Deliberately not the raw product: the whole catalog is held in memory at once so it can go to the
 * identification agent as one dataset, and retaining full store payloads — image lists, variant
 * trees, HTML descriptions — would make that cost scale with how verbose a merchant's CMS is. These
 * are the only fields either identification or aggregation reads.
 */
interface ScanRow {
  externalId: string;
  sku: string | null;
  title: string;
  description: string | null;
  categoryPath: string | null;
  brandField: string | null;
  /** The store's own category/collection ids for this product, which is what the merchant's parent
   *  mapping is keyed on. */
  sourceCategoryIds: string[];
  sizes: string[];
  genders: string[];
  ageGroups: string[];
  storeCategoryPaths: string[][];
  imageUrl: string | null;
}

/**
 * Runs the scan for one connection and persists its coverage.
 *
 * Progress is written to the run row as it goes, so the merchant-facing pipeline polls real numbers
 * instead of animating a timer. Coverage is written once at the end rather than incrementally: a
 * partial scan's aggregates are wrong in a way that is invisible downstream — a brand looks like it
 * carries 40 SKUs when it carries 4,000 — so a failed walk must leave the previous scan's rows
 * untouched rather than half-replace them.
 */
export async function runSizingScan(connection: StoreConnectionRow, run: SizingRunRow): Promise<ScanResult> {
  const pager = await createCatalogPager(connection);
  if (!pager) {
    throw new Error("No categories are selected for indexing yet, so there is nothing to scan.");
  }

  // ─── 1. Read the catalog ────────────────────────────────────────────────────
  // Paging here is the store's constraint, not ours: WooCommerce's REST API refuses more than 100
  // products per request, and Shopify pages by cursor, so no platform can hand over a whole catalog
  // in one response. The pages are stitched back into a single dataset before anything is asked
  // about it, so how the store chose to chunk its own API never reaches the model.
  const scanned: ScanRow[] = [];
  let pages = 0;
  let flushedAt = 0;

  for (const group of pager.groups) {
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await pager.fetchPage(group, cursor);
      pages += 1;

      for (const raw of result.products) {
        const sourceCategoryIds = membership(raw, group);
        // Routed through the mapper's own extraction so sizes and audience are read exactly as the
        // index will read them. Deriving them here from `variantOptions` directly is how a store
        // gets a chart researched against sizes that never reach ACS.
        const variants = extractVariantAttributes(raw, connection.acsFieldOverrides);
        const storeCategoryPaths = resolveCategoryPaths({ ...raw, sourceCategoryIds }, connection);

        scanned.push({
          externalId: raw.externalId,
          sku: raw.sku,
          title: raw.title,
          description: raw.description,
          categoryPath: storeCategoryPaths[0]?.join(" > ") ?? null,
          // A group the merchant reassigned to `brand` in Stage 1 wins over the platform's own
          // field, which is the whole point of the override — some stores keep the real brand in an
          // attribute and leave the vendor field as their own shop name.
          brandField: variants.brands[0] ?? raw.brand,
          sourceCategoryIds: [...sourceCategoryIds],
          sizes: [...variants.sizes],
          genders: [...variants.genders],
          ageGroups: [...variants.ageGroups],
          storeCategoryPaths,
          imageUrl: raw.imageUrl,
        });
      }

      if (scanned.length - flushedAt >= PROGRESS_FLUSH_PRODUCTS) {
        flushedAt = scanned.length;
        await updateSizingRun(run.id, { productsScanned: scanned.length });
      }

      if (!result.nextCursor) break;
      cursor = result.nextCursor;
      await sleep(PAGE_DELAY_MS);
    }
  }

  await updateSizingRun(run.id, { productsScanned: scanned.length });

  // ─── 2. Identify every brand, in one request ────────────────────────────────
  // The doc's Tab 2 is a single pass over the full SKU dataset, and that is what this is: the model
  // sees the entire catalog at once, so it resolves a brand against every other product in the store
  // rather than against whichever handful happened to share a slice with it.
  const identified = await identifyBrands(
    scanned.map((row) => ({
      externalId: row.externalId,
      title: row.title,
      description: row.description,
      category: row.categoryPath,
      brandField: row.brandField,
    })),
    // Only fires on the split path, and only to prove the worker is alive: a catalog big enough to
    // need several requests can spend longer identifying than the stall detector's patience, and
    // being requeued mid-identification would restart the whole walk from the beginning.
    async () => {
      await updateSizingRun(run.id, { productsScanned: scanned.length });
    }
  );

  // ─── 3. Aggregate ───────────────────────────────────────────────────────────
  // Which parent each product is sized on comes from the merchant's Categories mapping, not from
  // anything about the product itself. Built once here rather than per product: the index is
  // derived from a category list that does not change during a walk, and this runs tens of
  // thousands of times.
  const categoryIndex = buildCategoryIndex(connection.categories);

  const aggregator = new CoverageAggregator();
  for (const [index, row] of scanned.entries()) {
    aggregator.add({
      externalId: row.externalId,
      sku: row.sku,
      title: row.title,
      brand: identified[index],
      sizingGroup: resolveProductParent(
        { externalId: row.externalId, categoryIds: row.sourceCategoryIds },
        connection.categoryParentMap,
        connection.skuParentOverrides,
        categoryIndex
      ),
      sizes: row.sizes,
      genders: row.genders,
      ageGroups: row.ageGroups,
      storeCategoryPaths: row.storeCategoryPaths,
      imageUrl: row.imageUrl,
    });
  }

  const rows = aggregator.rows();
  const stats = aggregator.stats();

  const written = await replaceSizingCoverage(connection.id, rows);
  if (!written) {
    throw new Error("Scan finished but its coverage could not be saved.");
  }

  // Written after coverage and only on success, so the two always describe the same walk. A null
  // list left over from a previous scan next to fresh coverage would show the merchant gaps for
  // products that now have brands.
  const nullsWritten = await replaceSizingNullRecords(connection.id, aggregator.nullRecords());
  if (!nullsWritten) {
    throw new Error("Scan finished but its unbranded product list could not be saved.");
  }

  if (stats.nullRecordsTruncated) {
    console.warn(
      `[sizing scan] ${connection.id}: ${stats.unbranded} unbranded product(s) found, more than the ` +
        "null-record cap — the gap queue still covers all of them by category, but the itemised list is partial."
    );
  }

  if (stats.truncatedFormatRows > 0) {
    console.warn(
      `[sizing scan] ${connection.id}: ${stats.truncatedFormatRows} coverage row(s) hit the raw-format cap; ` +
        "the rarest size formats in those rows will have no resolved sizes."
    );
  }

  await updateSizingRun(run.id, { productsScanned: stats.counted });

  return { stats, rows: rows.length, pages };
}
