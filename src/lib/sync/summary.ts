import type { StoreConnectionRow } from "@/lib/db/store-connections";
import {
  getLatestPublishedSizingRun,
  listDeltaSizingRuns,
  type SizingRunRow,
} from "@/lib/db/sizing-runs";
import {
  listSyncProducts,
  listSyncProductsForRuns,
  type SyncNewProductRow,
  type SyncProductSource,
} from "@/lib/db/sync-new-products";
import { audienceHintFor, UNKNOWN_BRAND_KEY } from "@/lib/sizing/keys";
import { SYNC_CANCELLED_MESSAGE } from "./constants";
import {
  loadSizingResolutionContext,
  resolveProductChart,
  type SizingResolutionContext,
} from "@/lib/sizing/product-chart";

/**
 * Where a waiting product stands against what the store already has, as of now:
 *  - `ready`: its brand is classified and a chart covers its subcategory — it syncs as is.
 *  - `new_brand`: the store has never classified its brand; the sync classifies it first.
 *  - `needs_chart`: the brand is known but no chart covers this subcategory yet.
 *  - `no_chart_needed`: the merchant's mapping gives it no sizing family, so it publishes unsized.
 */
export type PendingProductState = "ready" | "new_brand" | "needs_chart" | "no_chart_needed";

export interface PendingProductView {
  externalId: string;
  sku: string | null;
  title: string;
  imageUrl: string | null;
  price: string | null;
  brandLabel: string | null;
  brandKey: string;
  brandType: "global" | "private" | "none" | "new";
  sizingCategory: string;
  state: PendingProductState;
  source: SyncProductSource;
  detectedAt: string;
}

export interface SyncHistoryView {
  id: string;
  kind: "sync" | "setup";
  status: "complete" | "failed" | "in_progress" | "cancelled";
  startedAt: string;
  publishedAt: string | null;
  durationSec: number | null;
  /** Products the run took that the store still sold when it read them. */
  productCount: number;
  publishedCount: number;
  sources: Partial<Record<SyncProductSource, number>>;
  knownBrands: number;
  newBrands: number;
  charts: { matched: number; unresolved: number; unsized: number; excluded: number };
  sampleTitles: string[];
  note: string;
  error: string | null;
}

export interface SyncSummary {
  /** False until Setup has published: before that, new products go out with Setup's own publish. */
  trackingActive: boolean;
  pending: {
    total: number;
    counts: Record<PendingProductState, number>;
    newBrandNames: string[];
    lastDetectedAt: string | null;
    lastSource: SyncProductSource | null;
    products: PendingProductView[];
    offset: number;
    limit: number;
  };
  history: {
    entries: SyncHistoryView[];
    total: number;
    /** Share of published, sized sync products that went out with a chart. Null before any. */
    chartCoveragePercent: number | null;
  };
}

const MAX_NEW_BRAND_NAMES = 6;
const SAMPLE_TITLES = 4;
const QUEUE_PAGE = 1_000;

/** The whole queue, page by page: the cards count every waiting product, not the first page. */
async function listWaiting(connectionId: string): Promise<{ rows: SyncNewProductRow[]; total: number }> {
  const rows: SyncNewProductRow[] = [];
  let total = 0;
  do {
    const page = await listSyncProducts(connectionId, { statuses: ["pending"], limit: QUEUE_PAGE, offset: rows.length });
    total = page.total;
    rows.push(...page.rows);
    if (page.rows.length === 0) break;
  } while (rows.length < total);
  return { rows, total };
}

function pendingState(product: SyncNewProductRow, context: SizingResolutionContext): {
  state: PendingProductState;
  brandType: PendingProductView["brandType"];
} {
  const known = context.brandTypes.get(product.brandKey);
  const brandType = known && known !== "unclassified" ? known : product.brandKey === UNKNOWN_BRAND_KEY ? "none" : "new";
  if (product.sizingCategory === "") return { state: "no_chart_needed", brandType };
  if (brandType === "new") return { state: "new_brand", brandType };
  const resolution = resolveProductChart(
    {
      brandKey: product.brandKey,
      sizingCategory: product.sizingCategory,
      primaryPersonaLeafKey: product.leafKey,
      rawSizeFormat: product.rawSizeFormat,
      audienceHint: audienceHintFor({ title: product.title }),
    },
    // A no-brand product on a store that never had one has no `none` row yet; it is routed as one.
    known ? context : { ...context, brandTypes: new Map([...context.brandTypes, [product.brandKey, "none"]]) },
  );
  return { state: resolution.status === "matched" ? "ready" : "needs_chart", brandType };
}

function historyStatus(run: SizingRunRow): SyncHistoryView["status"] {
  if (run.status === "complete") return "complete";
  if (run.status === "failed") return run.error === SYNC_CANCELLED_MESSAGE ? "cancelled" : "failed";
  return "in_progress";
}

function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

function noteFor(entry: Omit<SyncHistoryView, "note">): string {
  if (entry.status === "cancelled") return `Cancelled before publishing. ${plural(entry.productCount, "product")} went back to the queue.`;
  if (entry.status === "failed") return entry.error ?? "The sync stopped before it finished.";
  const brandPart = entry.newBrands > 0
    ? `${plural(entry.newBrands, "new brand")} classified, ${plural(entry.knownBrands, "known brand")} reused`
    : `${plural(entry.knownBrands, "known brand")} reused, no new brands`;
  if (entry.status === "in_progress") return `${plural(entry.productCount, "product")} in progress. ${brandPart}.`;
  const sized = entry.charts.matched + entry.charts.unresolved;
  const chartPart = sized > 0
    ? `${entry.charts.matched.toLocaleString()} of ${sized.toLocaleString()} sized products published with a chart`
    : "no sized products";
  return `${plural(entry.publishedCount, "new product")} published to the catalog. ${brandPart}; ${chartPart}.`;
}

function historyEntry(run: SizingRunRow, products: readonly SyncNewProductRow[]): SyncHistoryView {
  const kept = products.filter((product) => product.status !== "removed");
  const sources: SyncHistoryView["sources"] = {};
  for (const product of kept) sources[product.source] = (sources[product.source] ?? 0) + 1;
  const newBrands = new Set<string>();
  const knownBrands = new Set<string>();
  for (const product of kept) {
    if (product.brandKey === UNKNOWN_BRAND_KEY) continue;
    (product.brandWasNew ? newBrands : knownBrands).add(product.brandKey);
  }
  const charts = { matched: 0, unresolved: 0, unsized: 0, excluded: 0 };
  for (const product of kept) {
    if (product.chartStatus && product.chartStatus in charts) charts[product.chartStatus as keyof typeof charts] += 1;
  }
  const publishedAt = run.publishedAt;
  const base = {
    id: run.id,
    kind: "sync" as const,
    status: historyStatus(run),
    startedAt: run.createdAt,
    publishedAt,
    durationSec: publishedAt
      ? Math.max(0, Math.round((Date.parse(publishedAt) - Date.parse(run.createdAt)) / 1000))
      : null,
    productCount: kept.length,
    publishedCount: kept.filter((product) => product.status === "published" && product.chartStatus !== "excluded").length,
    sources,
    knownBrands: knownBrands.size,
    newBrands: newBrands.size,
    charts,
    sampleTitles: kept.slice(0, SAMPLE_TITLES).map((product) => product.title),
    error: run.error,
  };
  return { ...base, note: noteFor(base) };
}

function setupEntry(run: SizingRunRow): SyncHistoryView {
  return {
    id: run.id,
    kind: "setup",
    status: "complete",
    startedAt: run.createdAt,
    publishedAt: run.publishedAt,
    durationSec: null,
    productCount: run.productsScanned,
    publishedCount: run.productsScanned,
    sources: {},
    knownBrands: 0,
    newBrands: 0,
    charts: { matched: 0, unresolved: 0, unsized: 0, excluded: 0 },
    sampleTitles: [],
    note: `Store Setup published the catalog baseline: ${plural(run.productsScanned, "product")} read and sized. Every sync since adds to it.`,
    error: null,
  };
}

export async function buildSyncSummary(
  connection: StoreConnectionRow,
  options: { offset: number; limit: number; historyOffset: number; historyLimit: number },
): Promise<SyncSummary> {
  const [published, waiting, runs, context] = await Promise.all([
    getLatestPublishedSizingRun(connection.id),
    listWaiting(connection.id),
    listDeltaSizingRuns(connection.id, { offset: options.historyOffset, limit: options.historyLimit }),
    loadSizingResolutionContext(connection),
  ]);

  const counts: Record<PendingProductState, number> = { ready: 0, new_brand: 0, needs_chart: 0, no_chart_needed: 0 };
  const newBrandNames = new Map<string, string>();
  const views: PendingProductView[] = waiting.rows.map((product) => {
    const { state, brandType } = pendingState(product, context);
    counts[state] += 1;
    if (state === "new_brand" && !newBrandNames.has(product.brandKey)) {
      newBrandNames.set(product.brandKey, product.brandLabel ?? product.brandKey);
    }
    return {
      externalId: product.externalId,
      sku: product.sku,
      title: product.title,
      imageUrl: product.imageUrl,
      price: product.price,
      brandLabel: product.brandLabel,
      brandKey: product.brandKey,
      brandType,
      sizingCategory: product.sizingCategory,
      state,
      source: product.source,
      detectedAt: product.detectedAt,
    };
  });

  const runProducts = await listSyncProductsForRuns(runs.runs.map((run) => run.id));
  const byRun = new Map<string, SyncNewProductRow[]>();
  for (const product of runProducts) {
    if (!product.syncRunId) continue;
    byRun.set(product.syncRunId, [...(byRun.get(product.syncRunId) ?? []), product]);
  }
  const entries = runs.runs.map((run) => historyEntry(run, byRun.get(run.id) ?? []));
  // The baseline closes the list, on its last page.
  const lastPage = options.historyOffset + runs.runs.length >= runs.total;
  if (published && lastPage) entries.push(setupEntry(published));

  let matched = 0;
  let sized = 0;
  for (const entry of entries) {
    matched += entry.charts.matched;
    sized += entry.charts.matched + entry.charts.unresolved;
  }

  return {
    trackingActive: published !== null,
    pending: {
      total: waiting.total,
      counts,
      newBrandNames: [...newBrandNames.values()].slice(0, MAX_NEW_BRAND_NAMES),
      lastDetectedAt: waiting.rows[0]?.detectedAt ?? null,
      lastSource: waiting.rows[0]?.source ?? null,
      products: views.slice(options.offset, options.offset + options.limit),
      offset: options.offset,
      limit: options.limit,
    },
    history: {
      entries,
      total: runs.total + (published ? 1 : 0),
      chartCoveragePercent: sized === 0 ? null : Math.round((matched / sized) * 1000) / 10,
    },
  };
}
