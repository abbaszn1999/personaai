"use client";

import { create } from "zustand";
import type {
  CategoryFilterConfig,
  FoundSizeChart,
  GapItem,
  SizingProduct,
  StageNumber,
} from "./types";
import { LAST_STAGE } from "./types";
import {
  EMPTY_CHARTS_RESPONSE,
  EMPTY_COVERAGE_SUMMARY,
  EMPTY_IDENTIFICATION,
  EMPTY_ROUTING,
  isScanIncomplete,
  isRunWorking,
  stageForRun,
  type BrandIdentification,
  type BrandMappingResponse,
  type BrandMappingStatus,
  type BrandResearchRow,
  type CanonicalBrandGroup,
  type ChartAudience,
  type ChartGap,
  type CoverageSummary,
  type ResearchedChart,
  type RoutingPlan,
  type SizingChartsResponse,
  type SizingRun,
  type ServerBrandType,
  type SizingRunResponse,
  type SizingSampleResponse,
  type SizingSampleRow,
} from "./server-types";
import { draftRowsFrom, type ChartDraftRow } from "@/lib/sizing/chart-draft";
import { manualChartLeaves } from "@/lib/sizing/manual-chart-coverage";
import { isSizingGroup } from "@/lib/sizing/measurements";
import { personaSizingGroup } from "@/modules/store/mapping/persona-taxonomy";
import { INITIAL_GAP_ITEMS } from "./mocks/gaps";
import { INITIAL_FILTER_CONFIGS } from "./mocks/filter";

/**
 * What the manual chart editor is working on.
 *
 * One shape for both entry points because they differ only in where the rows start: a gap opens on
 * a blank template for its parent, a fork opens on a copy of the researched chart's numbers. Beyond
 * that both write the same connection-scoped `provenance = 'manual'` row.
 */
export interface ManualChartTarget {
  /** Remounts the form when it changes, so opening a second gap never shows the first one's rows. */
  id: string;
  brandKey: string;
  brandName: string;
  sizingCategory: string;
  skuCount: number;
  /** Why this needs filling, or that it is a copy — shown at the top of the editor. */
  reason: string;
  variantName: string;
  /** Absent for a gap, which starts from the parent's blank template. */
  seedRows?: ChartDraftRow[];
  /** Which required-measurement template the grid uses (`height` over `chest`/`waist` for a child
   *  audience). Known and passed through when forking a researched chart, which already carries
   *  its own `audience`; absent for a fresh gap, which today has no audience to offer — the grid
   *  falls back to the adult template rather than guessing one. */
  audience?: ChartAudience;
  /** The Persona leaf keys the source chart claimed, carried into the fork's checklist so a
   *  merchant editing a copy starts from the same coverage rather than an empty one. Absent (not
   *  empty) for a fresh gap, which has no source chart to copy coverage from. */
  coversLeaves?: string[];
  /** The leaves pre-checked when the editor opens. Only differs from `coversLeaves` when editing a
   *  saved chart, where `coversLeaves` also offers uncovered leaves the chart could take on. */
  selectedLeaves?: string[];
  /** Set only when editing a saved chart, so the save updates that row by id instead of matching on
   *  its name. */
  chartId?: string;
  /** True when replacing an existing private chart rather than filling a new gap or making a copy. */
  editing?: boolean;
}

/** Either a real researched chart or one of the mock-fed sync views' charts. Both carry the display
 *  fields the modal renders, so it can show either without the modal having to know which it has. */
export type ChartModalChart = FoundSizeChart | ResearchedChart;

interface ChartModalTarget {
  /** Every chart the brand publishes — every sizing category, every variant — so the modal can be one
   *  brand-level view with its own category tabs and variant picker, rather than the caller having to
   *  decide up front which single table to show. */
  charts: ChartModalChart[];
  /** Set when the chart was opened from a specific product rather than a brand row. */
  product: SizingProduct | null;
  /** The category tab to land on when there is more than one — e.g. opened from a category coverage
   *  chip on the brand table rather than the brand's own "View chart" button. */
  initialCategory: string | null;
}

/** How often a working run is re-read. Fast enough that the scan's product counter visibly moves,
 *  slow enough that a long walk isn't a request per second for several minutes. */
const POLL_INTERVAL_MS = 2_000;

interface SizingUiState {
  stage: StageNumber;
  /** High-water mark, so a merchant can revisit a finished stage but not skip ahead. */
  highestStage: StageNumber;
  /**
   * Whether the first run read has already placed the merchant on a stage.
   *
   * One-shot on purpose. The run is re-read every two seconds while it works, and a later read doing
   * this would yank the merchant out of whatever stage they had navigated to, mid-review. Not cleared
   * by `resetPipeline` either — "Run setup again" walks them back to stage 1 deliberately, and the
   * next poll must not undo that.
   */
  stageRestored: boolean;
  extractionDone: boolean;
  gapItems: GapItem[];
  filterConfigs: CategoryFilterConfig[];
  chartModal: ChartModalTarget | null;
  gapModalItem: GapItem | null;

  // ─── Server-backed scan state ──────────────────────────────────────────────
  /** The live or most recent pipeline run. Null before a merchant has ever started one. */
  run: SizingRun | null;
  summary: CoverageSummary;
  /** Tab 2's three lists, exactly as the doc shapes them. */
  identification: BrandIdentification;
  /** Tab 3's deterministic routing of those lists. */
  routing: RoutingPlan;
  mappingApproved: boolean;
  lastPublishedAt: string | null;
  personaMappingUpdatedAt: string | null;
  /** True only for the initial read, so a poll refresh never blanks the stage back to a spinner. */
  runLoading: boolean;
  runError: string | null;
  /** Set while a start request is in flight, so the button can't be double-fired. */
  startingRun: boolean;
  brandMappingStatus: BrandMappingStatus;
  brandMapping: BrandMappingResponse | null;
  brandMappingLoading: boolean;
  brandMappingSaving: boolean;
  brandMappingError: string | null;
  brandMappingEditing: boolean;

  /**
   * `ifStale` is for screens re-reading on mount: it skips the request when an idle run was read in
   * the last few seconds, or joins one already in flight. Every call after a write omits it, so a
   * change the merchant just made is always read back.
   */
  loadRun: (options?: { restoreStage?: boolean; preferredStage?: StageNumber; ifStale?: boolean }) => Promise<void>;
  loadBrandMapping: (options?: { force?: boolean }) => Promise<void>;
  saveBrandMapping: (groups: CanonicalBrandGroup[], privateGroups?: CanonicalBrandGroup[]) => Promise<boolean>;
  openBrandMappingEditor: () => void;
  closeBrandMappingEditor: () => void;
  startRun: () => Promise<void>;
  /** Unblocks the run's current stage server-side, then resumes polling so the new stage's progress
   *  is visible immediately instead of waiting a full poll interval. */
  continueRun: () => Promise<void>;
  stopPolling: () => void;

  // ─── Stage 4: researched charts ────────────────────────────────────────────
  /** One row per global brand — the grain Generate works on, since one search covers every parent a
   *  brand publishes. Always present, including before anything has been researched: this is the
   *  queue the merchant works from, not a report on a pass that already ran. */
  chartBrands: BrandResearchRow[];
  /** Charts research produced, one per (brand x sizing category). */
  charts: ResearchedChart[];
  /** Global brands research came back empty on, plus every private label — doc Tab 3 sends both to
   *  the same manual-fill queue, so they share a tab. */
  chartGapsNotFound: ChartGap[];
  /** What the shared registry leaves uncovered for each global brand, for the Global brands tab. */
  chartGapsGlobal: ChartGap[];
  /** The unbranded rows, grouped by category instead of brand. */
  chartGapsNoBrand: ChartGap[];
  chartTotals: SizingChartsResponse["totals"];
  chartLeafCounts: SizingChartsResponse["leafCounts"];
  chartLeafSources: SizingChartsResponse["leafSources"];
  /** False until a research pass has recorded an outcome — what separates "no gaps" from "not run". */
  chartsResearched: boolean;
  chartsLoading: boolean;
  chartsError: string | null;
  chartsLoaded: boolean;
  loadCharts: (options?: { force?: boolean }) => Promise<void>;
  /**
   * Asks the server to research one brand, or every brand still outstanding.
   *
   * The only way research starts. It used to start by itself when the merchant left stage 3, which
   * bought a bulk pass over the whole catalog on a click that read as navigation. `force` is
   * Regenerate: search a brand again even though it already holds a chart.
   */
  startResearch: (options?: { brandKey?: string; force?: boolean }) => Promise<void>;
  /** The brand whose Generate request is in flight, or `"__all__"` for Generate All. Null when idle.
   *  Held per brand so one row's spinner does not disable every other row's button. */
  researchStarting: string | null;

  // ─── Stage 4: manual chart entry (doc Part 4) ──────────────────────────────
  /** The gap being hand-filled, or the researched chart being forked. Null when the modal is shut. */
  manualChartTarget: ManualChartTarget | null;
  /** Opens the editor on a gap from the Not Found or No Brand tab. */
  openManualChart: (gap: ChartGap) => void;
  /** Reopens a saved private/no-brand chart with its current rows and coverage. */
  editManualChart: (chart: ResearchedChart) => void;
  closeManualChart: () => void;
  /** Returns an error message, or null on success. Reloads Stage 4 so the filled gap moves out of
   *  the gap tab and into the chart list without a manual refresh. */
  saveManualChart: (input: {
    rows: ChartDraftRow[];
    variantName: string;
    coversLeaves: string[];
    audience?: ChartAudience;
    keepOpen?: boolean;
  }) => Promise<string | null>;

  /** Every leaf enabled in this merchant's taxonomy scope, brand-agnostic and independent of
   *  live SKU counts. What lets a
   *  chart's "Covers" show a leaf this merchant's taxonomy defines even at zero current stock, rather
   *  than a leaf silently vanishing the moment nothing happens to be in it this scan. */
  mappedLeaves: string[];

  /** The page of the live catalog currently shown in stage 2. Held here rather than in the component
   *  so switching stages doesn't re-page the merchant's store every time, and so the fetch follows
   *  the same pattern as the run poll. */
  sample: SizingSampleRow[];
  /** 1-based, for display and for indexing `sampleCursors`. */
  samplePage: number;
  samplePageSize: number;
  /** Start cursor of each page reached so far, index 0 being page 1's (always null). Kept because
   *  Shopify's cursors have no random access — page 4 is only reachable by having walked to it — so
   *  going back needs the cursor we arrived with, not an offset. */
  sampleCursors: (string | null)[];
  /** Null once the last page is reached, which is what disables Next. */
  sampleNextCursor: string | null;
  /** Products across the whole selection, null until the first page has come back with a count.
   *  Never narrowed by a filter — this is what "All items" reports. */
  sampleTotal: number | null;
  /** False when the total is a sum across category groups and so overstates any product filed in
   *  more than one. */
  sampleTotalExact: boolean;
  /** How many products the active brand-type or parent filter matches, exactly, from coverage. Null
   *  when neither is on, or under a text search, which has no countable denominator. */
  sampleFilteredTotal: number | null;
  /** What each brand chip's badge shows: distinct brands for the buckets named after brands, items
   *  for unbranded stock. Null before a scan has classified. */
  sampleTypeCounts: Record<ServerBrandType, number> | null;
  /** Items per brand type, for the wording that talks about stock rather than brands. */
  sampleTypeItemCounts: Record<ServerBrandType, number> | null;
  /** Sized stock per parent sizing category, on the same basis. */
  sampleParentCounts: Record<string, number> | null;
  /** Applied filters. Held here rather than in the component because the server does the filtering —
   *  a brand type only some later page carries would be invisible to a filter over the loaded page. */
  sampleBrandType: ServerBrandType | null;
  sampleParent: string | null;
  sampleQuery: string;
  sampleLoading: boolean;
  sampleError: string | null;
  /** Distinguishes "not read yet" from "read and genuinely empty", so an empty selection doesn't
   *  re-request the store on every mount. */
  sampleLoaded: boolean;
  /** Whether classified coverage existed when this page was read — i.e. whether the brand column has
   *  its Global/Private/Null answer. False while the one bulk classification request is pending:
   *  the page is shown with those cells marked pending rather than holding back columns that never
   *  needed classification. */
  sampleScanned: boolean;
  loadSample: (options?: { force?: boolean }) => Promise<void>;
  /** Drops cached Item Preview pages after a change that alters what they show. */
  invalidateSamplePages: () => void;
  /** After a brand's type changes: its Item Preview badge, the brand-mapping list and the chart
   *  queue are all derived from it, so each is re-read the next time its screen opens. */
  invalidateBrandDerived: () => void;
  goToSamplePage: (page: number, options?: { fresh?: boolean }) => Promise<void>;
  setSamplePageSize: (size: number) => Promise<void>;
  setSampleBrandType: (type: ServerBrandType | null) => Promise<void>;
  setSampleParent: (parent: string | null) => Promise<void>;
  setSampleQuery: (query: string) => Promise<void>;

  goToStage: (stage: StageNumber) => void;
  nextStage: () => void;
  prevStage: () => void;
  resetPipeline: () => void;

  setExtractionDone: (done: boolean) => void;

  /** Accepts either one chart (every legacy sync/confirmation call site, and the single-chart case)
   *  or the brand's full chart list — the modal normalizes either into its own category/variant
   *  tabs, so callers never have to pick a single table on the brand's behalf. */
  openChartModal: (
    charts: ChartModalChart | readonly ChartModalChart[],
    product?: SizingProduct | null,
    initialCategory?: string | null
  ) => void;
  closeChartModal: () => void;
  openGapModal: (item: GapItem) => void;
  openGapModalById: (id: string) => void;
  closeGapModal: () => void;
  saveGapItem: (item: GapItem) => void;
  completeAllGaps: () => void;

  updateFilterConfig: (id: string, patch: Partial<CategoryFilterConfig>) => void;
}

function clampStage(value: number): StageNumber {
  return Math.min(LAST_STAGE, Math.max(1, value)) as StageNumber;
}

/** Live poll timer. Module-level rather than in state: it is not rendered, and putting a timer id in
 *  a store means every tick's `set` re-renders every subscriber for no visible reason. */
let pollTimer: ReturnType<typeof setTimeout> | null = null;

/** The run read in progress, so several screens mounting together share one request. */
let runInFlight: Promise<void> | null = null;
/** When the run was last read successfully. */
let runReadAt = 0;
/** How long an idle run read satisfies an `ifStale` mount. A working run is kept current by the poll,
 *  and every write re-reads explicitly, so this only spares the stage-to-stage re-reads. */
const RUN_FRESH_MS = 10_000;

/** Identifies the newest sample request so a slower earlier one can't overwrite it. Without this, a
 *  merchant typing in the search box can end up looking at results for a prefix of what they typed,
 *  because responses are not guaranteed to arrive in the order they were sent. */
let sampleRequestId = 0;

/**
 * State for the size-intelligence pipeline.
 *
 * Split down the middle, and the split is the thing to keep straight. The scan, brand classification
 * and chart research are real: `run`, `summary` and `charts` come from the server and are
 * authoritative, which is what lets a merchant refresh mid-scan without losing progress. Gap-fill
 * templates (`gapItems`) and filter margins are still seeded from `./mocks`, because the backends
 * behind them do not exist yet — a chart *gap* is real and comes from the server, but the editable
 * template you fill it in with is not.
 *
 * Kept out of `useStoreConnectionStore` because stage navigation is genuinely per-session UI, while
 * the connection store models a persisted record.
 */
export const useSizingStore = create<SizingUiState>((set, get) => ({
  stage: 1,
  highestStage: 1,
  stageRestored: false,
  extractionDone: false,
  gapItems: INITIAL_GAP_ITEMS,
  filterConfigs: INITIAL_FILTER_CONFIGS,
  chartModal: null,
  gapModalItem: null,

  run: null,
  summary: EMPTY_COVERAGE_SUMMARY,
  identification: EMPTY_IDENTIFICATION,
  routing: EMPTY_ROUTING,
  mappingApproved: false,
  lastPublishedAt: null,
  personaMappingUpdatedAt: null,
  runLoading: false,
  runError: null,
  startingRun: false,
  brandMappingStatus: "needs_mapping",
  brandMapping: null,
  brandMappingLoading: false,
  brandMappingSaving: false,
  brandMappingError: null,
  brandMappingEditing: false,

  loadRun: async (options) => {
    if (options?.ifStale && !options.restoreStage) {
      if (runInFlight) return runInFlight;
      // A working run is never skipped: a stage leaving may have broken the poll chain, and this
      // read is what restarts it.
      const idle = get().run !== null && !isRunWorking(get().run);
      if (idle && Date.now() - runReadAt < RUN_FRESH_MS) return;
    }
    const request = readRun(options);
    runInFlight = request;
    try {
      await request;
    } finally {
      if (runInFlight === request) runInFlight = null;
    }
  },

  startRun: async () => {
    if (get().startingRun) return;
    set({ startingRun: true, runError: null });

    try {
      const res = await fetch("/api/store-connection/sizing/run", { method: "POST" });
      const data = (await res.json()) as { run?: SizingRun; error?: string };

      if (!res.ok) {
        set({ runError: data.error ?? "Could not start the scan", startingRun: false });
        return;
      }

      // A new scan invalidates the cached preview and its classifications. Keeping either would show
      // the previous run's Global/Private answers while the new complete brand list is still being
      // classified.
      clearSamplePages();
      set({
        run: data.run ?? null,
        startingRun: false,
        sample: [],
        samplePage: 1,
        sampleCursors: [null],
        sampleNextCursor: null,
        sampleTotal: null,
        sampleFilteredTotal: null,
        sampleTypeCounts: null,
        sampleTypeItemCounts: null,
        sampleParentCounts: null,
        sampleLoaded: false,
        sampleScanned: false,
      });
      // Straight into the poll chain so the counter starts moving without waiting an interval.
      void get().loadRun();
    } catch {
      set({ runError: "Could not reach the server", startingRun: false });
    }
  },

  loadBrandMapping: async (options) => {
    if (!options?.force && (get().brandMappingLoading || get().brandMapping !== null)) return;
    set({ brandMappingLoading: true, brandMappingError: null });
    try {
      const res = await fetch("/api/store-connection/sizing/brand-mapping");
      const data = (await res.json()) as BrandMappingResponse & { error?: string };
      if (!res.ok) {
        set({
          brandMappingLoading: false,
          brandMappingError: data.error ?? "Could not load canonical brand mapping",
        });
        return;
      }
      set({
        brandMapping: data,
        brandMappingStatus: data.status,
        brandMappingLoading: false,
        brandMappingError: null,
      });
    } catch {
      set({ brandMappingLoading: false, brandMappingError: "Could not reach the server" });
    }
  },

  saveBrandMapping: async (groups, privateGroups) => {
    if (get().brandMappingSaving) return false;
    set({ brandMappingSaving: true, brandMappingError: null });
    try {
      const res = await fetch("/api/store-connection/sizing/brand-mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(privateGroups ? { groups, privateGroups } : { groups }),
      });
      const data = (await res.json()) as BrandMappingResponse & { error?: string };
      if (!res.ok) {
        set({
          brandMappingSaving: false,
          brandMappingError: data.error ?? "Could not save canonical brand mapping",
        });
        return false;
      }
      set({
        brandMapping: data,
        brandMappingStatus: data.status,
        brandMappingSaving: false,
        brandMappingEditing: false,
        brandMappingError: null,
        chartBrands: [],
        charts: [],
        chartGapsNotFound: [],
        chartGapsGlobal: [],
        chartGapsNoBrand: [],
        chartTotals: EMPTY_CHARTS_RESPONSE.totals,
        chartLeafCounts: [],
        chartLeafSources: {},
        chartsResearched: false,
        chartsLoaded: false,
      });
      return true;
    } catch {
      set({ brandMappingSaving: false, brandMappingError: "Could not reach the server" });
      return false;
    }
  },

  openBrandMappingEditor: () => set({ brandMappingEditing: true, brandMappingError: null }),
  closeBrandMappingEditor: () => set({ brandMappingEditing: false, brandMappingError: null }),

  continueRun: async () => {
    try {
      await fetch("/api/store-connection/sizing/run/continue", { method: "POST" });
    } catch {
      // Best-effort: the next scheduled poll (or a manual refresh) still picks up whatever state
      // the server is actually in, so a dropped request here does not strand the pipeline.
    }
    void get().loadRun();
  },

  stopPolling: () => {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  },

  chartBrands: [],
  charts: [],
  chartGapsNotFound: [],
  chartGapsGlobal: [],
  chartGapsNoBrand: [],
  chartTotals: EMPTY_CHARTS_RESPONSE.totals,
  chartLeafCounts: [],
  chartLeafSources: {},
  chartsResearched: false,
  chartsLoading: false,
  chartsError: null,
  chartsLoaded: false,

  loadCharts: async (options) => {
    // Cached after the first read like the catalog sample, for the same reason: nothing about a
    // stored chart changes while the merchant reads it, and this response carries every measurement
    // table at once. `force` is the research poll and a manual refresh.
    if (!options?.force && (get().chartsLoaded || get().chartsLoading)) return;
    set({ chartsLoading: true, chartsError: null });

    try {
      const res = await fetch("/api/store-connection/sizing/charts");
      const data = (await res.json()) as Partial<SizingChartsResponse> & { error?: string };

      if (!res.ok) {
        set({ chartsError: data.error ?? "Could not load the researched charts", chartsLoading: false });
        return;
      }

      set({
        chartBrands: data.brands ?? [],
        charts: data.charts ?? [],
        chartGapsNotFound: data.notFound ?? [],
        chartGapsGlobal: data.globalGaps ?? [],
        chartGapsNoBrand: data.noBrand ?? [],
        chartTotals: data.totals ?? EMPTY_CHARTS_RESPONSE.totals,
        chartLeafCounts: data.leafCounts ?? [],
        chartLeafSources: data.leafSources ?? {},
        mappedLeaves: data.mappedLeaves ?? [],
        chartsResearched: data.researched ?? false,
        chartsLoading: false,
        chartsError: null,
        chartsLoaded: true,
      });
    } catch {
      set({ chartsError: "Could not reach the server", chartsLoading: false });
    }
  },

  researchStarting: null,

  startResearch: async (options) => {
    if (get().researchStarting !== null) return;
    set({ chartsError: null, researchStarting: options?.brandKey ?? "__all__" });

    try {
      const res = await fetch("/api/store-connection/sizing/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(options?.brandKey ? { brandKey: options.brandKey } : {}),
          ...(options?.force ? { force: true } : {}),
        }),
      });
      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        set({ chartsError: data.error ?? "Could not start chart research", researchStarting: null });
        return;
      }

      // The queued run is what the stage reads to show its Queued and Researching rows, so the poll
      // has to restart before the flag clears — otherwise the table reads as idle for one interval,
      // which is indistinguishable from the request having done nothing. The brand rows come from the
      // charts endpoint, which joins against that same scope.
      await get().loadRun();
      await get().loadCharts({ force: true });
      set({ researchStarting: null });
    } catch {
      set({ chartsError: "Could not reach the server", researchStarting: null });
    }
  },

  manualChartTarget: null,

  openManualChart: (gap) => {
    // The server already knows which stocked leaves no chart claims, so a partially charted pair opens
    // on only what is left. The leaf-count derivation remains for a scan with no leaf-level coverage.
    const coversLeaves = gap.missingLeaves?.length
      ? [...gap.missingLeaves]
      : manualChartLeaves(
          get().chartLeafCounts
            .filter((entry) => entry.skuCount > 0)
            .map((entry) => ({
              brandKey: entry.brandKey,
              sizingCategory: personaSizingGroup(entry.leafKey.split(":")[1] ?? "") ?? "",
              categoryId: entry.leafKey,
            })),
          gap.brandKey,
          gap.sizingCategory,
        );
    set({
      manualChartTarget: {
        id: gap.id,
        brandKey: gap.brandKey,
        brandName: gap.brandName,
        sizingCategory: gap.sizingCategory,
        skuCount: gap.skuCount,
        reason: gap.reason,
        // Left blank rather than guessed. The variant is what Phase 5 assigns a category path to,
        // so a default of "Men" on an unbranded womenswear gap would be a wrong answer that reads
        // as a filled field nobody needs to check.
        variantName: "",
        // Exact brand/category paths only. The editor used to offer every mapped leaf in the store,
        // which let a men's private footwear gap claim unrelated women's and kids products.
        coversLeaves,
      },
    });
  },

  editManualChart: (chart) => {
    if (chart.shared || !isSizingGroup(chart.sizingCategory)) return;
    const { chartGapsNotFound, chartGapsNoBrand } = get();
    const uncovered = [...chartGapsNotFound, ...chartGapsNoBrand]
      .filter((gap) => gap.brandKey === chart.brandKey && gap.sizingCategory === chart.sizingCategory)
      .flatMap((gap) => gap.missingLeaves ?? []);
    set({
      manualChartTarget: {
        id: chart.id,
        chartId: chart.id,
        brandKey: chart.brandKey,
        brandName: chart.brand,
        sizingCategory: chart.sizingCategory,
        skuCount: chart.skuCount,
        reason: "Editing saved private chart",
        variantName: chart.variantName,
        seedRows: draftRowsFrom(chart.chartRows, chart.sizingCategory, chart.audience),
        audience: chart.audience,
        coversLeaves: [...new Set([...chart.coversLeaves, ...uncovered])],
        selectedLeaves: [...chart.coversLeaves],
        editing: true,
      },
    });
  },

  closeManualChart: () => set({ manualChartTarget: null }),

  saveManualChart: async ({ rows, variantName, coversLeaves, audience, keepOpen = false }) => {
    const target = get().manualChartTarget;
    if (!target) return "Nothing to save.";

    try {
      const res = await fetch("/api/store-connection/sizing/charts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandKey: target.brandKey,
          chartId: target.chartId ?? null,
          sizingCategory: target.sizingCategory,
          variantName,
          rows,
          // Sent even when undefined (becomes `null`, which the route reads the same as absent):
          // without it the route's `sanitizeCoverage` falls back to `unisex`, which silently drops
          // every kids/boys/girls leaf a merchant just checked.
          audience: audience ?? target.audience ?? null,
          coversLeaves,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return data.error ?? "Could not save this chart.";

      if (!keepOpen) set({ manualChartTarget: null });
      // Forced, because the filled gap has to move out of the gap tab and into the chart list. A
      // cached read would leave the merchant looking at the gap they just resolved.
      await get().loadCharts({ force: true });
      return null;
    } catch {
      return "Could not reach the server.";
    }
  },

  mappedLeaves: [],

  sample: [],
  samplePage: 1,
  samplePageSize: 25,
  sampleCursors: [null],
  sampleNextCursor: null,
  sampleTotal: null,
  sampleTotalExact: true,
  sampleFilteredTotal: null,
  sampleTypeCounts: null,
  sampleTypeItemCounts: null,
  sampleParentCounts: null,
  sampleBrandType: null,
  sampleParent: null,
  sampleQuery: "",
  sampleLoading: false,
  sampleError: null,
  sampleLoaded: false,
  sampleScanned: false,

  loadSample: async (options) => {
    // Cached after the first read: this pages the merchant's live store, so re-fetching on every
    // visit to stage 2 would hit their API for data that hasn't changed. `force` is the refresh
    // button, which re-reads whichever page is open.
    if (!options?.force && get().sampleLoaded) return;
    // Refresh re-counts too: the usual reason to press it is having changed the category selection
    // in another tab, which is exactly when the held total is the stale part.
    if (options?.force) {
      clearSamplePages();
      set({ sampleTotal: null });
    }
    await get().goToSamplePage(get().samplePage, { fresh: options?.force === true });
  },

  invalidateSamplePages: () => clearSamplePages(),

  invalidateBrandDerived: () => {
    clearSamplePages();
    // Not blanked: the screens keep what they show and re-read it the next time they open.
    set({ sampleLoaded: false, brandMapping: null, chartsLoaded: false });
  },

  goToSamplePage: async (page, options) => {
    const { samplePageSize, sampleCursors } = get();
    const cursor = sampleCursors[page - 1] ?? null;

    // Only reachable positions are ever requested: a page is either the first, one we already hold a
    // cursor for, or the one directly after the page in hand.
    if (page > 1 && !cursor) return;

    const requestId = ++sampleRequestId;

    try {
      const pageParams = (pageCursor: string | null) => {
        const params = new URLSearchParams({ pageSize: String(samplePageSize) });
        if (pageCursor) params.set("cursor", pageCursor);
        if (get().sampleBrandType) params.set("brandType", get().sampleBrandType!);
        if (get().sampleParent) params.set("parent", get().sampleParent!);
        if (get().sampleQuery) params.set("q", get().sampleQuery);
        return params;
      };
      const params = pageParams(cursor);
      const key = samplePageKey(params);
      // A page read this session paints at once. Not when the held total is still unknown and the
      // cached page never carried one, or "All items" would stay blank.
      const cached = options?.fresh ? null : cachedSamplePage(key);
      const usable = cached && (get().sampleTotal !== null || cached.selectionTotal != null) ? cached : null;
      const pending = usable || options?.fresh ? undefined : samplePrefetches.get(key);
      if (!usable) set({ sampleLoading: true, sampleError: null });

      // Asked for once and then carried. The server derives it from coverage, because "All items"
      // means the five sizing families and excludes Main-category-only products.
      if (get().sampleTotal === null) params.set("count", "1");
      // A deliberate refresh re-reads these products from the store instead of the recent read.
      if (options?.fresh) params.set("fresh", "1");

      let data: Partial<SizingSampleResponse> & { error?: string };
      if (usable) {
        data = usable;
      } else {
        const prefetched = pending ? await pending : null;
        if (prefetched && (get().sampleTotal !== null || prefetched.selectionTotal != null)) {
          data = prefetched;
        } else {
          const read = await fetchSamplePage(params);
          // Superseded while in flight — another filter or page was requested after this one.
          if (requestId !== sampleRequestId) return;
          if (!read.ok) {
            set({ sampleError: read.data.error ?? "Could not load a catalog sample", sampleLoading: false });
            return;
          }
          data = read.data;
          rememberSamplePage(key, data);
        }
      }

      if (requestId !== sampleRequestId) return;
      if (data.nextCursor) prefetchSamplePage(pageParams(data.nextCursor));

      // Truncated at the page just read before appending, so a re-read that now reports a different
      // next position can't leave stale cursors for pages beyond it still sitting in the history.
      const cursors = get().sampleCursors.slice(0, page);
      cursors[page - 1] = cursor;
      if (data.nextCursor) cursors[page] = data.nextCursor;

      set({
        sample: data.rows ?? [],
        samplePage: page,
        sampleCursors: cursors,
        sampleNextCursor: data.nextCursor ?? null,
        // Absent on a page that didn't ask for a count, so the held total is kept rather than
        // blanked back to "unknown" on every page turn.
        sampleTotal: data.selectionTotal ?? get().sampleTotal,
        sampleTotalExact: data.selectionTotalExact ?? get().sampleTotalExact,
        // Assigned rather than defaulted, because null is the answer when no filter is on — carrying
        // the previous filter's number forward is what put its count beside "All items".
        sampleFilteredTotal: data.filteredTotal ?? null,
        sampleTypeCounts: data.typeCounts ?? get().sampleTypeCounts,
        sampleTypeItemCounts: data.typeItemCounts ?? get().sampleTypeItemCounts,
        sampleParentCounts: data.parentCounts ?? get().sampleParentCounts,
        // Assigned, not defaulted: this page's brand column is only as good as the coverage that
        // existed when it was read, and carrying a previous read's `true` forward would hide the
        // pending state on a page loaded before bulk classification.
        sampleScanned: data.scanned === true,
        sampleLoading: false,
        sampleError: null,
        sampleLoaded: true,
      });
    } catch {
      if (requestId === sampleRequestId) {
        set({ sampleError: "Could not reach the server", sampleLoading: false });
      }
    }
  },

  setSamplePageSize: async (size) => {
    if (size === get().samplePageSize) return;
    // Every cursor is relative to the page size that produced it — a Woo page number means a
    // different slice at 50 per page than at 25 — so the history is discarded rather than reused.
    set({ samplePageSize: size, samplePage: 1, sampleCursors: [null], sampleNextCursor: null });
    await get().goToSamplePage(1);
  },

  // Cursors describe positions in the previous filter's result sequence, so they mean nothing under a
  // new one and paging has to restart. `sampleTotal` is deliberately left alone: it counts the
  // selection, not the filter, so re-requesting it here would only spend another store request to
  // get the same number back.
  setSampleBrandType: async (type) => {
    if (type === get().sampleBrandType) return;
    set({ sampleBrandType: type, samplePage: 1, sampleCursors: [null], sampleNextCursor: null });
    await get().goToSamplePage(1);
  },

  setSampleParent: async (parent) => {
    if (parent === get().sampleParent) return;
    set({ sampleParent: parent, samplePage: 1, sampleCursors: [null], sampleNextCursor: null });
    await get().goToSamplePage(1);
  },

  setSampleQuery: async (query) => {
    const trimmed = query.trim();
    if (trimmed === get().sampleQuery) return;
    set({ sampleQuery: trimmed, samplePage: 1, sampleCursors: [null], sampleNextCursor: null });
    await get().goToSamplePage(1);
  },

  goToStage: (stage) =>
    set((state) => ({
      stage,
      highestStage: stage > state.highestStage ? stage : state.highestStage,
    })),

  nextStage: () => get().goToStage(clampStage(get().stage + 1)),
  prevStage: () => get().goToStage(clampStage(get().stage - 1)),

  // Deliberately leaves `run` and `summary` alone. "Run setup again" walks the merchant back through
  // the stages; it does not discard a completed scan, which would throw away real work and a paid
  // classification to reset a stepper.
  resetPipeline: () =>
    set({
      stage: 1,
      highestStage: 1,
      extractionDone: false,
      gapItems: INITIAL_GAP_ITEMS,
      chartModal: null,
      gapModalItem: null,
    }),

  setExtractionDone: (done) => set({ extractionDone: done }),

  openChartModal: (charts, product = null, initialCategory = null) =>
    set({
      chartModal: {
        charts: Array.isArray(charts) ? [...charts] : [charts],
        product,
        initialCategory,
      },
    }),
  closeChartModal: () => set({ chartModal: null }),

  openGapModal: (item) => set({ gapModalItem: item }),
  openGapModalById: (id) => {
    const item = get().gapItems.find((gap) => gap.id === id);
    if (item) set({ gapModalItem: item });
  },
  closeGapModal: () => set({ gapModalItem: null }),

  saveGapItem: (item) =>
    set((state) => ({
      gapItems: state.gapItems.map((gap) => (gap.id === item.id ? item : gap)),
      gapModalItem: null,
    })),

  completeAllGaps: () =>
    set((state) => ({
      gapItems: state.gapItems.map((gap) => ({ ...gap, status: "complete" as const })),
    })),

  updateFilterConfig: (id, patch) =>
    set((state) => ({
      filterConfigs: state.filterConfigs.map((config) =>
        config.id === id ? { ...config, ...patch } : config
      ),
    })),
}));

/** One read of the run and everything the stages derive from it. `loadRun` decides whether to call
 *  this; the poll goes through `loadRun` without `ifStale`, so it always reads. */
async function readRun(options?: { restoreStage?: boolean; preferredStage?: StageNumber }): Promise<void> {
  const { getState: get, setState: set } = useSizingStore;
  // Only the first read shows a spinner. A poll that flipped this would make the whole stage
  // flash between the brand list and a loading state every couple of seconds.
  if (!get().run) set({ runLoading: true });

  try {
    const res = await fetch("/api/store-connection/sizing/run");
    const data = (await res.json()) as SizingRunResponse & { error?: string };

    if (!res.ok) {
      set({ runError: data.error ?? "Could not load the sizing run", runLoading: false });
      return;
    }

    // Normal polling never moves navigation. Setup mount can explicitly restore it once, using a
    // persisted preferred stage when that stage is not ahead of authoritative server progress.
    const serverStage = stageForRun(data.run);
    const shouldRestore =
      options?.restoreStage === true ||
      (!get().stageRestored && get().highestStage === 1);
    const preferredStage = options?.preferredStage;
    const landing = shouldRestore
      ? preferredStage && preferredStage <= serverStage
        ? preferredStage
        : serverStage
      : null;
    const previousRun = get().run;
    const scanRestarted =
      previousRun !== null && !isScanIncomplete(previousRun) && isScanIncomplete(data.run);
    if (scanRestarted) clearSamplePages();
    runReadAt = Date.now();

    set({
      run: data.run,
      summary: data.summary ?? EMPTY_COVERAGE_SUMMARY,
      identification: data.identification ?? EMPTY_IDENTIFICATION,
      routing: data.routing ?? EMPTY_ROUTING,
      mappingApproved: data.mappingApproved,
      lastPublishedAt: data.lastPublishedAt ?? null,
      personaMappingUpdatedAt: data.personaMappingUpdatedAt ?? null,
      runLoading: false,
      runError: null,
      ...(scanRestarted
        ? {
            sample: [],
            samplePage: 1,
            sampleCursors: [null],
            sampleNextCursor: null,
            sampleTotal: null,
            sampleFilteredTotal: null,
            sampleTypeCounts: null,
            sampleTypeItemCounts: null,
            sampleParentCounts: null,
            sampleLoaded: false,
            sampleScanned: false,
          }
        : {}),
      ...(landing !== null
        ? {
            stage: landing,
            highestStage: Math.max(get().highestStage, serverStage) as StageNumber,
            stageRestored: true,
          }
        : {}),
    });

    // Self-rescheduling rather than a fixed interval, so a slow response can never stack up
    // overlapping requests, and the chain stops the moment the run stops working.
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = isRunWorking(data.run) ? setTimeout(() => void get().loadRun(), POLL_INTERVAL_MS) : null;
  } catch {
    set({ runError: "Could not reach the server", runLoading: false });
  }
}

/**
 * Item Preview pages already read this session, keyed by everything the server filters and pages
 * on. Paging back, or returning to Stage 2, then paints without a request. Cleared by anything that
 * changes what a page holds: a new scan, a brand-type or parent correction, and the refresh button.
 * The age limit bounds how stale price and stock can get; the server's own store-read cache is
 * longer than this, so a re-read inside it would return the same rows anyway.
 */
const samplePages = new Map<string, { at: number; data: Partial<SizingSampleResponse> }>();
const SAMPLE_PAGE_TTL_MS = 5 * 60_000;
const MAX_SAMPLE_PAGES = 60;
/** Next pages being read ahead, so a fast Next click joins the read instead of starting another. */
const samplePrefetches = new Map<string, Promise<Partial<SizingSampleResponse> | null>>();

export function clearSamplePages(): void {
  samplePages.clear();
  samplePrefetches.clear();
}

function samplePageKey(params: URLSearchParams): string {
  const keyed = new URLSearchParams(params);
  keyed.delete("count");
  keyed.delete("fresh");
  keyed.sort();
  return keyed.toString();
}

function cachedSamplePage(key: string): Partial<SizingSampleResponse> | null {
  const hit = samplePages.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > SAMPLE_PAGE_TTL_MS) {
    samplePages.delete(key);
    return null;
  }
  return hit.data;
}

function rememberSamplePage(key: string, data: Partial<SizingSampleResponse>): void {
  samplePages.delete(key);
  samplePages.set(key, { at: Date.now(), data });
  while (samplePages.size > MAX_SAMPLE_PAGES) {
    const oldest = samplePages.keys().next().value;
    if (oldest === undefined) break;
    samplePages.delete(oldest);
  }
}

async function fetchSamplePage(params: URLSearchParams): Promise<{ ok: boolean; data: Partial<SizingSampleResponse> & { error?: string } }> {
  const res = await fetch(`/api/store-connection/sizing/sample?${params.toString()}`);
  const data = (await res.json()) as Partial<SizingSampleResponse> & { error?: string };
  return { ok: res.ok, data };
}

/** Reads the page after the one just shown, into the page cache only. Never touches what is shown,
 *  and a failure is simply a page that will be read when asked for. */
function prefetchSamplePage(params: URLSearchParams): void {
  const key = samplePageKey(params);
  if (cachedSamplePage(key) || samplePrefetches.has(key)) return;
  const promise: Promise<Partial<SizingSampleResponse> | null> = fetchSamplePage(params)
    .then(({ ok, data }) => {
      if (!ok) return null;
      // `clearSamplePages` empties the prefetch map, so a read that outlived a clear (and may
      // describe the previous scan) is no longer the registered one and is dropped.
      if (samplePrefetches.get(key) === promise) rememberSamplePage(key, data);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      if (samplePrefetches.get(key) === promise) samplePrefetches.delete(key);
    });
  samplePrefetches.set(key, promise);
}
