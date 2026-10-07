"use client";

import * as React from "react";
import {
  Search,
  RefreshCw,
  Ruler,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Eye,
  Filter,
  Loader2,
  PencilLine,
  Globe,
  Ban,
  ListTree,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import { CHART_CONFIDENCE_PERCENT } from "@/lib/sizing/chart-review";
import { UNKNOWN_BRAND_KEY } from "@/lib/sizing/keys";
import { formatPersonaSegments, leafDisplayName, leafLabel } from "@/modules/store/mapping/persona-taxonomy";
import { arrangeByBrand, type BrandCluster } from "@/lib/sizing/brand-arrangement";
import { useSizingStore } from "../store";
import {
  isRunWorking,
  type BrandResearchRow,
  type BrandResearchStatus,
  type ChartGap,
  type ResearchedChart,
  type SizingRun,
} from "../server-types";
import type { FoundSizeChart } from "../types";
import { StageHeaderBanner } from "./stage-header-banner";

type ResultTab = "brands" | "not_found" | "no_brand";
type StatusFilter = "all" | "done" | "needs_action";

/**
 * Stage 4 — the brand queue, and the charts research pulled out of each brand's guide.
 *
 * Global charts are centrally curated. Merchants may inspect charts already in the shared registry;
 * a missing global brand is a support request, never a merchant-triggered research or private-chart
 * write. This keeps the global registry separate from lower-confidence private and unbranded charts.
 *
 * Sizing categories print as their raw keys (`tops`, not "Tops & knitwear") deliberately. A friendly
 * label would hide exactly the class of bug this screen exists to catch.
 */
export function StageChartResearch() {
  const run = useSizingStore((s) => s.run);
  const brands = useSizingStore((s) => s.chartBrands);
  const charts = useSizingStore((s) => s.charts);
  const notFoundGaps = useSizingStore((s) => s.chartGapsNotFound);
  const globalGaps = useSizingStore((s) => s.chartGapsGlobal);
  const noBrandGaps = useSizingStore((s) => s.chartGapsNoBrand);
  const totals = useSizingStore((s) => s.chartTotals);
  const loading = useSizingStore((s) => s.chartsLoading);
  const loaded = useSizingStore((s) => s.chartsLoaded);
  const error = useSizingStore((s) => s.chartsError);
  const loadCharts = useSizingStore((s) => s.loadCharts);
  const loadRun = useSizingStore((s) => s.loadRun);
  const openChartModal = useSizingStore((s) => s.openChartModal);
  const mappedLeaves = useSizingStore((s) => s.mappedLeaves);
  const openBrandMappingEditor = useSizingStore((s) => s.openBrandMappingEditor);

  const [tab, setTab] = React.useState<ResultTab>("brands");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [query, setQuery] = React.useState("");

  const researching = isRunWorking(run) && run?.stage === "research";

  React.useEffect(() => {
    void loadRun({ ifStale: true });
  }, [loadRun]);

  React.useEffect(() => {
    if (!researching) void loadCharts();
  }, [researching, loadCharts]);

  // Research persists each brand's outcome as it finishes, so progress is a re-read of real rows
  // rather than an animated timer. Read when the run says research moved — a brand started, a
  // brand left the queue — rather than on a timer: this response carries every chart's measurement
  // table, and the run poll already reports exactly those moments.
  const researchProgress = researching
    ? `${run?.researchCurrentBrandKey ?? ""}|${run?.researchBrandKeys.length ?? 0}`
    : null;
  React.useEffect(() => {
    if (researchProgress !== null) void loadCharts({ force: true });
  }, [researchProgress, loadCharts]);

  // One last read on the transition out, because the final brand's charts are written after the poll
  // above has stopped.
  const wasResearching = React.useRef(researching);
  React.useEffect(() => {
    if (wasResearching.current && !researching) void loadCharts({ force: true });
    wasResearching.current = researching;
  }, [researching, loadCharts]);

  const matchesQuery = React.useCallback(
    (haystack: string[]) => {
      const needle = query.trim().toLowerCase();
      return needle === "" || haystack.some((value) => value.toLowerCase().includes(needle));
    },
    [query]
  );

  const chartsByBrand = React.useMemo(() => {
    const grouped = new Map<string, ResearchedChart[]>();
    for (const chart of charts) {
      const existing = grouped.get(chart.brandKey);
      if (existing) existing.push(chart);
      else grouped.set(chart.brandKey, [chart]);
    }
    return grouped;
  }, [charts]);

  const gapsByBrand = React.useMemo(() => {
    const grouped = new Map<string, ChartGap[]>();
    for (const gap of globalGaps) grouped.set(gap.brandKey, [...(grouped.get(gap.brandKey) ?? []), gap]);
    return grouped;
  }, [globalGaps]);

  const filteredBrands = React.useMemo(
    () =>
      brands.filter((brand) => {
        const brandCharts = chartsByBrand.get(brand.brandKey) ?? [];
        const brandGaps = gapsByBrand.get(brand.brandKey) ?? [];
        const variantNames = brandCharts.map((chart) => chart.variantName);
        const coveredLeafLabels = [
          ...new Set(
            brandCharts.flatMap((chart) => chart.coversLeaves).filter((leaf) => mappedLeaves.includes(leaf))
          ),
        ].map(leafDisplayName);
        if (
          !matchesQuery([
            brand.brandName,
            brand.searchName,
            ...(brand.memberBrands ?? []).map((member) => member.brandName),
            ...brand.sizingCategories,
            ...variantNames,
            ...coveredLeafLabels,
            ...brandGaps.flatMap((gap) => gap.missingLeaves.map(leafDisplayName)),
          ])
        ) {
          return false;
        }
        // Each filter keeps the brands that have that half; the table then lists only that row.
        if (statusFilter === "done") return brandCharts.length > 0;
        if (statusFilter === "needs_action") return brandGaps.length > 0 || brandCharts.length === 0;
        return true;
      }),
    [brands, chartsByBrand, gapsByBrand, mappedLeaves, matchesQuery, statusFilter]
  );

  const filterGaps = React.useCallback(
    (items: ChartGap[]) => items.filter((item) => matchesQuery([item.brandName, item.sizingCategory, item.reason])),
    [matchesQuery]
  );

  const filteredNotFound = React.useMemo(() => filterGaps(notFoundGaps), [notFoundGaps, filterGaps]);
  const filteredNoBrand = React.useMemo(() => filterGaps(noBrandGaps), [noBrandGaps, filterGaps]);
  const allSavedPrivateCharts = React.useMemo(
    () => charts.filter((chart) => !chart.shared && chart.brandKey !== UNKNOWN_BRAND_KEY),
    [charts],
  );
  const allSavedNoBrandCharts = React.useMemo(
    () => charts.filter((chart) => !chart.shared && chart.brandKey === UNKNOWN_BRAND_KEY),
    [charts],
  );
  const savedPrivateCharts = React.useMemo(
    () =>
      allSavedPrivateCharts.filter((chart) =>
        matchesQuery([chart.brand, chart.sizingCategory, chart.variantName]),
      ),
    [allSavedPrivateCharts, matchesQuery],
  );
  const savedNoBrandCharts = React.useMemo(
    () =>
      allSavedNoBrandCharts.filter((chart) =>
        matchesQuery([chart.brand, chart.sizingCategory, chart.variantName]),
      ),
    [allSavedNoBrandCharts, matchesQuery],
  );

  // Only the very first read gets a spinner. A poll that flipped this would blank the table every
  // three seconds while research runs, which is exactly when the merchant is watching it.
  if (loading && !loaded) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-10 text-sm text-[var(--color-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading the brand queue…
      </div>
    );
  }

  const outstanding = brands.filter((brand) => brand.status !== "done").length;
  const totalSizedSkus = totals.chartedSkus + totals.gapSkus;
  return (
    <div className="space-y-4">
      <StageHeaderBanner
        stageNumber={4}
        eyebrow="Global Brand Charts"
        title={
          brands.length === 0
            ? "No global brands"
            : `${brands.length - outstanding} of ${brands.length} brands charted`
        }
        description={
          totals.pairsNeeded === 0
            ? "No sized brand and category pairs yet — run the catalog scan first."
            : `${totals.chartsFound} verified chart${totals.chartsFound === 1 ? "" : "s"} covering ${totals.chartedSkus.toLocaleString()} of ${totalSizedSkus.toLocaleString()} sized items. If a global brand has no chart yet, contact support so it can be added to the shared registry.`
        }
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={openBrandMappingEditor} disabled={researching}>
              <PencilLine className="h-3.5 w-3.5" /> Edit brand mapping
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void loadCharts({ force: true })} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </Button>
          </>
        }
      />

      {error && (
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-error-border)] bg-[var(--color-error-light)] px-4 py-3 text-xs text-[var(--color-error)]">
          {error}
        </p>
      )}

      {researching && run && <ResearchProgressStrip run={run} brands={brands} />}

      <div className="space-y-3 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
        <div className="flex flex-wrap gap-2">
          <ResultTabButton
            active={tab === "brands"}
            onClick={() => setTab("brands")}
            tone="success"
            icon={<Globe className="h-4 w-4" />}
            label={`Global brands (${brands.length})`}
          />
          <ResultTabButton
            active={tab === "not_found"}
            onClick={() => setTab("not_found")}
            tone="warning"
            icon={<AlertTriangle className="h-4 w-4" />}
            label={`Private labels (${notFoundGaps.length + allSavedPrivateCharts.length})`}
          />
          <ResultTabButton
            active={tab === "no_brand"}
            onClick={() => setTab("no_brand")}
            tone="error"
            icon={<HelpCircle className="h-4 w-4" />}
            label={`No brand (${noBrandGaps.length + allSavedNoBrandCharts.length})`}
          />
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3 sm:flex-row">
          {tab === "brands" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 flex items-center gap-1 text-xs font-semibold text-[var(--color-text-muted)]">
                <Filter className="h-3 w-3" /> Filter:
              </span>
              <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
                All brands
              </FilterChip>
              <FilterChip active={statusFilter === "done"} onClick={() => setStatusFilter("done")} tone="success">
                <CheckCircle2 className="h-3 w-3" /> Charted
              </FilterChip>
              <FilterChip
                active={statusFilter === "needs_action"}
                onClick={() => setStatusFilter("needs_action")}
                tone="warning"
              >
                <AlertTriangle className="h-3 w-3" /> Needs support
              </FilterChip>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">
              {tab === "not_found"
                ? "Private labels that need their own chart. A global brand's missing subcategories are on the Global brands tab."
                : "Products with no brand at all, grouped by the category they need a chart for."}
            </p>
          )}

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search brands or categories…"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] py-1.5 pl-8 pr-3 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {tab === "brands" && (
        <BrandResearchTable
          brands={filteredBrands}
          chartsByBrand={chartsByBrand}
          gapsByBrand={gapsByBrand}
          show={statusFilter === "done" ? "covered" : statusFilter === "needs_action" ? "missing" : "all"}
          mappedLeaves={mappedLeaves}
          hasBrands={brands.length > 0}
          onViewChart={(brandCharts, initialCategory) => openChartModal(brandCharts, undefined, initialCategory)}
        />
      )}
      {tab === "not_found" && (
        <>
          <SavedManualChartTable charts={savedPrivateCharts} kind="brand" />
          {(filteredNotFound.length > 0 || savedPrivateCharts.length === 0) && (
            <GapTable items={filteredNotFound} kind="brand" />
          )}
        </>
      )}
      {/* No retry on either gap tab. A private label publishes nothing to find and an unbranded row has
          no name to search for, so the only route out of both is a hand-filled chart — and a brand
          research demoted to private is retried from its own row on the Global brands tab. */}
      {tab === "no_brand" && (
        <>
          <SavedManualChartTable charts={savedNoBrandCharts} kind="category" />
          {(filteredNoBrand.length > 0 || savedNoBrandCharts.length === 0) && (
            <GapTable items={filteredNoBrand} kind="category" />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Live progress, as a strip above the table rather than instead of it.
 *
 * The previous version replaced the whole screen with a centred progress panel for however many
 * minutes the pass took, which hid the results already in the table — including the brand that had
 * just finished.
 *
 * Every number is read off the run row, and none of it is tracked here. That matters because the row
 * is the only thing that survives the reload, the tab close and the several worker ticks a long pass
 * takes: `phaseTotal` is the size of the request as made, `phaseDone` the brands already searched, and
 * `researchCurrentBrandKey` the one being searched now. A denominator kept in component state would
 * reset to whatever the queue happened to hold when the component mounted.
 */
function ResearchProgressStrip({ run, brands }: { run: SizingRun; brands: BrandResearchRow[] }) {
  const current = brands.find((brand) => brand.brandKey === run.researchCurrentBrandKey);

  // Falls back to the live queue for a pass claimed before the stage recorded a total, and clamps
  // because a rescan can shrink the brand list under a scope already authorised.
  const total = run.phaseTotal ?? run.researchBrandKeys.length;
  const done = Math.min(Math.max(run.phaseDone ?? 0, 0), total);
  const percent = total === 0 ? 100 : Math.round((done / total) * 100);

  return (
    <div className="space-y-2.5 rounded-[var(--radius-2xl)] border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)]/40 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="gradient-brand flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white">
            <Globe className="h-4 w-4 animate-spin" />
          </span>
          <div>
            <p className="text-sm font-bold text-[var(--color-text-primary)]">
              {current ? `Reading ${current.searchName}'s official size guide` : "Starting the next brand…"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              A guide plus every table on it takes a few minutes per brand. You can leave this screen — the search keeps
              running, and finished brands appear in the table below as they land.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-[var(--color-brand)]/20 bg-[var(--color-surface-base)] px-3 py-1 font-mono text-xs font-bold text-[var(--color-brand-strong)]">
          {done} of {total} done · {percent}%
        </span>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-0.5">
        <div
          className="gradient-brand h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

const BRAND_STATUS_META: Record<
  BrandResearchStatus,
  { label: string; tone: "success" | "warning" | "error" | "info" | "neutral"; hint: string }
> = {
  pending: { label: "Chart unavailable", tone: "neutral", hint: "Contact support to add this global brand." },
  queued: { label: "Queued", tone: "info", hint: "Authorised and waiting for the worker to pick it up." },
  researching: { label: "Researching", tone: "info", hint: "The search is running right now." },
  done: { label: "Charted", tone: "success", hint: "Every subcategory this store sells for the brand has a chart." },
  partial: {
    label: "Partial coverage",
    tone: "warning",
    hint: "Some categories or subcategories this store sells have no chart yet; contact support for the missing coverage.",
  },
  not_found: {
    label: "No shared chart",
    tone: "warning",
    hint: "Contact support to add or verify this global brand's chart.",
  },
  failed: { label: "Chart unavailable", tone: "error", hint: "Contact support to add this global brand." },
};

function BrandStatusBadge({ status }: { status: BrandResearchStatus }) {
  const meta = BRAND_STATUS_META[status];
  const toneClass =
    meta.tone === "success"
      ? "border-[var(--color-success)]/30 bg-[var(--color-success-light)] text-[var(--color-success)]"
      : meta.tone === "warning"
        ? "border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
        : meta.tone === "error"
          ? "border-[var(--color-error)]/30 bg-[var(--color-error-light)] text-[var(--color-error)]"
          : meta.tone === "info"
            ? "border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
            : "border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]";

  return (
    <span
      title={meta.hint}
      className={cn("inline-flex cursor-help items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold", toneClass)}
    >
      {status === "researching" || status === "queued" ? (
        <Loader2 className={cn("h-3 w-3", status === "researching" && "animate-spin")} />
      ) : status === "done" ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : status === "pending" ? (
        <Ban className="h-3 w-3" />
      ) : (
        <AlertTriangle className="h-3 w-3" />
      )}
      {meta.label}
    </span>
  );
}

function CoveragePill({
  tone,
  label,
  hint,
}: {
  tone: "success" | "warning" | "error";
  label: string;
  hint: string;
}) {
  const toneClass =
    tone === "success"
      ? "border-[var(--color-success)]/30 bg-[var(--color-success-light)] text-[var(--color-success)]"
      : tone === "warning"
        ? "border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
        : "border-[var(--color-error)]/30 bg-[var(--color-error-light)] text-[var(--color-error)]";
  return (
    <span
      title={hint}
      className={cn("inline-flex cursor-help items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold", toneClass)}
    >
      {tone === "success" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {label}
    </span>
  );
}

/** A global brand's uncovered part, per sizing key: the subcategories, their items, and why. */
function GlobalGapDetail({ gaps }: { gaps: ChartGap[] }) {
  const byCategory = gaps.length > 1;
  return (
    <div className="space-y-2.5">
      {gaps.map((gap) => {
        const reasons = [...new Set(Object.values(gap.missingLeafReasons ?? {}))];
        return (
          <div key={gap.id}>
            {byCategory && <CategoryKey value={gap.sizingCategory} />}
            {gap.missingLeaves.length > 0 ? (
              <MissingLeafChips leaves={gap.missingLeaves} counts={gap.missingLeafCounts} />
            ) : (
              <p className="mt-1 text-[11px] font-semibold text-[var(--color-text-primary)]">{gap.reason}</p>
            )}
            {reasons.length > 0 ? (
              reasons.map((reason) => (
                <p key={reason} className="mt-1 max-w-md text-[11px] text-[var(--color-text-muted)]">
                  {reason}
                </p>
              ))
            ) : (
              gap.missingLeaves.length > 0 && (
                <p className="mt-1 max-w-md text-[11px] text-[var(--color-text-muted)]">
                  {gap.partial ? "The shared chart does not cover these." : gap.researchNote ?? gap.reason}
                </p>
              )
            )}
            {gap.storeCategoryPaths.length > 0 && (
              <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                {gap.storeCategoryPaths.map(formatPersonaSegments).join(", ")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The queue. At most two rows per global brand, under one brand cell: what its shared charts cover,
 * and what they do not.
 *
 * Present in every state, including before anything has been researched — which is the point. A table
 * that only appeared after a pass had run gave a merchant nothing to act on beforehand, so the only
 * available action was the bulk one.
 *
 * The uncovered part sits here rather than with the private labels: only support can add a shared
 * chart, so putting it beside Fill chart rows read as if the merchant could fill it.
 *
 * A brand's several categories and variants used to expand inline under its row, one nested row per
 * chart. That put "Men tops" and "Women tops" and "Footwear" on three different lines a merchant had
 * to hunt across, and buried the one action — View chart — behind a chevron most rows never got
 * clicked. One brand now opens one modal: every category it covers and every variant published within
 * each is a tab and a dropdown inside that single view, exactly the shape doc Part 5 describes and the
 * demo renders.
 */
function BrandResearchTable({
  brands,
  chartsByBrand,
  gapsByBrand,
  show,
  mappedLeaves,
  hasBrands,
  onViewChart,
}: {
  brands: BrandResearchRow[];
  chartsByBrand: Map<string, ResearchedChart[]>;
  gapsByBrand: Map<string, ChartGap[]>;
  /** Which of a brand's two rows to list: what its charts cover, what they do not, or both. */
  show: "all" | "covered" | "missing";
  mappedLeaves: string[];
  hasBrands: boolean;
  onViewChart: (charts: ResearchedChart[], initialCategory?: string) => void;
}) {
  const [coverageModal, setCoverageModal] = React.useState<CoverageModalState | null>(null);
  const merchantLeafSet = React.useMemo(() => new Set(mappedLeaves), [mappedLeaves]);

  const leafCounts = useSizingStore((s) => s.chartLeafCounts);
  const stockedByBrand = React.useMemo(() => {
    const byBrand = new Map<string, Set<string>>();
    for (const { brandKey, leafKey, skuCount } of leafCounts) {
      if (skuCount <= 0 || !merchantLeafSet.has(leafKey)) continue;
      const leaves = byBrand.get(brandKey) ?? new Set<string>();
      leaves.add(leafKey);
      byBrand.set(brandKey, leaves);
    }
    return byBrand;
  }, [leafCounts, merchantLeafSet]);

  // The leaves a brand's charts cover that the brand actually stocks. A shared chart claims every
  // subcategory the brand publishes for, most of which a given store never sells, so listing all of
  // them overstated what this store was covered for. A scan with no leaf counts keeps the store-wide
  // list instead of showing nothing.
  const coverageFor = React.useCallback(
    (brandKey: string, charts: readonly ResearchedChart[]) => {
      const stocked = stockedByBrand.get(brandKey);
      return [...new Set(charts.flatMap((chart) => chart.coversLeaves))]
        .filter((leaf) => merchantLeafSet.has(leaf) && (!stocked || stocked.has(leaf)))
        .sort((a, b) => leafLabel(a).localeCompare(leafLabel(b)));
    },
    [merchantLeafSet, stockedByBrand],
  );

  return (
    <>
    <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-brand-light)]/30 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-brand)]" />
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Global brands ({brands.length})</h3>
        </div>
        <span className="rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-success)]">
          Charts are reused across every Persona store
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            <tr>
              <th className="px-6 py-3.5">Brand</th>
              <th className="px-6 py-3.5">Sizing keys carried</th>
              <th className="px-6 py-3.5">Subcategory coverage</th>
              <th className="px-6 py-3.5">Charts</th>
              <th className="px-6 py-3.5">SKU count</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {brands.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-xs text-[var(--color-text-muted)]">
                  {hasBrands
                    ? "No brand matches the active filter."
                    : "No brand in this catalog was classified as a global brand."}
                </td>
              </tr>
            ) : (
              brands.flatMap((brand) => {
                const variants = chartsByBrand.get(brand.brandKey) ?? [];
                const gaps = gapsByBrand.get(brand.brandKey) ?? [];
                const coveredLeaves = coverageFor(brand.brandKey, variants);
                const live = brand.status === "queued" || brand.status === "researching";
                const showCovered = show !== "missing" && variants.length > 0;
                const showMissing = show !== "covered" && (gaps.length > 0 || variants.length === 0);
                const rowCount = Number(showCovered) + Number(showMissing);
                if (rowCount === 0) return [];
                const gapSkus = gaps.reduce((sum, gap) => sum + gap.skuCount, 0);
                const chartedKeys = brand.sizingCategories.filter((key) =>
                  variants.some((chart) => chart.sizingCategory === key),
                );

                const brandCell = (
                  <td
                    rowSpan={rowCount}
                    className={cn(
                      "px-6 py-4 align-top",
                      rowCount > 1 && "border-r border-[var(--color-border)] bg-[var(--color-surface-elevated)]/40",
                    )}
                  >
                      <div className="min-w-0">
                        <p className="font-bold text-[var(--color-text-primary)]">{brand.brandName}</p>
                        <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                          Includes: {(brand.memberBrands ?? []).map((member) => member.brandName).join(", ") || brand.brandName}
                        </p>
                        {/* Only when the two differ. A store filing Claudie Pierlot as "CLAUDIE" is why a
                            search can come back empty on a brand the merchant knows is real, and this is
                            the only place that is visible. */}
                        {brand.searchName !== brand.brandName && (
                          <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                            registry name: {brand.searchName}
                          </p>
                        )}
                      </div>
                  </td>
                );

                const rows: React.ReactNode[] = [];
                if (showCovered) {
                  rows.push(
                    <tr key={`${brand.brandKey}:covered`} className="transition-colors hover:bg-[var(--color-brand-light)]/20">
                      {brandCell}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {chartedKeys.map((key) => (
                            <CategoryKey key={key} value={key} onClick={() => onViewChart(variants, key)} />
                          ))}
                        </div>
                      </td>
                      <td className="max-w-[22rem] px-6 py-4">
                        <SubcategoryCoverage
                          leaves={coveredLeaves}
                          charted
                          onViewAll={() =>
                            setCoverageModal({
                              title: `${brand.brandName} subcategory coverage`,
                              leaves: coveredLeaves,
                              description: `${coveredLeaves.length} selected taxonomy ${coveredLeaves.length === 1 ? "leaf" : "leaves"} covered by this brand's charts.`,
                            })
                          }
                        />
                      </td>
                      <td className="px-6 py-4 font-mono text-xs font-semibold text-[var(--color-text-secondary)]">
                        {brand.chartCount} table{brand.chartCount === 1 ? "" : "s"}
                      </td>
                      <td className="px-6 py-4 font-mono font-semibold text-[var(--color-text-secondary)]">
                        {Math.max(0, brand.skuCount - gapSkus).toLocaleString()} SKUs
                      </td>
                      <td className="px-6 py-4">
                        {live ? (
                          <BrandStatusBadge status={brand.status} />
                        ) : (
                          <CoveragePill tone="success" label="Charted" hint="These subcategories have a chart." />
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => onViewChart(variants)}
                            title="Open every category and variant this brand publishes in one view"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View chart
                          </button>
                        </div>
                      </td>
                    </tr>,
                  );
                }
                if (showMissing) {
                  const missingKeys = gaps.length > 0
                    ? [...new Set(gaps.map((gap) => gap.sizingCategory))]
                    : brand.sizingCategories;
                  rows.push(
                    <tr
                      key={`${brand.brandKey}:missing`}
                      className="bg-[var(--color-warning-light)]/15 transition-colors hover:bg-[var(--color-brand-light)]/20"
                    >
                      {!showCovered && brandCell}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {missingKeys.map((key) => (
                            <CategoryKey key={key} value={key} />
                          ))}
                        </div>
                      </td>
                      <td className="max-w-[24rem] px-6 py-4">
                        {gaps.length > 0 ? (
                          <GlobalGapDetail gaps={gaps} />
                        ) : (
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            No shared chart for this brand yet.
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-[var(--color-text-muted)]">No chart</td>
                      <td className="px-6 py-4 font-mono font-semibold text-[var(--color-text-secondary)]">
                        {(gaps.length > 0 ? gapSkus : brand.skuCount).toLocaleString()} SKUs
                      </td>
                      <td className="px-6 py-4">
                        {variants.length === 0 && gaps.length === 0 ? (
                          <BrandStatusBadge status={brand.status} />
                        ) : gaps.some((gap) => gap.researchStatus === "failed") ? (
                          <CoveragePill tone="error" label="Research failed" hint="Contact support to retry this brand." />
                        ) : (
                          <CoveragePill
                            tone="warning"
                            label="Needs support"
                            hint="The shared registry has no chart for these. Only support can add one."
                          />
                        )}
                        {brand.note && variants.length === 0 && (
                          <p className="mt-1 max-w-xs text-[11px] text-[var(--color-text-muted)]">{brand.note}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            disabled
                            title="Support contact will be connected here."
                            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-muted)] opacity-70"
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                            Contact support
                          </button>
                        </div>
                      </td>
                    </tr>,
                  );
                }
                return rows;
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
    <SubcategoryCoverageModal value={coverageModal} onClose={() => setCoverageModal(null)} />
    </>
  );
}

type CoverageModalState = {
  title: string;
  leaves: string[];
  description: string;
};

const VISIBLE_SUBCATEGORY_CHIPS = 4;

function SubcategoryCoverage({
  leaves,
  charted,
  onViewAll,
}: {
  leaves: string[];
  charted: boolean;
  onViewAll: () => void;
}) {
  if (leaves.length === 0) {
    return (
      <span className="text-[11px] text-[var(--color-text-muted)]">
        {charted ? "No selected leaves covered" : "Contact support to add this chart"}
      </span>
    );
  }

  const visible = leaves.slice(0, VISIBLE_SUBCATEGORY_CHIPS);
  const hidden = leaves.length - visible.length;

  return (
    <div className="flex max-w-[20rem] flex-wrap items-center gap-1">
      {visible.map((leaf) => (
        <span
          key={leaf}
          title={leaf}
          className="max-w-36 truncate rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)]"
        >
          {leafDisplayName(leaf)}
        </span>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={onViewAll}
          className="rounded-md border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-brand-strong)] transition-colors hover:border-[var(--color-brand)]"
        >
          View {hidden} more
        </button>
      )}
    </div>
  );
}

function SubcategoryCoverageModal({
  value,
  onClose,
}: {
  value: CoverageModalState | null;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={value !== null}
      onClose={onClose}
      size="md"
      icon={<ListTree className="h-4 w-4" />}
      title={value?.title ?? "Subcategory coverage"}
      description={value?.description}
      footer={
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="grid gap-2 p-5 sm:grid-cols-2">
        {value?.leaves.map((leaf) => (
          <div
            key={leaf}
            className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2"
          >
            <p className="text-xs font-bold text-[var(--color-text-primary)]">{leafDisplayName(leaf)}</p>
            <p className="mt-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">{leaf}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** The Sync tab's own compact card grid, still fed by `mocks/charts` — kept separate from the table
 *  above since a delta sync is reviewing a handful of new charts, not browsing the registry. */
export function ChartCard({ chart, onOpen }: { chart: FoundSizeChart; onOpen: () => void }) {
  // Mock charts carry no defect list, so confidence alone has to stand in for the server's
  // `needsReview` here. Same bar, weaker evidence.
  const isStrong = chart.confidence >= CHART_CONFIDENCE_PERCENT;

  return (
    <button
      onClick={onOpen}
      className="group rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4 text-left transition-all hover:border-[var(--color-brand)] hover:shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg gradient-brand text-white">
            <Ruler className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{chart.brand}</p>
            <p className="truncate text-[11px] text-[var(--color-text-muted)]">{chart.categories.join(" · ")}</p>
          </div>
        </div>
        {chart.isInheritedFromSetup ? (
          <Badge variant="info" className="shrink-0">
            Reused
          </Badge>
        ) : (
          <Badge variant={isStrong ? "success" : "warning"} className="shrink-0">
            <ShieldCheck className="h-3 w-3" /> {chart.confidence}%
          </Badge>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {chart.headers.slice(1).map((header) => (
          <span
            key={header}
            className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]"
          >
            {header}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
        <span>
          {chart.rows.length} sizes
          {chart.labelSystems && ` · ${chart.labelSystems}`}
          {chart.skuCount !== undefined && ` · ${chart.skuCount.toLocaleString()} items`}
        </span>
        <span className="inline-flex items-center gap-1 text-[var(--color-brand)] opacity-0 transition-opacity group-hover:opacity-100">
          View chart <Eye className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

function ResultTabButton({
  active,
  onClick,
  tone,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  tone: "success" | "warning" | "error";
  icon: React.ReactNode;
  label: string;
}) {
  const activeClass =
    tone === "success"
      ? "bg-[var(--color-success-fill-strong)] text-[var(--color-success)] border-[var(--color-success-border)]"
      : tone === "warning"
        ? "bg-[var(--color-warning-fill-strong)] text-[var(--color-warning)] border-[var(--color-warning-border)]"
        : "bg-[var(--color-error-fill-strong)] text-[var(--color-error)] border-[var(--color-error-border)]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 min-w-[190px] items-center justify-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-bold transition-all",
        active
          ? activeClass
          : "border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone?: "success" | "warning";
  children: React.ReactNode;
}) {
  const activeClass =
    tone === "success"
      ? "bg-[var(--color-success-fill-strong)] text-[var(--color-success)] border-[var(--color-success-border)]"
      : tone === "warning"
        ? "bg-[var(--color-warning-fill-strong)] text-[var(--color-warning)] border-[var(--color-warning-border)]"
        : "bg-[var(--color-neutral-fill-strong)] text-[var(--color-text-primary)] border-[var(--color-border-strong)]";
  const idleClass =
    tone === "success"
      ? "bg-[var(--color-success-light)] text-[var(--color-success)] border-[var(--color-success)]/25 hover:border-[var(--color-success-border)]"
      : tone === "warning"
        ? "bg-[var(--color-warning-light)] text-[var(--color-warning)] border-[var(--color-warning)]/25 hover:border-[var(--color-warning-border)]"
        : "bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
        active ? activeClass : idleClass
      )}
    >
      {children}
    </button>
  );
}

/** The raw sizing key, monospaced and — on the Found tab — clickable straight into that category's
 *  tab inside the brand's chart modal. Not prettified: see the component doc above. */
function CategoryKey({ value, onClick }: { value: string; onClick?: () => void }) {
  const className =
    "inline-flex items-center rounded-md border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-brand-strong)]";
  if (!onClick) return <span className={className}>{value}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`View this brand's ${value} chart`}
      className={cn(className, "transition-colors hover:border-[var(--color-brand)] hover:bg-[var(--color-brand)]/10")}
    >
      {value}
    </button>
  );
}

function SavedManualChartTable({
  charts,
  kind,
}: {
  charts: ResearchedChart[];
  kind: "brand" | "category";
}) {
  const editManualChart = useSizingStore((s) => s.editManualChart);
  const openChartModal = useSizingStore((s) => s.openChartModal);
  const [coverageModal, setCoverageModal] = React.useState<CoverageModalState | null>(null);
  const clusters = React.useMemo(
    () =>
      arrangeByBrand(charts, (chart) => ({
        brandKey: chart.brandKey,
        brandName: chart.brand,
        skuCount: chart.skuCount,
        sizingCategory: chart.sizingCategory,
      })),
    [charts],
  );
  if (charts.length === 0) return null;

  return (
    <>
    <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-success-light)]/40 px-6 py-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
            {kind === "brand" ? "Saved private charts" : "Saved no-brand charts"} ({charts.length})
          </h3>
        </div>
        <span className="rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-success)]">
          Editable
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            <tr>
              <th className="px-6 py-3.5">{kind === "brand" ? "Brand" : "Brand entity"}</th>
              <th className="px-6 py-3.5">Sizing key</th>
              <th className="px-6 py-3.5">Chart</th>
              <th className="px-6 py-3.5">SKU count</th>
              <th className="px-6 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {clusters.flatMap((cluster) => cluster.rows.map((chart, index) => {
              const coveredLeaves = [...chart.coversLeaves].sort((a, b) => leafLabel(a).localeCompare(leafLabel(b)));
              return (
              <tr key={chart.id} className="transition-colors hover:bg-[var(--color-brand-light)]/20">
                {index === 0 && <BrandGroupCell cluster={cluster} rowSpan={cluster.rows.length} />}
                <td className="px-6 py-4">
                  <CategoryKey value={chart.sizingCategory} />
                </td>
                <td className="max-w-[22rem] px-6 py-4">
                  <p className="font-semibold text-[var(--color-text-primary)]">{chart.variantName}</p>
                  <div className="mt-1.5">
                    <SubcategoryCoverage
                      leaves={coveredLeaves}
                      charted
                      onViewAll={() =>
                        setCoverageModal({
                          title: `${chart.variantName} covered subcategories`,
                          leaves: coveredLeaves,
                          description: `${coveredLeaves.length} subcategor${coveredLeaves.length === 1 ? "y" : "ies"} this chart covers.`,
                        })
                      }
                    />
                  </div>
                </td>
                <td className="px-6 py-4 font-mono font-semibold text-[var(--color-text-secondary)]">
                  {chart.skuCount.toLocaleString()} SKUs
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openChartModal(chart)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                    <button
                      type="button"
                      onClick={() => editManualChart(chart)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand)]/40 bg-[var(--color-brand-light)] px-3 py-1.5 text-xs font-bold text-[var(--color-brand-strong)] transition-colors hover:border-[var(--color-brand)]"
                    >
                      <PencilLine className="h-3.5 w-3.5" /> Edit
                    </button>
                  </div>
                </td>
              </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
    </div>
    <SubcategoryCoverageModal value={coverageModal} onClose={() => setCoverageModal(null)} />
    </>
  );
}

function MissingLeafChips({
  leaves,
  counts,
  limit = 6,
}: {
  leaves: readonly string[];
  counts: Record<string, number>;
  limit?: number;
}) {
  const shown = leaves.slice(0, limit);
  return (
    <div className="mt-1.5 flex max-w-md flex-wrap gap-1">
      {shown.map((leaf) => (
        <span
          key={leaf}
          className="rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-warning)]"
        >
          {leafDisplayName(leaf)}
          {counts[leaf] ? `, ${counts[leaf].toLocaleString()} item${counts[leaf] === 1 ? "" : "s"}` : ""}
        </span>
      ))}
      {leaves.length > shown.length && (
        <span className="px-1 py-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
          +{leaves.length - shown.length} more
        </span>
      )}
    </div>
  );
}

function BrandGroupCell({
  cluster,
  badge,
  badgeClass,
  rowSpan,
}: {
  cluster: BrandCluster<unknown>;
  badge?: string;
  badgeClass?: string;
  rowSpan: number;
}) {
  const openBrandMappingEditor = useSizingStore((s) => s.openBrandMappingEditor);
  const categories = cluster.rows.length;
  return (
    <td
      rowSpan={rowSpan}
      className="border-r border-[var(--color-border)] bg-[var(--color-surface-elevated)]/40 px-6 py-4 align-top"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-[var(--color-text-primary)]">{cluster.name}</span>
        {badge && (
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", badgeClass)}>{badge}</span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
        {categories} categor{categories === 1 ? "y" : "ies"} · {cluster.skuCount.toLocaleString()} SKUs
      </p>
      {cluster.otherNames.length > 0 && (
        <p className="mt-1 max-w-[14rem] text-[11px] text-[var(--color-text-muted)]">
          Also written as {cluster.otherNames.join(", ")}
        </p>
      )}
      {cluster.brandKeys.length > 1 && (
        <button
          type="button"
          onClick={openBrandMappingEditor}
          title="Each spelling keeps its own charts until they are merged"
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-brand)] hover:underline"
        >
          <PencilLine className="h-3 w-3" /> Merge spellings
        </button>
      )}
    </td>
  );
}

function GapTable({ items, kind }: { items: ChartGap[]; kind: "brand" | "category" }) {
  const openManualChart = useSizingStore((s) => s.openManualChart);
  const clusters = React.useMemo(
    () =>
      arrangeByBrand(items, (item) => ({
        brandKey: item.brandKey,
        brandName: item.brandName,
        skuCount: item.skuCount,
        sizingCategory: item.sizingCategory,
      })),
    [items],
  );
  const tone = kind === "brand" ? "warning" : "error";
  const headerWash = tone === "warning" ? "bg-[var(--color-warning-light)]/40" : "bg-[var(--color-error-light)]/40";
  const headerText = tone === "warning" ? "text-[var(--color-warning)]" : "text-[var(--color-error)]";
  const badgeClass =
    tone === "warning"
      ? "border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
      : "border-[var(--color-error)]/30 bg-[var(--color-error-light)] text-[var(--color-error)]";

  const skuTotal = items.reduce((sum, item) => sum + item.skuCount, 0);

  return (
    <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
      <div
        className={cn(
          "flex flex-col gap-2 border-b border-[var(--color-border)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between",
          headerWash
        )}
      >
        <div className={cn("flex items-center gap-2", headerText)}>
          {kind === "brand" ? <AlertTriangle className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />}
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
            {kind === "brand" ? `Missing charts (${items.length})` : `No-brand fallbacks (${items.length})`}
          </h3>
        </div>
        <span
          className={cn("self-start rounded-full border px-2.5 py-0.5 text-xs font-semibold sm:self-auto", badgeClass)}
        >
          {skuTotal.toLocaleString()} items affected
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            <tr>
              <th className="px-6 py-3.5">{kind === "brand" ? "Brand" : "Brand entity"}</th>
              <th className="px-6 py-3.5">Sizing key</th>
              <th className="px-6 py-3.5">SKU count</th>
              <th className="px-6 py-3.5">Why there&apos;s no chart</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-xs text-[var(--color-text-muted)]">
                  Nothing here.
                </td>
              </tr>
            ) : (
              clusters.flatMap((cluster) => cluster.rows.map((item, index) => (
                <tr key={item.id} className="transition-colors hover:bg-[var(--color-brand-light)]/20">
                  {index === 0 && (
                    <BrandGroupCell
                      cluster={cluster}
                      rowSpan={cluster.rows.length}
                      badge={item.brandType === "none" ? "No brand" : item.brandType}
                      badgeClass={badgeClass}
                    />
                  )}
                  <td className="px-6 py-4">
                    <CategoryKey value={item.sizingCategory} />
                    {cluster.brandKeys.length > 1 && (
                      <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">as {item.brandName}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono font-semibold text-[var(--color-text-secondary)]">
                    {item.skuCount.toLocaleString()} SKUs
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs font-semibold text-[var(--color-text-primary)]">{item.reason}</p>
                    {item.researchNote && (
                      <p className="mt-0.5 max-w-md text-[11px] text-[var(--color-text-muted)]">{item.researchNote}</p>
                    )}
                    {item.missingLeaves.length > 0 && (
                      <MissingLeafChips leaves={item.missingLeaves} counts={item.missingLeafCounts} />
                    )}
                    {item.missingLeaves.length > 0 && item.partial && (
                      <p className="mt-1 text-[10px] font-semibold text-[var(--color-success)]">
                        Some subcategories here already have a chart.
                      </p>
                    )}
                    {item.storeCategoryPaths.length > 0 && (
                      <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                        {item.storeCategoryPaths.map(formatPersonaSegments).join(", ")}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end">
                      {item.brandType === "global" ? (
                        <button
                          type="button"
                          disabled
                          title="Support contact will be connected here."
                          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-muted)] opacity-70"
                        >
                          <HelpCircle className="h-3.5 w-3.5" /> Contact support
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openManualChart(item)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand)]/40 bg-[var(--color-brand-light)] px-3 py-1.5 text-xs font-bold text-[var(--color-brand-strong)] transition-colors hover:border-[var(--color-brand)]"
                        >
                          <PencilLine className="h-3.5 w-3.5" /> Fill chart
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
