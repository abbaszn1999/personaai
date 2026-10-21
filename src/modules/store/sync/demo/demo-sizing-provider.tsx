"use client";

import * as React from "react";
import { draftRowsFrom } from "@/lib/sizing/chart-draft";
import { isSizingGroup } from "@/lib/sizing/measurements";
import {
  SizingStateOverrideContext,
  useSizingStore,
  type SizingUiState,
} from "@/modules/store/sizing/store";
import type { StageFiveDataSource } from "@/modules/store/sizing/components/stage-five-acs-table";
import type { SizingPublisher } from "@/modules/store/sizing/components/stage-confirmation-acs";
import type {
  AcsStageFiveResponse,
  AcsStageFiveRow,
  SizingRun,
} from "@/modules/store/sizing/server-types";
import {
  DEMO_ACS_ROWS,
  DEMO_BRAND_ROWS,
  DEMO_CHARTS,
  DEMO_CHART_TOTALS,
  DEMO_GAPS_GLOBAL,
  DEMO_GAPS_NOT_FOUND,
  DEMO_GAPS_NO_BRAND,
  DEMO_LEAF_COUNTS,
  DEMO_MAPPED_LEAVES,
  DEMO_RESOLUTION_SUMMARY,
  DEMO_RUN,
} from "./demo-sizing-data";

/** What the Active Overview screen needs on top of the sizing state. */
interface DemoSizingTools {
  source: StageFiveDataSource;
  publisher: SizingPublisher;
  onOpenTester: () => void;
}

const DemoSizingToolsContext = React.createContext<DemoSizingTools | null>(null);

export function useDemoSizingTools(): DemoSizingTools {
  const tools = React.useContext(DemoSizingToolsContext);
  if (!tools) throw new Error("useDemoSizingTools must be used inside DemoSizingProvider");
  return tools;
}

/**
 * The live store's state with every action replaced by a no-op.
 *
 * Starting from the live state means every field the real screens read exists; neutralising the
 * functions means an action this provider forgot to define does nothing, rather than reaching the
 * real setup run or an API.
 */
function neutralState(): SizingUiState {
  const noop = () => undefined;
  return Object.fromEntries(
    Object.entries(useSizingStore.getState()).map(([key, value]) => [key, typeof value === "function" ? noop : value]),
  ) as unknown as SizingUiState;
}

const PAGE_DELAY_MS = 120;

function filterRows(params: URLSearchParams, published: boolean): AcsStageFiveResponse {
  const query = (params.get("q") ?? "").trim().toLowerCase();
  const type = params.get("type");
  const availability = params.get("availability");
  const brandType = params.get("brandType");
  const pageSize = Number(params.get("pageSize")) || 25;
  const offset = Number(params.get("offset")) || 0;

  const rows = DEMO_ACS_ROWS.filter((row) => {
    if (type && row.type !== type) return false;
    if (availability && row.availability !== availability) return false;
    if (brandType && row.brandType !== brandType) return false;
    if (!query) return true;
    return [row.id, row.title, row.sku, row.brand, row.fitLeaf, row.fitChartVariant, ...row.categories]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(query));
  });

  const countOf = (predicate: (row: AcsStageFiveRow) => boolean) => rows.filter(predicate).length;
  return {
    rows: rows.slice(offset, offset + pageSize),
    source: published ? "acs" : "preview",
    total: rows.length,
    pageSize,
    offset,
    counts: {
      primary: countOf((row) => row.type === "PRIMARY"),
      variant: countOf((row) => row.type === "VARIANT"),
      inStock: countOf((row) => row.availability === "IN_STOCK"),
      outOfStock: countOf((row) => row.availability === "OUT_OF_STOCK"),
      otherAvailability: countOf((row) => row.availability !== "IN_STOCK" && row.availability !== "OUT_OF_STOCK"),
    },
    builtAt: Date.now(),
    refreshing: false,
  };
}

/** Ticks of the simulated publish: preparing the sizing data, then sending it. */
const PUBLISH_TICKS = 12;
const PUBLISH_TICK_MS = 300;

/**
 * Runs the real Stage 4 / Stage 5 screens on this module's demo data.
 *
 * `SizingStateOverrideContext` replaces what `useSizingStore` returns inside this subtree only, so
 * the screens are the production components — same layout, tabs, tables and modals — while the live
 * setup run, its charts and every API stay untouched. Anything a merchant does here (opening a
 * chart, filling a gap, publishing) is simulated locally and lost on refresh.
 */
export function DemoSizingProvider({
  children,
  notify,
  onPrevStage,
}: {
  children: React.ReactNode;
  /** Shows a short message to the person using the preview. */
  notify: (message: string) => void;
  /** Back to the previous Sync step, from Active Overview. */
  onPrevStage: () => void;
}) {
  const [base] = React.useState(neutralState);
  const [chartModal, setChartModal] = React.useState<SizingUiState["chartModal"]>(null);
  const [manualChartTarget, setManualChartTarget] = React.useState<SizingUiState["manualChartTarget"]>(null);
  const [run, setRun] = React.useState<SizingRun>(DEMO_RUN);

  const published = React.useRef(false);
  const publishTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const callbacks = React.useRef({ notify, onPrevStage });
  React.useEffect(() => {
    callbacks.current = { notify, onPrevStage };
  });
  React.useEffect(
    () => () => {
      if (publishTimer.current) clearInterval(publishTimer.current);
    },
    [],
  );

  const publisher = React.useCallback<SizingPublisher>(async (confirmUnresolved) => {
    if (confirmUnresolved === undefined && DEMO_RESOLUTION_SUMMARY.unresolved > 0) {
      return {
        status: 409,
        ok: false,
        body: {
          requiresConfirmation: true,
          unresolved: DEMO_RESOLUTION_SUMMARY.unresolved,
          total: DEMO_RESOLUTION_SUMMARY.total,
          groups: DEMO_RESOLUTION_SUMMARY.unresolvedGroups ?? [],
        },
      };
    }

    const total = DEMO_RESOLUTION_SUMMARY.total;
    const working: SizingRun = {
      ...DEMO_RUN,
      id: `demo-publish-${Date.now()}`,
      status: "running",
      stage: "resolve",
      phase: null,
      phaseDone: 0,
      phaseTotal: total,
    };
    setRun(working);

    let tick = 0;
    if (publishTimer.current) clearInterval(publishTimer.current);
    publishTimer.current = setInterval(() => {
      tick += 1;
      if (tick >= PUBLISH_TICKS) {
        if (publishTimer.current) clearInterval(publishTimer.current);
        publishTimer.current = null;
        published.current = true;
        const now = new Date().toISOString();
        setRun({
          ...working,
          status: "complete",
          stage: "publish",
          phaseDone: total,
          publishedAt: now,
          updatedAt: now,
        });
        return;
      }
      const half = PUBLISH_TICKS / 2;
      const inResolve = tick < half;
      const progress = inResolve ? tick / half : (tick - half) / half;
      setRun({
        ...working,
        stage: inResolve ? "resolve" : "publish",
        phaseDone: Math.round(progress * total),
      });
    }, PUBLISH_TICK_MS);

    return { status: 200, ok: true, body: { run: working } };
  }, []);

  const tools = React.useMemo<DemoSizingTools>(
    () => ({
      publisher,
      onOpenTester: () => callbacks.current.notify("The Sizing Tester is not part of the Sync preview."),
      source: {
        async products(params) {
          await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
          return filterRows(params, published.current);
        },
        async summary() {
          return DEMO_RESOLUTION_SUMMARY;
        },
      },
    }),
    [publisher],
  );

  const value = React.useMemo<SizingUiState>(
    () => ({
      ...base,
      stage: 4,
      highestStage: 5,
      run,
      lastPublishedAt: run.publishedAt,

      chartBrands: DEMO_BRAND_ROWS,
      charts: DEMO_CHARTS,
      chartGapsNotFound: DEMO_GAPS_NOT_FOUND,
      chartGapsGlobal: DEMO_GAPS_GLOBAL,
      chartGapsNoBrand: DEMO_GAPS_NO_BRAND,
      chartTotals: DEMO_CHART_TOTALS,
      chartLeafCounts: DEMO_LEAF_COUNTS,
      chartLeafSources: {},
      chartBrandLeafSources: {},
      chartsResearched: true,
      chartsLoading: false,
      chartsError: null,
      chartsLoaded: true,
      researchStarting: null,
      mappedLeaves: DEMO_MAPPED_LEAVES,

      brandMappingStatus: "ready",
      brandMappingEditing: false,
      openBrandMappingEditor: () =>
        callbacks.current.notify("Brand mapping is inherited from your setup — edit it in Setup."),

      chartModal,
      openChartModal: (charts, product = null, initialCategory = null) =>
        setChartModal({
          charts: Array.isArray(charts) ? [...charts] : [charts],
          product,
          initialCategory,
        }),
      closeChartModal: () => setChartModal(null),

      manualChartTarget,
      openManualChart: (gap) =>
        setManualChartTarget({
          id: gap.id,
          brandKey: gap.brandKey,
          brandName: gap.brandName,
          sizingCategory: gap.sizingCategory,
          skuCount: gap.skuCount,
          reason: gap.reason,
          variantName: "",
          coversLeaves: [...gap.missingLeaves],
        }),
      editManualChart: (chart) => {
        if (chart.shared || !isSizingGroup(chart.sizingCategory)) return;
        const uncovered = [...DEMO_GAPS_NOT_FOUND, ...DEMO_GAPS_NO_BRAND]
          .filter((gap) => gap.brandKey === chart.brandKey && gap.sizingCategory === chart.sizingCategory)
          .flatMap((gap) => gap.missingLeaves);
        setManualChartTarget({
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
        });
      },
      closeManualChart: () => setManualChartTarget(null),
      saveManualChart: async ({ keepOpen = false }) => {
        if (!keepOpen) setManualChartTarget(null);
        callbacks.current.notify("Preview only — charts filled in here are not stored.");
        return null;
      },

      prevStage: () => callbacks.current.onPrevStage(),
    }),
    [base, run, chartModal, manualChartTarget],
  );

  return (
    <SizingStateOverrideContext.Provider value={value}>
      <DemoSizingToolsContext.Provider value={tools}>{children}</DemoSizingToolsContext.Provider>
    </SizingStateOverrideContext.Provider>
  );
}
