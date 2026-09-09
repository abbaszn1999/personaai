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
  isRunWorking,
  type BrandIdentification,
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
import { isSizingGroup } from "@/lib/sizing/measurements";
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
}

interface ChartModalTarget {
  /** Either a real researched chart or one of the mock-fed sync views' charts. Both carry the
   *  display fields the modal renders, so it can show either without knowing which it has. */
  chart: FoundSizeChart | ResearchedChart;
  /** Set when the chart was opened from a specific product rather than a brand row. */
  product: SizingProduct | null;
}

/** How often a working run is re-read. Fast enough that the scan's product counter visibly moves,
 *  slow enough that a long walk isn't a request per second for several minutes. */
const POLL_INTERVAL_MS = 2_000;

interface SizingUiState {
  stage: StageNumber;
  /** High-water mark, so a merchant can revisit a finished stage but not skip ahead. */
  highestStage: StageNumber;
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
  /** True only for the initial read, so a poll refresh never blanks the stage back to a spinner. */
  runLoading: boolean;
  runError: string | null;
  /** Set while a start request is in flight, so the button can't be double-fired. */
  startingRun: boolean;

  loadRun: () => Promise<void>;
  startRun: () => Promise<void>;
  /** Unblocks the run's current stage server-side, then resumes polling so the new stage's progress
   *  is visible immediately instead of waiting a full poll interval. */
  continueRun: () => Promise<void>;
  stopPolling: () => void;

  // ─── Stage 4: researched charts ────────────────────────────────────────────
  /** Charts research produced, one per (brand x sizing category). */
  charts: ResearchedChart[];
  /** Global brands research came back empty on, plus every private label — doc Tab 3 sends both to
   *  the same manual-fill queue, so they share a tab. */
  chartGapsNotFound: ChartGap[];
  /** The unbranded rows, grouped by category instead of brand. */
  chartGapsNoBrand: ChartGap[];
  chartTotals: SizingChartsResponse["totals"];
  /** False until a research pass has recorded an outcome — what separates "no gaps" from "not run". */
  chartsResearched: boolean;
  chartsLoading: boolean;
  chartsError: string | null;
  chartsLoaded: boolean;
  loadCharts: (options?: { force?: boolean }) => Promise<void>;
  /**
   * Sends the run back to the research stage, for every global brand or for one.
   *
   * Needed because Stage 4 previously had no way to try again: the run parked at `gap_fill` and the
   * only route that moved it advanced rather than rewound. The server clears the recorded outcomes
   * and the researched charts as part of this, so the registry short-circuit does not skip exactly
   * the brands whose charts prompted the re-run.
   */
  rerunResearch: (brandKey?: string) => Promise<void>;
  rerunning: boolean;

  // ─── Stage 4: manual chart entry (doc Part 4) ──────────────────────────────
  /** The gap being hand-filled, or the researched chart being forked. Null when the modal is shut. */
  manualChartTarget: ManualChartTarget | null;
  /** Opens the editor on a gap from the Not Found or No Brand tab. */
  openManualChart: (gap: ChartGap) => void;
  /** Doc Part 6's answer to editing a shared chart: fork it into a merchant-owned variant rather
   *  than overwrite a row every other store reads. Researched charts stay read-only. */
  forkChart: (chart: ResearchedChart) => void;
  closeManualChart: () => void;
  /** Returns an error message, or null on success. Reloads Stage 4 so the filled gap moves out of
   *  the gap tab and into the chart list without a manual refresh. */
  saveManualChart: (input: { rows: ChartDraftRow[]; variantName: string }) => Promise<string | null>;

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
  /** Products across the whole selection, null until the first page has come back with a count. */
  sampleTotal: number | null;
  /** False when the total is a sum across category groups and so overstates any product filed in
   *  more than one. */
  sampleTotalExact: boolean;
  /** Sized stock per brand type across the whole selection, null before a scan has classified. */
  sampleTypeCounts: Record<ServerBrandType, number> | null;
  /** Applied filters. Held here rather than in the component because the server does the filtering —
   *  a brand type only some later page carries would be invisible to a filter over the loaded page. */
  sampleBrandType: ServerBrandType | null;
  sampleQuery: string;
  sampleLoading: boolean;
  sampleError: string | null;
  /** Distinguishes "not read yet" from "read and genuinely empty", so an empty selection doesn't
   *  re-request the store on every mount. */
  sampleLoaded: boolean;
  loadSample: (options?: { force?: boolean }) => Promise<void>;
  goToSamplePage: (page: number) => Promise<void>;
  setSamplePageSize: (size: number) => Promise<void>;
  setSampleBrandType: (type: ServerBrandType | null) => Promise<void>;
  setSampleQuery: (query: string) => Promise<void>;

  goToStage: (stage: StageNumber) => void;
  nextStage: () => void;
  prevStage: () => void;
  resetPipeline: () => void;

  setExtractionDone: (done: boolean) => void;

  openChartModal: (chart: FoundSizeChart | ResearchedChart, product?: SizingProduct | null) => void;
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
  runLoading: false,
  runError: null,
  startingRun: false,

  loadRun: async () => {
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

      set({
        run: data.run,
        summary: data.summary ?? EMPTY_COVERAGE_SUMMARY,
        identification: data.identification ?? EMPTY_IDENTIFICATION,
        routing: data.routing ?? EMPTY_ROUTING,
        mappingApproved: data.mappingApproved,
        runLoading: false,
        runError: null,
      });

      // Self-rescheduling rather than a fixed interval, so a slow response can never stack up
      // overlapping requests, and the chain stops the moment the run stops working.
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = isRunWorking(data.run) ? setTimeout(() => void get().loadRun(), POLL_INTERVAL_MS) : null;
    } catch {
      set({ runError: "Could not reach the server", runLoading: false });
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

      set({ run: data.run ?? null, startingRun: false });
      // Straight into the poll chain so the counter starts moving without waiting an interval.
      void get().loadRun();
    } catch {
      set({ runError: "Could not reach the server", startingRun: false });
    }
  },

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

  charts: [],
  chartGapsNotFound: [],
  chartGapsNoBrand: [],
  chartTotals: EMPTY_CHARTS_RESPONSE.totals,
  chartsResearched: false,
  chartsLoading: false,
  chartsError: null,
  chartsLoaded: false,

  loadCharts: async (options) => {
    // Cached after the first read like the catalog sample, for the same reason: nothing about a
    // stored chart changes while the merchant reads it, and this response carries every measurement
    // table at once. `force` is the "Research again" path and a manual refresh.
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
        charts: data.charts ?? [],
        chartGapsNotFound: data.notFound ?? [],
        chartGapsNoBrand: data.noBrand ?? [],
        chartTotals: data.totals ?? EMPTY_CHARTS_RESPONSE.totals,
        chartsResearched: data.researched ?? false,
        chartsLoading: false,
        chartsError: null,
        chartsLoaded: true,
      });
    } catch {
      set({ chartsError: "Could not reach the server", chartsLoading: false });
    }
  },

  rerunResearch: async (brandKey) => {
    set({ chartsError: null, rerunning: true });

    try {
      const res = await fetch("/api/store-connection/sizing/research/rerun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brandKey ? { brandKey } : {}),
      });
      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        set({ chartsError: data.error ?? "Could not re-run chart research", rerunning: false });
        return;
      }

      // The rewound run is what the stage reads to show its searching state, so the poll has to
      // restart before the flag clears — otherwise the screen shows the old results as settled for
      // one interval, which is indistinguishable from the re-run having done nothing.
      await get().loadRun();
      set({ rerunning: false });
    } catch {
      set({ chartsError: "Could not reach the server", rerunning: false });
    }
  },

  rerunning: false,

  manualChartTarget: null,

  openManualChart: (gap) =>
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
      },
    }),

  forkChart: (chart) =>
    set({
      manualChartTarget: {
        id: `fork-${chart.id}`,
        brandKey: chart.brandKey,
        brandName: chart.brand,
        sizingCategory: chart.sizingCategory,
        skuCount: chart.skuCount,
        reason: "Your own copy — the researched chart is left untouched",
        // Renamed rather than reused: the fork is written scoped to this connection, and sharing a
        // name with the researched row is what makes `chart-results` treat it as a replacement
        // instead of an addition. A merchant wanting to replace can delete the suffix.
        variantName: `${chart.variantName} (edited)`,
        seedRows: isSizingGroup(chart.sizingCategory)
          ? draftRowsFrom(chart.chartRows, chart.sizingCategory)
          : undefined,
      },
    }),

  closeManualChart: () => set({ manualChartTarget: null }),

  saveManualChart: async ({ rows, variantName }) => {
    const target = get().manualChartTarget;
    if (!target) return "Nothing to save.";

    try {
      const res = await fetch("/api/store-connection/sizing/charts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandKey: target.brandKey,
          sizingCategory: target.sizingCategory,
          variantName,
          rows,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return data.error ?? "Could not save this chart.";

      set({ manualChartTarget: null });
      // Forced, because the filled gap has to move out of the gap tab and into the chart list. A
      // cached read would leave the merchant looking at the gap they just resolved.
      await get().loadCharts({ force: true });
      return null;
    } catch {
      return "Could not reach the server.";
    }
  },

  sample: [],
  samplePage: 1,
  samplePageSize: 25,
  sampleCursors: [null],
  sampleNextCursor: null,
  sampleTotal: null,
  sampleTotalExact: true,
  sampleTypeCounts: null,
  sampleBrandType: null,
  sampleQuery: "",
  sampleLoading: false,
  sampleError: null,
  sampleLoaded: false,

  loadSample: async (options) => {
    // Cached after the first read: this pages the merchant's live store, so re-fetching on every
    // visit to stage 2 would hit their API for data that hasn't changed. `force` is the refresh
    // button, which re-reads whichever page is open.
    if (!options?.force && get().sampleLoaded) return;
    // Refresh re-counts too: the usual reason to press it is having changed the category selection
    // in another tab, which is exactly when the held total is the stale part.
    if (options?.force) set({ sampleTotal: null });
    await get().goToSamplePage(get().samplePage);
  },

  goToSamplePage: async (page) => {
    const { samplePageSize, sampleCursors } = get();
    const cursor = sampleCursors[page - 1] ?? null;

    // Only reachable positions are ever requested: a page is either the first, one we already hold a
    // cursor for, or the one directly after the page in hand.
    if (page > 1 && !cursor) return;

    const requestId = ++sampleRequestId;
    set({ sampleLoading: true, sampleError: null });

    try {
      const params = new URLSearchParams({ pageSize: String(samplePageSize) });
      if (cursor) params.set("cursor", cursor);
      if (get().sampleBrandType) params.set("brandType", get().sampleBrandType!);
      if (get().sampleQuery) params.set("q", get().sampleQuery);
      // Counting costs an extra request against the merchant's store, and the answer is the same on
      // every page — so it is asked for once and then carried. It stays the selection's total
      // regardless of filters, which is what the "All items" chip reports.
      if (get().sampleTotal === null) params.set("count", "1");

      const res = await fetch(`/api/store-connection/sizing/sample?${params.toString()}`);
      const data = (await res.json()) as Partial<SizingSampleResponse> & { error?: string };

      // Superseded while in flight — another filter or page was requested after this one.
      if (requestId !== sampleRequestId) return;

      if (!res.ok) {
        set({ sampleError: data.error ?? "Could not load a catalog sample", sampleLoading: false });
        return;
      }

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
        sampleTotal: data.total ?? get().sampleTotal,
        sampleTotalExact: data.totalExact ?? get().sampleTotalExact,
        sampleTypeCounts: data.typeCounts ?? get().sampleTypeCounts,
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

  setSampleBrandType: async (type) => {
    if (type === get().sampleBrandType) return;
    // Cursors describe positions in the previous filter's result sequence, so they mean nothing
    // under a new one and paging has to restart.
    //
    // `sampleTotal` is reset too, which used to be unnecessary: every filter shared the same
    // catalog-wide number, so whatever was cached stayed correct as filters changed. Now that a
    // brand-type filter gets its own exact denominator from coverage, holding onto the previous
    // filter's number would show "28" as the total the moment you switched from Private back to
    // All items. Forcing a fresh request is what keeps the two in sync.
    set({
      sampleBrandType: type,
      samplePage: 1,
      sampleCursors: [null],
      sampleNextCursor: null,
      sampleTotal: null,
    });
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

  openChartModal: (chart, product = null) => set({ chartModal: { chart, product } }),
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
