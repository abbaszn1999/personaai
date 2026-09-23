import { createCatalogPager, membership } from "@/lib/catalog/pager";
import { resolveCategoryPaths } from "@/lib/catalog/index-product";
import { buildCategoryIndex } from "@/lib/catalog/category-parents";
import { buildPersonaMappingConfig, resolvePersonaPaths, type ResolvedPersonaPath } from "@/lib/catalog/persona-mapping";
import { extractVariantAttributes } from "@/lib/catalog/acs/map-product";
import { sleep } from "@/lib/catalog/timeout";
import {
  updateSizingBrandMappingById,
  type StoreConnectionRow,
} from "@/lib/db/store-connections";
import { replaceSizingCoverage } from "@/lib/db/sizing-coverage";
import { replaceSizingNullRecords } from "@/lib/db/sizing-null-records";
import { replaceSizingProductRecords } from "@/lib/db/sizing-product-records";
import { replaceSizingPathCoverage } from "@/lib/db/sizing-path-coverage";
import {
  deleteSizingChartAssignments,
  listSizingChartAssignments,
} from "@/lib/db/sizing-chart-assignments";
import { updateSizingRun, type SizingRunRow } from "@/lib/db/sizing-runs";
import { isSizingGroup, type SizingGroup } from "./measurements";
import { CoverageAggregator, type AggregateStats } from "./aggregate";
import { PathCoverageAggregator, pathKey } from "./path-coverage";
import {
  mergeObservedBrandLabels,
  parseStoreBrandMapping,
  resolveMappedBrand,
} from "./brand-mapping";

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
  /** Path coverage rows written — the (brand x merchant category x parent) triples Stage 5 assigns. */
  pathRows: number;
  pages: number;
}

/**
 * What the walk keeps per product, and nothing more.
 *
 * Deliberately not the raw product: the whole catalog is held in memory until aggregation, and
 * retaining full store payloads — image lists, variant trees, HTML descriptions — would make memory
 * scale with how verbose a merchant's CMS is. These are the only fields aggregation reads.
 */
interface ScanRow {
  externalId: string;
  sku: string | null;
  title: string;
  brandField: string | null;
  /** Which of the five parents this product is sized on, or null where the merchant's mapping does
   *  not reach it. */
  sizingGroup: SizingGroup | null;
  /** The category that answered — the deepest mapped term the product sits on. Stage 5 assigns
   *  charts against this, so it has to be the same winner the sizing came from. */
  sizingCategoryId: string | null;
  sizes: string[];
  genders: string[];
  ageGroups: string[];
  storeCategoryPaths: string[][];
  personaPaths: ResolvedPersonaPath[];
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
  const brandMapping = parseStoreBrandMapping(connection.sizingBrandMapping);
  const pager = await createCatalogPager(connection);
  if (!pager) {
    throw new Error("No categories are selected for indexing yet, so there is nothing to scan.");
  }

  // ─── 1. Read the catalog ────────────────────────────────────────────────────
  // Paging here is the store's constraint, not ours: WooCommerce's REST API refuses more than 100
  // products per request, and Shopify pages by cursor, so no platform can hand over a whole catalog
  // in one response. The pages are stitched back into a single dataset before anything is asked
  // about it, so how the store chose to chunk its own API never reaches the model.
  // Derived from a category list that cannot change mid-walk, so build it once rather than once per
  // product.
  const categoryIndex = buildCategoryIndex(connection.categories);
  const personaConfig = buildPersonaMappingConfig(
    connection.personaTaxonomyScope,
    connection.personaCategoryMap,
    connection.categories,
  );

  const scanned: ScanRow[] = [];
  let pages = 0;
  let flushedAt = 0;

  // No total: the store's own category counts double-count anything filed in two places, so the
  // denominator isn't known until the walk ends.
  await updateSizingRun(run.id, { phase: "walking", phaseDone: 0, phaseTotal: null });

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
        const variants = extractVariantAttributes(raw, connection.acsFieldMapping);
        const storeCategoryPaths = resolveCategoryPaths({ ...raw, sourceCategoryIds }, connection);
        const personaPaths = resolvePersonaPaths(sourceCategoryIds, personaConfig);
        const primaryPersonaPath = personaPaths[0] ?? null;
        const override = connection.skuParentOverrides[raw.externalId];

        scanned.push({
          externalId: raw.externalId,
          sku: raw.sku,
          title: raw.title,
          // A group the merchant reassigned to `brand` in Stage 1 wins over the platform's own
          // field, which is the whole point of the override — some stores keep the real brand in an
          // attribute and leave the vendor field as their own shop name.
          brandField: variants.brands[0] ?? raw.brand,
          sizingGroup: isSizingGroup(override) ? override : primaryPersonaPath?.sizingGroup ?? null,
          sizingCategoryId: primaryPersonaPath?.key ?? null,
          sizes: [...variants.sizes],
          genders: [...variants.genders],
          ageGroups: [...variants.ageGroups],
          storeCategoryPaths,
          personaPaths,
          imageUrl: raw.imageUrl,
        });
      }

      if (scanned.length - flushedAt >= PROGRESS_FLUSH_PRODUCTS) {
        flushedAt = scanned.length;
        await updateSizingRun(run.id, { productsScanned: scanned.length, phaseDone: scanned.length });
      }

      if (!result.nextCursor) break;
      cursor = result.nextCursor;
      await sleep(PAGE_DELAY_MS);
    }
  }

  await updateSizingRun(run.id, { productsScanned: scanned.length, phaseDone: scanned.length });

  // ─── 2. Aggregate the mapped brand field ────────────────────────────────────
  // There is deliberately no product-level LLM pass here. A non-empty brand field is already the
  // brand to classify; an empty one is a Null / No brand SKU. Once coverage is written, the classify
  // stage sends the complete distinct non-empty brand list to Gemini in one request.
  await updateSizingRun(run.id, { phase: "aggregating", phaseDone: null, phaseTotal: null });

  // Every row, not just the sized ones. Which parent a product is sized on came from the merchant's
  // Categories mapping during the walk; the unsized ones are handed over so the aggregator can count
  // them, which is the only place the size of that gap is recorded.
  const aggregator = new CoverageAggregator();
  // Second aggregation over the same rows, on the axis `sizing_coverage` cannot express: the merchant
  // category the product was actually sized from. Stage 5 assigns charts per path, and "Tommy tops"
  // is not a path — `Men > T-Shirts` and `Women > Tops` are, and they want different variants.
  const paths = new PathCoverageAggregator(connection.categories, categoryIndex);

  for (const row of scanned) {
    const brand = resolveMappedBrand(row.brandField, brandMapping);
    aggregator.add({
      externalId: row.externalId,
      sku: row.sku,
      title: row.title,
      brand: brand.brandName,
      brandKey: brand.brandKey,
      sizingGroup: row.sizingGroup,
      sizes: row.sizes,
      genders: row.genders,
      ageGroups: row.ageGroups,
      storeCategoryPaths: row.storeCategoryPaths,
      imageUrl: row.imageUrl,
    });
    for (const personaPath of row.personaPaths) {
      paths.addPersonaPath({
        externalId: row.externalId,
        brand: brand.brandName,
        brandKey: brand.brandKey,
        sizingGroup: row.sizingGroup ?? personaPath.sizingGroup,
        pathKey: personaPath.key,
        path: personaPath.segments,
      });
    }
  }

  const rows = aggregator.rows();
  const stats = aggregator.stats();
  const pathRows = paths.result();

  const productsWritten = await replaceSizingProductRecords(
    connection.id,
    scanned.flatMap((row) =>
      row.sizingGroup
        ? [{
            externalId: row.externalId,
            sku: row.sku,
            title: row.title,
            brandKey: resolveMappedBrand(row.brandField, brandMapping).brandKey,
            sizingCategory: row.sizingGroup,
          }]
        : []
    )
  );
  if (!productsWritten) {
    throw new Error("Scan finished but its Stage 2 product snapshot could not be saved.");
  }

  const written = await replaceSizingCoverage(
    connection.id,
    rows,
    brandMapping.confirmedAt ? brandMapping.aliases : {},
  );
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

  const pathsWritten = await replaceSizingPathCoverage(connection.id, pathRows);
  if (!pathsWritten) {
    throw new Error("Scan finished but its category-path coverage could not be saved.");
  }

  const observedMapping = mergeObservedBrandLabels(
    brandMapping,
    scanned.map((row) => row.brandField),
  );
  if (!(await updateSizingBrandMappingById(connection.id, observedMapping))) {
    throw new Error("Scan finished but its observed brand labels could not be saved.");
  }

  // Assignments are a merchant decision and survive a rescan, but only where the path still exists.
  // Pruned rather than left: a path the store stopped carrying is invisible on the assignment screen
  // (which joins from coverage) while still sitting in the table, and a merchant who re-adds the
  // category later would silently inherit a choice they no longer remember making.
  await pruneOrphanedAssignments(connection.id, pathRows);

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

  return { stats, rows: rows.length, pages, pathRows: pathRows.length };
}

async function pruneOrphanedAssignments(
  connectionId: string,
  pathRows: readonly { brandKey: string; categoryId: string; sizingCategory: string }[]
): Promise<void> {
  const assignments = await listSizingChartAssignments(connectionId);
  if (assignments.length === 0) return;

  const live = new Set(pathRows.map((row) => pathKey(row.brandKey, row.categoryId, row.sizingCategory)));
  const orphaned = assignments
    .filter((row) => !live.has(pathKey(row.brandKey, row.categoryId, row.sizingCategory)))
    .map((row) => row.id);

  if (orphaned.length > 0) {
    await deleteSizingChartAssignments(connectionId, orphaned);
    console.log(`[sizing scan] ${connectionId}: dropped ${orphaned.length} assignment(s) for paths the store no longer carries`);
  }
}
