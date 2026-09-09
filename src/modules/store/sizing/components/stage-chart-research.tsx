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
  ExternalLink,
  Play,
  Link2Off,
  RotateCcw,
  Layers2,
  PencilLine,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { CHART_CONFIDENCE_PERCENT } from "@/lib/sizing/chart-review";
import { useSizingStore } from "../store";
import { isRunWorking, type ChartGap, type ResearchedChart } from "../server-types";
import type { FoundSizeChart } from "../types";
import { StageHeaderBanner } from "./stage-header-banner";

type ResultTab = "found" | "not_found" | "no_brand";
type StatusFilter = "all" | "done" | "needs_action";

/** Nothing here decides what "needs review" means. The server sends `needsReview` per chart, so the
 *  one confidence bar in the system lives beside the checks it is weighed against — see
 *  `CHART_CONFIDENCE_THRESHOLD` in `lib/sizing/chart-review.ts`. */

/**
 * Stage 4 — the researched charts, before they go anywhere near a shopper.
 *
 * Every number here comes from `sizing_charts` and `sizing_coverage`: the three tabs account for
 * each (brand x sizing category) the store carries, either as one or more charts or as a gap
 * carrying the reason research gave. Coverage drives it rather than charts, so the tabs cannot show
 * a handful of successes while quietly omitting the pairs still waiting for one.
 *
 * One coverage pair can list several charts. A brand publishes a men's table and a women's one, and
 * often more than one fit line per audience — Tommy Hilfiger's mainline tops and its Tommy Jeans
 * tops are different numbers under the same label — so the Audience and Title columns are what
 * distinguish rows that would otherwise look duplicated.
 *
 * Sizing categories print as their raw keys (`tops`, not "Tops & knitwear") deliberately. A friendly
 * label would hide exactly the class of bug this screen exists to catch.
 */
export function StageChartResearch() {
  const run = useSizingStore((s) => s.run);
  const routing = useSizingStore((s) => s.routing);
  const charts = useSizingStore((s) => s.charts);
  const notFoundGaps = useSizingStore((s) => s.chartGapsNotFound);
  const noBrandGaps = useSizingStore((s) => s.chartGapsNoBrand);
  const totals = useSizingStore((s) => s.chartTotals);
  const researched = useSizingStore((s) => s.chartsResearched);
  const loading = useSizingStore((s) => s.chartsLoading);
  const loaded = useSizingStore((s) => s.chartsLoaded);
  const error = useSizingStore((s) => s.chartsError);
  const loadCharts = useSizingStore((s) => s.loadCharts);
  const continueRun = useSizingStore((s) => s.continueRun);
  const rerunResearch = useSizingStore((s) => s.rerunResearch);
  const rerunning = useSizingStore((s) => s.rerunning);
  const openChartModal = useSizingStore((s) => s.openChartModal);

  const [tab, setTab] = React.useState<ResultTab>("found");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [query, setQuery] = React.useState("");

  const researching = isRunWorking(run) && run?.stage === "research";

  React.useEffect(() => {
    void loadCharts();
  }, [loadCharts]);

  // A research pass writes charts from a background job, so the table has to be re-read when it
  // ends. Keyed on that transition rather than polled: the run poll already knows when the stage
  // stops working, and re-fetching every measurement table on a timer would make the pipeline's
  // largest response its most frequent one.
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

  const filteredCharts = React.useMemo(
    () =>
      charts.filter((chart) => {
        if (!matchesQuery([chart.brand, chart.sizingCategory, chart.variantName, chart.audience, chart.sourceTitle]))
          return false;
        if (statusFilter === "done") return !chart.needsReview;
        if (statusFilter === "needs_action") return chart.needsReview;
        return true;
      }),
    [charts, matchesQuery, statusFilter]
  );

  const filterGaps = React.useCallback(
    (items: ChartGap[]) => items.filter((item) => matchesQuery([item.brandName, item.sizingCategory, item.reason])),
    [matchesQuery]
  );

  const filteredNotFound = React.useMemo(() => filterGaps(notFoundGaps), [notFoundGaps, filterGaps]);
  const filteredNoBrand = React.useMemo(() => filterGaps(noBrandGaps), [noBrandGaps, filterGaps]);

  if (researching) {
    return <ResearchingPanel brandCount={routing.webSearch.brands.length} chartCount={routing.webSearch.charts} />;
  }

  if (loading && !loaded) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-10 text-sm text-[var(--color-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading the researched charts…
      </div>
    );
  }

  const totalSizedSkus = totals.chartedSkus + totals.gapSkus;

  return (
    <div className="space-y-4">
      <StageHeaderBanner
        stageNumber={4}
        eyebrow="Autonomous Web Research"
        title={`${totals.chartsFound} size charts found`}
        description={
          totals.pairsNeeded === 0
            ? "No sized brand and category pairs yet — run the catalog scan first."
            : `Covering ${totals.chartedSkus.toLocaleString()} of ${totalSizedSkus.toLocaleString()} sized items, across ${totals.chartsFound} of ${totals.pairsNeeded} brand and category pairs. Open any chart to check the numbers before they drive recommendations.`
        }
        aiPowered
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void loadCharts({ force: true })} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </Button>
            {/* Only offered once a pass has run: before that the action is "start", and the server
                would clear outcomes and charts that do not exist yet. */}
            {researched && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void rerunResearch()}
                disabled={rerunning}
                title="Searches every global brand again and replaces the charts research produced. Your own hand-filled charts are untouched."
              >
                <RotateCcw className={cn("h-3.5 w-3.5", rerunning && "animate-spin")} /> Research again
              </Button>
            )}
          </>
        }
      />

      {error && (
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-error-border)] bg-[var(--color-error-light)] px-4 py-3 text-xs text-[var(--color-error)]">
          {error}
        </p>
      )}

      {!researched && totals.pairsNeeded > 0 && <NotResearchedBanner onStart={() => void continueRun()} />}

      <div className="space-y-3 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
        <div className="flex flex-wrap gap-2">
          <ResultTabButton
            active={tab === "found"}
            onClick={() => setTab("found")}
            tone="success"
            icon={<CheckCircle2 className="h-4 w-4" />}
            label={`Found & filled (${charts.length})`}
          />
          <ResultTabButton
            active={tab === "not_found"}
            onClick={() => setTab("not_found")}
            tone="warning"
            icon={<AlertTriangle className="h-4 w-4" />}
            label={`Not found / private (${notFoundGaps.length})`}
          />
          <ResultTabButton
            active={tab === "no_brand"}
            onClick={() => setTab("no_brand")}
            tone="error"
            icon={<HelpCircle className="h-4 w-4" />}
            label={`No brand (${noBrandGaps.length})`}
          />
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3 sm:flex-row">
          {/* Status chips only on the found tab: a gap has no chart, so "ready" could never match one
              until hand-filled templates are stored server-side. */}
          {tab === "found" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 flex items-center gap-1 text-xs font-semibold text-[var(--color-text-muted)]">
                <Filter className="h-3 w-3" /> Filter:
              </span>
              <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
                All charts
              </FilterChip>
              <FilterChip active={statusFilter === "done"} onClick={() => setStatusFilter("done")} tone="success">
                <CheckCircle2 className="h-3 w-3" /> Ready
              </FilterChip>
              <FilterChip
                active={statusFilter === "needs_action"}
                onClick={() => setStatusFilter("needs_action")}
                tone="warning"
              >
                <AlertTriangle className="h-3 w-3" /> Needs review
              </FilterChip>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">
              {tab === "not_found"
                ? "Brands and categories research could not chart, plus every private label."
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

      {tab === "found" && (
        <FoundChartsTable charts={filteredCharts} researched={researched} onViewChart={openChartModal} />
      )}
      {tab === "not_found" && (
        <GapTable items={filteredNotFound} kind="brand" onRetry={rerunResearch} retrying={rerunning} />
      )}
      {/* No retry on the unbranded tab: these rows have no brand to search for, so the only route
          out of them is a hand-filled chart per category. Offering a button that cannot help would
          be worse than offering none. */}
      {tab === "no_brand" && <GapTable items={filteredNoBrand} kind="category" />}
    </div>
  );
}

/**
 * Shown while the background job is actually searching.
 *
 * The counts come from Tab 3's routing, so they describe the real queue. There is no per-brand bar
 * because the job does not publish per-brand progress yet — naming the real size of the queue and
 * saying it takes minutes is more use than a bar that moves on a timer.
 */
function ResearchingPanel({ brandCount, chartCount }: { brandCount: number; chartCount: number }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-10 text-center shadow-[var(--shadow-card)]">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl gradient-brand text-white">
        <Search className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-bold text-[var(--color-text-primary)]">Researching size charts</p>
        <p className="mt-1 max-w-md text-xs text-[var(--color-text-muted)]">
          Searching each brand&apos;s official size guide — {brandCount} brand{brandCount === 1 ? "" : "s"} covering{" "}
          {chartCount} chart{chartCount === 1 ? "" : "s"}. One search per brand, and the result is reused by every
          Persona store carrying that brand.
        </p>
      </div>
      <p className="flex items-center gap-2 text-xs font-semibold text-[var(--color-brand)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> This can take a few minutes
      </p>
    </div>
  );
}

/** Coverage exists but nothing has been researched against it — the state after a scan when the
 *  merchant has not continued past stage 3, or after a refresh that landed here directly. */
function NotResearchedBanner({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-2xl)] border border-[var(--color-warning-border)] bg-[var(--color-warning-light)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
        <div>
          <p className="text-sm font-bold text-[var(--color-text-primary)]">Chart research hasn&apos;t run yet</p>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
            The rows below are what your catalog needs charts for. Research searches the web once per brand and costs
            real requests, so it only starts when you say so.
          </p>
        </div>
      </div>
      <Button size="sm" onClick={onStart} className="shrink-0">
        <Play className="h-3.5 w-3.5" /> Start research
      </Button>
    </div>
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
          {chart.rows.length} sizes · {chart.region}
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

/** The raw sizing key, monospaced. Not prettified — see the component doc above. */
function CategoryKey({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-brand-strong)]">
      {value}
    </span>
  );
}

/**
 * Who the source table was published for.
 *
 * Its own column rather than part of the key, because that is the whole point of the change behind
 * this screen: the audience is a fact read off the brand's page, not a guess folded into a key the
 * catalog could not support. Seeing `womens` next to a menswear brand is now a visible, checkable
 * claim about a specific published table.
 */
/** Brand plus parent — the unit doc Part 5 says a set of variants belongs to. */
function variantKey(chart: ResearchedChart): string {
  return `${chart.brandKey}|${chart.sizingCategory}`;
}

/**
 * The chart line this row is, and how many alternatives sit beside it.
 *
 * Given its own column rather than folded into the published-table heading because it is the field
 * doc Part 7 hands the merchant next: Chart Assignment binds a category path to one of these names,
 * so a name that is wrong or duplicated has to be visible here, while research can still be re-run.
 */
function VariantCell({ chart, siblings }: { chart: ResearchedChart; siblings: number }) {
  return (
    <div className="min-w-0">
      <span className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-md border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] px-2 py-0.5 text-xs font-bold text-[var(--color-brand-strong)]">
        <Layers2 className="h-3 w-3 shrink-0" />
        <span className="truncate" title={chart.variantName}>
          {chart.variantName || "—"}
        </span>
      </span>
      {siblings > 1 && (
        <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
          1 of {siblings} for this brand &amp; parent
        </p>
      )}
    </div>
  );
}

function AudienceTag({ value }: { value: ResearchedChart["audience"] }) {
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-text-secondary)]">
      {value}
    </span>
  );
}

/**
 * The checks that are allowed to disagree with the model's own confidence.
 *
 * One badge per defect rather than a single "low quality" marker, because the defects need different
 * fixes: a pinned measurement column is a normalizer prompt problem, mixed scales usually mean a
 * wrong audience key, and a missing source means the numbers cannot be verified at all.
 */
function QualityBadges({ flags }: { flags: ResearchedChart["quality"] }) {
  return (
    <>
      {flags.map((flag) => (
        <span
          key={flag.code}
          title={flag.detail}
          className={cn(
            "inline-flex cursor-help items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold",
            flag.severity === "error"
              ? "border-[var(--color-error)]/30 bg-[var(--color-error-light)] text-[var(--color-error)]"
              : "border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
          )}
        >
          {flag.code === "no_source" ? <Link2Off className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {flag.label}
        </span>
      ))}
    </>
  );
}

function FoundChartsTable({
  charts,
  researched,
  onViewChart,
}: {
  charts: ResearchedChart[];
  researched: boolean;
  onViewChart: (chart: ResearchedChart) => void;
}) {
  // How many variants each brand+parent turned out to have, so a row can say "1 of 3" rather than
  // showing three near-identical rows with no hint they are alternatives for the same products.
  // That count is what Phase 5's dropdown will offer, surfaced here while it is still reviewable.
  const forkChart = useSizingStore((s) => s.forkChart);

  const variantCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const chart of charts) {
      counts.set(variantKey(chart), (counts.get(variantKey(chart)) ?? 0) + 1);
    }
    return counts;
  }, [charts]);

  return (
    <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-success-light)]/40 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" />
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
            Automatically extracted charts ({charts.length})
          </h3>
        </div>
        <span className="rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-success)]">
          Reused across every Persona store
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            <tr>
              <th className="px-6 py-3.5">Brand</th>
              <th className="px-6 py-3.5">Sizing key</th>
              <th className="px-6 py-3.5">Chart variant</th>
              <th className="px-6 py-3.5">Audience</th>
              <th className="px-6 py-3.5">Published table</th>
              <th className="px-6 py-3.5">SKU count</th>
              <th className="px-6 py-3.5">Source &amp; confidence</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {charts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-xs text-[var(--color-text-muted)]">
                  {researched
                    ? "No chart matches the active filter."
                    : "Nothing researched yet — start research to fill this in."}
                </td>
              </tr>
            ) : (
              charts.map((chart) => (
                <tr key={chart.id} className="transition-colors hover:bg-[var(--color-brand-light)]/20">
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-[var(--color-text-primary)]">{chart.brand}</span>
                      {chart.shared && (
                        <Badge variant="info" className="text-[9px]">
                          Shared
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                      {chart.rows.length} size{chart.rows.length === 1 ? "" : "s"} · {chart.region} · updated{" "}
                      {chart.lastUpdated}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <CategoryKey value={chart.sizingCategory} />
                  </td>
                  <td className="px-6 py-4">
                    <VariantCell chart={chart} siblings={variantCounts.get(variantKey(chart)) ?? 1} />
                  </td>
                  <td className="px-6 py-4">
                    <AudienceTag value={chart.audience} />
                  </td>
                  <td className="max-w-[16rem] px-6 py-4">
                    <p
                      title={chart.sourceTitle}
                      className="truncate text-xs font-semibold text-[var(--color-text-primary)]"
                    >
                      {chart.sourceTitle || "—"}
                    </p>
                  </td>
                  <td className="px-6 py-4 font-mono font-semibold text-[var(--color-text-secondary)]">
                    {chart.skuCount.toLocaleString()} SKUs
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold",
                          !chart.needsReview
                            ? "border-[var(--color-success)]/30 bg-[var(--color-success-light)] text-[var(--color-success)]"
                            : "border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                        )}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> {chart.confidence}%
                      </span>
                      {chart.sourceUrl && (
                        <a
                          href={chart.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={chart.sourceUrl}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand)] hover:underline"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" /> Source
                        </a>
                      )}
                      <QualityBadges flags={chart.quality} />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onViewChart(chart)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                      {/* Doc Part 6. A researched chart is shared with every other store carrying
                          the brand, so correcting it forks a copy scoped to this connection rather
                          than editing the shared row underneath everyone else. */}
                      <button
                        type="button"
                        onClick={() => forkChart(chart)}
                        title="Make your own editable copy of this chart"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
                      >
                        <PencilLine className="h-3.5 w-3.5" /> Make copy
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GapTable({
  items,
  kind,
  onRetry,
  retrying,
}: {
  items: ChartGap[];
  kind: "brand" | "category";
  /** Omitted on the unbranded tab, where searching again cannot help. */
  onRetry?: (brandKey: string) => void;
  retrying?: boolean;
}) {
  const openManualChart = useSizingStore((s) => s.openManualChart);
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
            {kind === "brand" ? `Needs a hand-filled chart (${items.length})` : `No-brand fallbacks (${items.length})`}
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
              items.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-[var(--color-brand-light)]/20">
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-[var(--color-text-primary)]">{item.brandName}</span>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", badgeClass)}>
                        {item.brandType === "none" ? "No brand" : item.brandType}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <CategoryKey value={item.sizingCategory} />
                  </td>
                  <td className="px-6 py-4 font-mono font-semibold text-[var(--color-text-secondary)]">
                    {item.skuCount.toLocaleString()} SKUs
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs font-semibold text-[var(--color-text-primary)]">{item.reason}</p>
                    {item.researchNote && (
                      <p className="mt-0.5 max-w-md text-[11px] text-[var(--color-text-muted)]">{item.researchNote}</p>
                    )}
                    {item.storeCategoryPaths.length > 0 && (
                      <p className="mt-1 font-mono text-[10px] text-[var(--color-text-muted)]">
                        {item.storeCategoryPaths.map((path) => path.join(" › ")).join(", ")}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1.5">
                      {onRetry && (
                        <button
                          type="button"
                          onClick={() => onRetry(item.brandKey)}
                          disabled={retrying}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RotateCcw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} /> Retry
                        </button>
                      )}
                      {/* Doc Part 4. Present on both tabs, including the unbranded one where a retry
                          cannot help — hand-filling is the only route those rows ever have. */}
                      <button
                        type="button"
                        onClick={() => openManualChart(item)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand)]/40 bg-[var(--color-brand-light)] px-3 py-1.5 text-xs font-bold text-[var(--color-brand-strong)] transition-colors hover:border-[var(--color-brand)]"
                      >
                        <PencilLine className="h-3.5 w-3.5" /> Fill chart
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
