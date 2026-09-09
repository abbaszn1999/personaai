import { audienceFor, normalizeBrandKey, normalizeSizeLabel, UNKNOWN_BRAND_KEY } from "./keys";
import type { SizingGroup } from "./measurements";

/**
 * Folds a merchant's catalog into the handful of aggregate rows the sizing pipeline actually needs.
 *
 * This is the piece that enforces the brief's core rule — cost scales with distinct brands,
 * categories and size formats, never with SKU count. A 20,000-SKU store and a 500-SKU store
 * carrying the same brands produce the same number of rows here, and every paid step downstream
 * reads these rows rather than the catalog.
 *
 * Deliberately pure and synchronous: no database, no network, no product retained after it has been
 * folded in. `add` is called once per product per sighting during the walk and keeps only counters
 * and small string sets, so peak memory is a function of the store's brand/category spread rather
 * than its size. That is what makes the scan streamable at all.
 */

/** One product, reduced to just the fields coverage is derived from. Decoupled from
 *  `RawCatalogProduct` so this module stays testable without a platform payload, and so the caller
 *  is forced to resolve sizes/audience through the mapper's own override-aware extraction rather
 *  than reaching into `variantOptions` a second, divergent way. */
export interface ScanProduct {
  externalId: string;
  sku: string | null;
  title: string;
  brand: string | null;
  /**
   * Which of the five parents this product is sized on, resolved from the merchant's own category
   * mapping. `null` means their mapping does not reach this product, and it is skipped.
   *
   * Passed in rather than derived here, and that inversion is the point. This used to be inferred
   * from the product's canonical category and title, which failed two ways nobody could see: a
   * title matching no synonym dropped the product from sizing, and one matching the wrong synonym
   * sized it against the wrong chart. The merchant answers once per category path instead.
   */
  sizingGroup: SizingGroup | null;
  /** Size labels for this product, already routed through the merchant's option-group overrides. */
  sizes: readonly string[];
  genders: readonly string[];
  ageGroups: readonly string[];
  /** The merchant's own category paths this product was found under, root-first. */
  storeCategoryPaths: readonly string[][];
  imageUrl: string | null;
}

export interface CoverageRow {
  brandKey: string;
  /** The brand as the merchant writes it. Null for the unbranded sentinel row. */
  brandName: string | null;
  sizingCategory: string;
  skuCount: number;
  storeCategoryPaths: string[][];
  sampleSkus: CoverageSample[];
  /** Keyed by the merchant's own raw size string, e.g. `"S,M,L"`. `canonical` stays null until the
   *  Phase 6 mapping call resolves it. */
  rawFormats: Record<string, { count: number; canonical: string[] | null }>;
  /**
   * How many products in this row looked like each audience, e.g. `{ mens: 412, unisex: 6 }`.
   *
   * The audience used to be half of `sizingCategory` and is not any more — it belongs to the chart,
   * where it is read off the brand's published guide rather than guessed from a catalog that may
   * carry no gender field at all. Keeping the counts anyway costs nothing and is a real signal on
   * the stores that *do* have that field: dropping it would be a regression for exactly the
   * merchants whose data was good enough for the old key to work.
   *
   * Counts rather than one verdict, because a row rolls up many products, they need not agree, and
   * one mislabelled product should not decide the row.
   */
  audienceHints: Record<string, number>;
}

export interface CoverageSample {
  externalId: string;
  sku: string | null;
  title: string;
  imageUrl: string | null;
}

/**
 * One product the identification agent could not put a brand on — the doc's `null_records`.
 *
 * Row-level because there is no alternative: a global or private brand collapses to its name however
 * many SKUs carry it, but an unbranded product has no key to group under. Carries its sizing
 * category because Tab 3 routes these to manual fill "grouped by category instead of brand".
 */
export interface NullRecord {
  externalId: string;
  sku: string | null;
  title: string;
  sizingCategory: string;
}

/** Enough for a gap-fill template's thumbnails and no more. These are the only SKU-level strings
 *  this feature persists anywhere, so the cap is the privacy and size budget both. */
const MAX_SAMPLES_PER_ROW = 3;

/** Ceiling on the merchant category paths recorded per row. Display only — the UI uses them to
 *  speak the store's own taxonomy — so a store that files one brand under fifty overlapping
 *  collections doesn't need all fifty to make the row legible. */
const MAX_PATHS_PER_ROW = 12;

/**
 * Ceiling on distinct raw size strings per row, which is the one field with genuinely unbounded
 * cardinality: a store writing exact numeric sizes per product ("38.5,39,39.5") can produce a new
 * combination on almost every SKU.
 *
 * Kept high because the tail is what the Phase 6 mapping call needs to see, and dropped
 * lowest-count-first so what survives is the formats covering the most stock. A row that hits this
 * is reported through `truncatedFormatRows` rather than silently trimmed, because the dropped
 * formats are stock that will have no resolved sizes.
 */
const MAX_FORMATS_PER_ROW = 400;

/**
 * Ceiling on individually listed unbranded products.
 *
 * These are the only per-product rows this feature persists, so the cap is what keeps a mostly
 * unbranded catalog from turning the null list into the product mirror the design avoids. Reported
 * through `nullRecordsTruncated` rather than silently trimmed: past this point the merchant is
 * looking at a sample of their unbranded stock, and the gap-fill queue still covers all of it by
 * category, so what is lost is the enumeration, not the coverage.
 */
const MAX_NULL_RECORDS = 10_000;

interface Bucket {
  brandKey: string;
  brandName: string | null;
  sizingCategory: string;
  skuCount: number;
  paths: Map<string, string[]>;
  samples: CoverageSample[];
  formats: Map<string, number>;
  formatsTruncated: boolean;
  audiences: Map<string, number>;
}

export interface AggregateStats {
  /** Products the walk handed over, including repeat sightings across overlapping categories. */
  seen: number;
  /** Distinct products folded into a row. */
  counted: number;
  /** Distinct products the merchant's category mapping does not reach — stock filed only under
   *  paths they left out of scope, or under ones they mapped to no parent. Not a failure on its
   *  own: a bag or a scarf has no chart to research. A number far larger than the merchant expects
   *  is how a hole in their mapping becomes visible. */
  unsized: number;
  /** Distinct products whose sizing category resolved but which list no sizes at all. Counted
   *  separately because a brand that is *all* of these has a chart worth researching and no stock
   *  to map it onto, which reads very differently from a brand with no coverage at all. */
  sizeless: number;
  /** Rows that hit `MAX_FORMATS_PER_ROW`. Non-zero means some stock's raw sizes were dropped. */
  truncatedFormatRows: number;
  /** Sized products the agent could not brand — the length of the doc's `null_records` before any
   *  cap. Compare with `nullRecords()` to see whether the list was truncated. */
  unbranded: number;
  /** True when more unbranded products exist than `MAX_NULL_RECORDS` lists individually. */
  nullRecordsTruncated: boolean;
}

export class CoverageAggregator {
  private readonly buckets = new Map<string, Bucket>();
  private readonly countedIds = new Set<string>();
  private readonly nulls: NullRecord[] = [];
  private seen = 0;
  private unsized = 0;
  private sizeless = 0;
  private unbranded = 0;

  /**
   * Folds one sighting of one product into the aggregates.
   *
   * Safe to call more than once for the same product, which the walk does whenever a product sits
   * in two selected categories. Counters and size formats are applied only on first sight, so
   * overlapping collections can't inflate `skuCount`; the merchant's category paths are merged on
   * every sighting, so a product's second collection still shows up in the row it belongs to.
   */
  add(product: ScanProduct): void {
    this.seen += 1;

    const isFirstSighting = !this.countedIds.has(product.externalId);

    // Outside the merchant's mapping. Skipped rather than filed under a default, which would
    // generate research requests that can only come back empty.
    if (!product.sizingGroup) {
      if (isFirstSighting) {
        this.countedIds.add(product.externalId);
        this.unsized += 1;
      }
      return;
    }

    const audience = audienceFor({
      genders: product.genders,
      ageGroups: product.ageGroups,
      // Free-text fallback for the common case of a store with no gender attribute at all: its own
      // category names ("Women > Tops") and the product title are where the audience actually is.
      hints: [...product.storeCategoryPaths.flat(), product.title],
    });

    const brandKey = normalizeBrandKey(product.brand);
    const bucket = this.bucketFor(brandKey, product.brand, product.sizingGroup);

    for (const path of product.storeCategoryPaths) {
      if (path.length === 0) continue;
      const key = path.join("::");
      if (!bucket.paths.has(key) && bucket.paths.size >= MAX_PATHS_PER_ROW) continue;
      bucket.paths.set(key, [...path]);
    }

    if (!isFirstSighting) return;
    this.countedIds.add(product.externalId);

    // Listed individually only on first sighting, so a product in two selected categories appears
    // once in the null list rather than once per category it is filed under.
    if (brandKey === UNKNOWN_BRAND_KEY) {
      this.unbranded += 1;
      if (this.nulls.length < MAX_NULL_RECORDS) {
        this.nulls.push({
          externalId: product.externalId,
          sku: product.sku,
          title: product.title,
          sizingCategory: product.sizingGroup,
        });
      }
    }

    bucket.skuCount += 1;
    bucket.audiences.set(audience, (bucket.audiences.get(audience) ?? 0) + 1);

    if (bucket.samples.length < MAX_SAMPLES_PER_ROW) {
      bucket.samples.push({
        externalId: product.externalId,
        sku: product.sku,
        title: product.title,
        imageUrl: product.imageUrl,
      });
    }

    const rawFormat = toRawFormat(product.sizes);
    if (rawFormat) {
      const existing = bucket.formats.get(rawFormat);
      if (existing !== undefined) {
        bucket.formats.set(rawFormat, existing + 1);
      } else if (bucket.formats.size < MAX_FORMATS_PER_ROW) {
        bucket.formats.set(rawFormat, 1);
      } else {
        bucket.formatsTruncated = true;
      }
    } else {
      this.sizeless += 1;
    }
  }

  private bucketFor(brandKey: string, brandName: string | null, sizingCategory: string): Bucket {
    const key = `${brandKey}\u0000${sizingCategory}`;
    const existing = this.buckets.get(key);
    if (existing) {
      // First non-empty spelling wins, so a row keyed `levis` displays whichever of "Levi's" or
      // "Levis" the merchant used first rather than flickering between them run to run.
      if (!existing.brandName && brandName?.trim()) existing.brandName = brandName.trim();
      return existing;
    }

    const bucket: Bucket = {
      brandKey,
      brandName: brandKey === UNKNOWN_BRAND_KEY ? null : (brandName?.trim() || null),
      sizingCategory,
      skuCount: 0,
      paths: new Map(),
      samples: [],
      formats: new Map(),
      formatsTruncated: false,
      audiences: new Map(),
    };
    this.buckets.set(key, bucket);
    return bucket;
  }

  /** The rows to persist, largest first so a truncated UI list shows the stock that matters most. */
  rows(): CoverageRow[] {
    return [...this.buckets.values()]
      .filter((bucket) => bucket.skuCount > 0)
      .sort((a, b) => b.skuCount - a.skuCount || a.brandKey.localeCompare(b.brandKey))
      .map((bucket) => ({
        brandKey: bucket.brandKey,
        brandName: bucket.brandName,
        sizingCategory: bucket.sizingCategory,
        skuCount: bucket.skuCount,
        storeCategoryPaths: [...bucket.paths.values()],
        sampleSkus: bucket.samples,
        rawFormats: toRawFormats(bucket.formats),
        audienceHints: Object.fromEntries(bucket.audiences),
      }));
  }

  /** The doc's `null_records`: every sized product no brand could be identified for, capped. */
  nullRecords(): NullRecord[] {
    return [...this.nulls];
  }

  stats(): AggregateStats {
    let truncatedFormatRows = 0;
    for (const bucket of this.buckets.values()) if (bucket.formatsTruncated) truncatedFormatRows += 1;

    return {
      seen: this.seen,
      counted: this.countedIds.size,
      unsized: this.unsized,
      sizeless: this.sizeless,
      truncatedFormatRows,
      unbranded: this.unbranded,
      nullRecordsTruncated: this.unbranded > this.nulls.length,
    };
  }
}

/**
 * The merchant's raw size list as one comparable string, e.g. `"S,M,L"`.
 *
 * Keyed on the whole combination rather than per label on purpose. A lone `"2"` is ambiguous — a
 * kids' age, a numeric dress size, a shoe width — and the siblings are what disambiguate it:
 * `"1,2,3"` and `"2,4,6"` are different scales. Splitting to individual labels would produce a
 * smaller distinct set but throw away exactly the context the Phase 6 mapping call needs, and that
 * call is per brand+category regardless, so the saving would be nil.
 *
 * Labels are normalized (case, spacing) but never reordered: the order a merchant lists sizes in is
 * itself a signal that the scale runs small-to-large.
 */
export function toRawFormat(sizes: readonly string[]): string | null {
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const size of sizes) {
    const label = normalizeSizeLabel(size);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }

  return labels.length > 0 ? labels.join(",") : null;
}

function toRawFormats(formats: Map<string, number>): CoverageRow["rawFormats"] {
  const out: CoverageRow["rawFormats"] = {};
  for (const [raw, count] of [...formats.entries()].sort((a, b) => b[1] - a[1])) {
    out[raw] = { count, canonical: null };
  }
  return out;
}
