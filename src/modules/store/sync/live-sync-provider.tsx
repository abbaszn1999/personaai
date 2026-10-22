"use client";

import * as React from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { draftRowsFrom } from "@/lib/sizing/chart-draft";
import { manualChartLeaves } from "@/lib/sizing/manual-chart-coverage";
import { isSizingGroup } from "@/lib/sizing/measurements";
import { personaSizingGroup } from "@/modules/store/mapping/persona-taxonomy";
import {
  SizingStateOverrideContext,
  useSizingStore,
  type SizingUiState,
} from "@/modules/store/sizing/store";
import type { StageFiveDataSource } from "@/modules/store/sizing/components/stage-five-acs-table";
import type { SizingPublisher } from "@/modules/store/sizing/components/stage-confirmation-acs";
import {
  EMPTY_CHARTS_RESPONSE,
  isRunWorking,
  type AcsStageFiveResponse,
  type BrandMappingResponse,
  type SizingChartsResponse,
  type SizingResolutionSummary,
} from "@/modules/store/sizing/server-types";
import { syncApi, type SyncRunProducts } from "./sync-api";

const SYNC_API = "/api/store-connection/sync";
const POLL_INTERVAL_MS = 2_000;

/** The parts of the sizing state a sync serves itself; everything else stays inert. */
type SyncSizingKeys =
  | "run"
  | "lastPublishedAt"
  | "loadRun"
  | "stopPolling"
  | "brandMapping"
  | "brandMappingStatus"
  | "brandMappingLoading"
  | "brandMappingSaving"
  | "brandMappingError"
  | "brandMappingEditing"
  | "loadBrandMapping"
  | "saveBrandMapping"
  | "openBrandMappingEditor"
  | "closeBrandMappingEditor"
  | "chartBrands"
  | "charts"
  | "chartGapsNotFound"
  | "chartGapsGlobal"
  | "chartGapsNoBrand"
  | "chartTotals"
  | "chartLeafCounts"
  | "chartLeafSources"
  | "chartBrandLeafSources"
  | "chartsResearched"
  | "chartsLoading"
  | "chartsError"
  | "chartsLoaded"
  | "loadCharts"
  | "mappedLeaves"
  | "chartModal"
  | "openChartModal"
  | "closeChartModal"
  | "manualChartTarget"
  | "openManualChart"
  | "editManualChart"
  | "closeManualChart"
  | "saveManualChart";

export interface SyncSizingState extends Pick<SizingUiState, SyncSizingKeys> {
  runProducts: SyncRunProducts | null;
  runLoaded: boolean;
  runReadError: string | null;
}

function createSyncSizingStore(): { store: StoreApi<SyncSizingState>; dispose: () => void } {
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const store = createStore<SyncSizingState>((set, get) => ({
    run: null,
    lastPublishedAt: null,
    runProducts: null,
    runLoaded: false,
    runReadError: null,

    loadRun: async () => {
      try {
        const data = await syncApi.run();
        const previous = get().run;
        set({
          run: data.run,
          runProducts: data.products,
          lastPublishedAt: data.run?.publishedAt ?? null,
          runLoaded: true,
          runReadError: null,
        });
        // The scan just settled: what the mapping and chart screens hold predates its brands.
        if (previous && data.run && isRunWorking(previous) && !isRunWorking(data.run)) {
          set({ brandMapping: null, chartsLoaded: false });
        }
      } catch (error) {
        set({ runLoaded: true, runReadError: error instanceof Error ? error.message : "Could not load the sync." });
      }
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
      if (!disposed && isRunWorking(get().run)) {
        pollTimer = setTimeout(() => void get().loadRun(), POLL_INTERVAL_MS);
      }
    },
    stopPolling: () => {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
    },

    brandMapping: null,
    brandMappingStatus: "needs_mapping",
    brandMappingLoading: false,
    brandMappingSaving: false,
    brandMappingError: null,
    brandMappingEditing: false,

    loadBrandMapping: async (options) => {
      if (!options?.force && (get().brandMappingLoading || get().brandMapping !== null)) return;
      set({ brandMappingLoading: true, brandMappingError: null });
      try {
        const res = await fetch(`${SYNC_API}/brand-mapping`, { cache: "no-store" });
        const data = (await res.json()) as BrandMappingResponse & { error?: string };
        if (!res.ok) {
          set({ brandMappingLoading: false, brandMappingError: data.error ?? "Could not load brand mapping" });
          return;
        }
        set({ brandMapping: data, brandMappingStatus: data.status, brandMappingLoading: false });
      } catch {
        set({ brandMappingLoading: false, brandMappingError: "Could not reach the server" });
      }
    },

    saveBrandMapping: async (groups, privateGroups) => {
      if (get().brandMappingSaving) return false;
      set({ brandMappingSaving: true, brandMappingError: null });
      try {
        const res = await fetch(`${SYNC_API}/brand-mapping`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(privateGroups ? { groups, privateGroups } : { groups }),
        });
        const data = (await res.json()) as BrandMappingResponse & { error?: string };
        if (!res.ok) {
          set({ brandMappingSaving: false, brandMappingError: data.error ?? "Could not save brand mapping" });
          return false;
        }
        // Charts route by the mapping, so the chart screen reads again on its next mount.
        set({
          brandMapping: data,
          brandMappingStatus: data.status,
          brandMappingSaving: false,
          brandMappingEditing: false,
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

    chartBrands: [],
    charts: [],
    chartGapsNotFound: [],
    chartGapsGlobal: [],
    chartGapsNoBrand: [],
    chartTotals: EMPTY_CHARTS_RESPONSE.totals,
    chartLeafCounts: [],
    chartLeafSources: {},
    chartBrandLeafSources: {},
    chartsResearched: false,
    chartsLoading: false,
    chartsError: null,
    chartsLoaded: false,
    mappedLeaves: [],

    loadCharts: async (options) => {
      if (!options?.force && (get().chartsLoaded || get().chartsLoading)) return;
      set({ chartsLoading: true, chartsError: null });
      try {
        const res = await fetch(`${SYNC_API}/charts`, { cache: "no-store" });
        const data = (await res.json()) as Partial<SizingChartsResponse> & { error?: string };
        if (!res.ok) {
          set({ chartsError: data.error ?? "Could not load the sync's size charts", chartsLoading: false });
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
          chartBrandLeafSources: data.brandLeafSources ?? {},
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

    chartModal: null,
    openChartModal: (charts, product = null, initialCategory = null) =>
      set({
        chartModal: {
          charts: Array.isArray(charts) ? [...charts] : [charts],
          product,
          initialCategory,
        },
      }),
    closeChartModal: () => set({ chartModal: null }),

    manualChartTarget: null,
    openManualChart: (gap) => {
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
          variantName: "",
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
    // A sync's charts are the store's charts, so they are saved through Setup's own chart route.
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
            audience: audience ?? target.audience ?? null,
            coversLeaves,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) return data.error ?? "Could not save this chart.";
        if (!keepOpen) set({ manualChartTarget: null });
        await get().loadCharts({ force: true });
        return null;
      } catch {
        return "Could not reach the server.";
      }
    },
  }));

  return {
    store,
    dispose: () => {
      disposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
    },
  };
}

/**
 * The live store's state with every action replaced by a no-op, so a screen reaching for something
 * a sync does not serve does nothing rather than touching Setup's run or its API.
 */
function neutralState(): SizingUiState {
  const noop = () => undefined;
  return Object.fromEntries(
    Object.entries(useSizingStore.getState()).map(([key, value]) => [key, typeof value === "function" ? noop : value]),
  ) as unknown as SizingUiState;
}

const SYNC_STAGE_FIVE_SOURCE: StageFiveDataSource = {
  async products(params, signal) {
    const result = await fetch(`${SYNC_API}/acs-products?${params}`, { cache: "no-store", signal });
    const body = (await result.json()) as AcsStageFiveResponse & { error?: string };
    if (!result.ok) throw new Error(body.error ?? "Could not load the sync's products");
    return body;
  },
  async summary() {
    const result = await fetch(`${SYNC_API}/resolution-summary`, { cache: "no-store" });
    const body = (await result.json()) as SizingResolutionSummary & { error?: string };
    if (!result.ok) throw new Error(body.error ?? "Could not load the sync's totals");
    return body;
  },
};

const publishSync: SizingPublisher = async (confirmUnresolved) => {
  const response = await fetch(`${SYNC_API}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(confirmUnresolved === undefined ? {} : { confirmUnresolved }),
  });
  const body = (await response.json().catch(() => ({}))) as Awaited<ReturnType<SizingPublisher>>["body"];
  return { status: response.status, ok: response.ok, body };
};

interface LiveSyncTools {
  store: StoreApi<SyncSizingState>;
  source: StageFiveDataSource;
  publisher: SizingPublisher;
}

const LiveSyncContext = React.createContext<LiveSyncTools | null>(null);

function useLiveSyncTools(): LiveSyncTools {
  const tools = React.useContext(LiveSyncContext);
  if (!tools) throw new Error("useLiveSync must be used inside LiveSyncProvider");
  return tools;
}

/** The sync's own state, for the board around the Setup screens. */
export function useLiveSync<T>(selector: (state: SyncSizingState) => T): T {
  return useStore(useLiveSyncTools().store, selector);
}

export function useLiveSyncSource(): Pick<LiveSyncTools, "source" | "publisher"> {
  const { source, publisher } = useLiveSyncTools();
  return { source, publisher };
}

/**
 * Runs Setup's Stage 4 and Stage 5 screens on the live sync.
 *
 * `SizingStateOverrideContext` replaces what `useSizingStore` returns inside this subtree, so the
 * screens are the production components while their reads go to `/api/store-connection/sync/*`,
 * which scope Setup's answers to the sync's products. Setup's own store, run and poll are untouched.
 */
export function LiveSyncProvider({
  children,
  onPrevStage,
}: {
  children: React.ReactNode;
  /** Back to step 1, from Active Overview. */
  onPrevStage: () => void;
}) {
  const [base] = React.useState(neutralState);
  const [{ store, dispose }] = React.useState(createSyncSizingStore);
  React.useEffect(() => dispose, [dispose]);
  const state = useStore(store);

  const prevStage = React.useRef(onPrevStage);
  React.useEffect(() => {
    prevStage.current = onPrevStage;
  });

  const value = React.useMemo<SizingUiState>(
    () => ({
      ...base,
      ...state,
      stage: 4,
      highestStage: 5,
      prevStage: () => prevStage.current(),
    }),
    [base, state],
  );
  const tools = React.useMemo<LiveSyncTools>(
    () => ({ store, source: SYNC_STAGE_FIVE_SOURCE, publisher: publishSync }),
    [store],
  );

  return (
    <SizingStateOverrideContext.Provider value={value}>
      <LiveSyncContext.Provider value={tools}>{children}</LiveSyncContext.Provider>
    </SizingStateOverrideContext.Provider>
  );
}
