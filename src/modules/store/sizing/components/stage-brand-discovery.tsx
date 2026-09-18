"use client";

import * as React from "react";
import {
  Sparkles,
  Globe,
  Tag,
  HelpCircle,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CircleDashed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { useSizingStore } from "../store";
import { isScanIncomplete, type CoverageBrand, type ServerBrandType } from "../server-types";
import { StageHeaderBanner } from "./stage-header-banner";
import { ScanProgress } from "./scan-progress";

const TYPE_META: Record<
  ServerBrandType,
  { label: string; plural: string; icon: React.ReactNode; route: string; tone: "success" | "warning" | "error" | "neutral" }
> = {
  global: {
    label: "Global brand",
    plural: "Global brands",
    icon: <Globe className="h-3.5 w-3.5" />,
    route: "Automated web research",
    tone: "success",
  },
  private: {
    label: "Private label",
    plural: "Private labels",
    icon: <Tag className="h-3.5 w-3.5" />,
    route: "Store matrix required",
    tone: "warning",
  },
  none: {
    label: "No brand",
    plural: "No brand",
    icon: <HelpCircle className="h-3.5 w-3.5" />,
    route: "Category fallback matrix",
    tone: "error",
  },
  unclassified: {
    label: "Unclassified",
    plural: "Unclassified",
    icon: <CircleDashed className="h-3.5 w-3.5" />,
    route: "Needs a decision",
    tone: "neutral",
  },
};

const TONE_CLASSES: Record<
  "success" | "warning" | "error" | "neutral",
  { border: string; wash: string; text: string; chipActive: string; chipIdle: string; dot: string }
> = {
  success: {
    border: "border-[var(--color-success)]/25",
    wash: "bg-[var(--color-success-light)]",
    text: "text-[var(--color-success)]",
    chipActive: "bg-[var(--color-success-fill-strong)] text-[var(--color-success)] border border-[var(--color-success-border)]",
    chipIdle: "bg-[var(--color-success-light)] text-[var(--color-success)] border border-[var(--color-success)]/25 hover:border-[var(--color-success-border)]",
    dot: "bg-[var(--color-success)]",
  },
  warning: {
    border: "border-[var(--color-warning)]/25",
    wash: "bg-[var(--color-warning-light)]",
    text: "text-[var(--color-warning)]",
    chipActive: "bg-[var(--color-warning-fill-strong)] text-[var(--color-warning)] border border-[var(--color-warning-border)]",
    chipIdle: "bg-[var(--color-warning-light)] text-[var(--color-warning)] border border-[var(--color-warning)]/25 hover:border-[var(--color-warning-border)]",
    dot: "bg-[var(--color-warning)]",
  },
  error: {
    border: "border-[var(--color-error)]/25",
    wash: "bg-[var(--color-error-light)]",
    text: "text-[var(--color-error)]",
    chipActive: "bg-[var(--color-error-fill-strong)] text-[var(--color-error)] border border-[var(--color-error-border)]",
    chipIdle: "bg-[var(--color-error-light)] text-[var(--color-error)] border border-[var(--color-error)]/25 hover:border-[var(--color-error-border)]",
    dot: "bg-[var(--color-error)]",
  },
  neutral: {
    border: "border-[var(--color-border-strong)]",
    wash: "bg-[var(--color-surface-elevated)]",
    text: "text-[var(--color-text-secondary)]",
    chipActive: "bg-[var(--color-neutral-fill-strong)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)]",
    chipIdle: "bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)]",
    dot: "bg-[var(--color-text-muted)]",
  },
};

const ROUTE_BUCKETS: ServerBrandType[] = ["global", "private", "none"];

type BrandTypeFilter = "all" | Exclude<ServerBrandType, "none">;

/**
 * Stage 3 — who made what, and therefore where every later dollar goes.
 *
 * Global brands route to a web search paid for once per brand and reused across stores; private
 * labels and unbranded stock route to manual filling, which costs nothing but the merchant's time.
 * Getting this split right is worth more than anything downstream, which is why it is shown as a
 * reviewable table rather than applied silently.
 *
 * Everything here is real: the brand list, counts and shares come from `sizing_coverage`, written by
 * the catalog scan and classified by the brand pass.
 */
export function StageBrandDiscovery() {
  const run = useSizingStore((s) => s.run);
  const summary = useSizingStore((s) => s.summary);
  const runLoading = useSizingStore((s) => s.runLoading);
  const loadRun = useSizingStore((s) => s.loadRun);
  const stopPolling = useSizingStore((s) => s.stopPolling);

  const [typeFilter, setTypeFilter] = React.useState<BrandTypeFilter>("all");
  const [query, setQuery] = React.useState("");
  const [showAll, setShowAll] = React.useState(false);

  React.useEffect(() => {
    void loadRun();
    // The poll chain reschedules itself, so leaving this stage has to break it explicitly or it
    // keeps requesting in the background for as long as the dashboard stays open.
    return () => stopPolling();
  }, [loadRun, stopPolling]);

  const brands = summary.brands;
  const namedBrands = React.useMemo(() => brands.filter((brand) => brand.brandType !== "none"), [brands]);

  const byType = React.useMemo(() => {
    const groups: Record<ServerBrandType, CoverageBrand[]> = { global: [], private: [], none: [], unclassified: [] };
    for (const brand of brands) groups[brand.brandType].push(brand);
    return groups;
  }, [brands]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return namedBrands.filter((brand) => {
      if (typeFilter !== "all" && brand.brandType !== typeFilter) return false;
      if (!needle) return true;
      return (brand.name ?? "").toLowerCase().includes(needle);
    });
  }, [namedBrands, typeFilter, query]);

  const visibleBrands = showAll ? filtered : filtered.slice(0, 8);

  // The scan has to run before there is anything to show, and it is the one stage that reads the
  // whole catalog — so it gets its own screen rather than an empty table with a spinner.
  if (runLoading || isScanIncomplete(run)) {
    return <ScanProgress />;
  }

  return (
    <div className="space-y-4">
      <StageHeaderBanner
        stageNumber={3}
        eyebrow="Autonomous Classification"
        title={`${namedBrands.length} brand${namedBrands.length === 1 ? "" : "s"} across ${summary.chartsNeeded} size chart${summary.chartsNeeded === 1 ? "" : "s"}`}
        description={`Found in ${summary.totalSkus.toLocaleString()} sized items. Each brand/category pair—or unbranded category—becomes one chart, not one per product.`}
        aiPowered
        actions={
          <Button variant="ghost" size="sm" onClick={() => void loadRun()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      {summary.counts.unclassified > 0 && (
        <div className="flex items-start gap-2.5 rounded-[var(--radius-xl)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] p-3.5 text-xs text-[var(--color-warning)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>
              {summary.counts.unclassified} brand{summary.counts.unclassified === 1 ? "" : "s"} could not be classified
              confidently.
            </strong>{" "}
            Nothing was guessed — a wrong call here either wastes a paid search or makes you hand-type a chart that
            already exists publicly. These route to manual filling unless you say otherwise.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ROUTE_BUCKETS.map((type) => (
          <RouteSummary
            key={type}
            type={type}
            brandCount={byType[type].length}
            skuCount={byType[type].reduce((sum, brand) => sum + brand.skuCount, 0)}
            chartCount={byType[type].reduce((sum, brand) => sum + brand.sizingCategories.length, 0)}
            totalSkus={summary.totalSkus}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-[var(--shadow-card)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 pl-1 font-medium text-[var(--color-text-muted)]">
            <Tag className="h-3.5 w-3.5" /> Filter by type:
          </span>
          {(["all", "global", "private", "unclassified"] as BrandTypeFilter[]).map((id) => {
            // Hidden rather than shown as a zero: an "Unclassified 0" chip invites a merchant to
            // hunt for a problem that isn't there.
            if (id === "unclassified" && byType.unclassified.length === 0) return null;

            const active = typeFilter === id;
            const tone = id === "all" ? null : TONE_CLASSES[TYPE_META[id].tone];
            const count = id === "all" ? namedBrands.length : byType[id].length;

            return (
              <button
                key={id}
                type="button"
                onClick={() => setTypeFilter(id)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition-all",
                  tone
                    ? active
                      ? tone.chipActive
                      : tone.chipIdle
                    : active
                      ? "border border-[var(--color-border-strong)] bg-[var(--color-neutral-fill-strong)] text-[var(--color-text-primary)]"
                      : "border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
                )}
              >
                {tone && <span className={cn("h-2 w-2 rounded-full", tone.dot)} />}
                <span>{id === "all" ? "All brands" : TYPE_META[id].plural}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                    active ? "bg-[var(--color-surface-base)]/60" : "bg-[var(--color-surface-base)]"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search brand name…"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] py-1.5 pl-8 pr-3 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--color-brand)]" />
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Discovered brands</h3>
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              (showing {visibleBrands.length} of {filtered.length})
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              <tr>
                <th className="px-6 py-3.5">Brand</th>
                <th className="px-4 py-3.5">Type</th>
                <th className="px-6 py-3.5">Items</th>
                <th className="px-6 py-3.5">Charts needed</th>
                <th className="px-6 py-3.5">Catalog share</th>
                <th className="px-6 py-3.5 text-right">Routes to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {visibleBrands.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-xs text-[var(--color-text-muted)]">
                    {namedBrands.length === 0
                      ? "The scan found no sized stock in your selected categories."
                      : "No brands match the active filter."}
                  </td>
                </tr>
              ) : (
                visibleBrands.map((brand) => <BrandTableRow key={brand.brandKey} brand={brand} />)
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 8 && (
          <div className="flex items-center justify-center border-t border-[var(--color-border)] bg-[var(--color-surface-elevated)]/60 px-6 py-3">
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-brand)] transition-colors hover:text-[var(--color-brand-strong)]"
            >
              {showAll ? (
                <>
                  <ChevronUp className="h-4 w-4" /> Collapse to top brands
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" /> Show all {filtered.length} brands
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RouteSummary({
  type,
  brandCount,
  skuCount,
  chartCount,
  totalSkus,
}: {
  type: ServerBrandType;
  brandCount: number;
  skuCount: number;
  chartCount: number;
  totalSkus: number;
}) {
  const meta = TYPE_META[type];
  const tone = TONE_CLASSES[meta.tone];
  const share = totalSkus > 0 ? ((skuCount / totalSkus) * 100).toFixed(1) : "0.0";

  return (
    <div className={cn("rounded-[var(--radius-2xl)] border p-5 shadow-[var(--shadow-card)]", tone.border, tone.wash)}>
      <div className="flex items-center justify-between">
        <span className={cn("flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider", tone.text)}>
          <span className={cn("h-2.5 w-2.5 rounded-full", tone.dot)} />
          {meta.plural}
        </span>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-bold", tone.border, tone.text)}>
          {/* Unbranded stock is one sentinel row, so "1 brand" would be both true and useless. It is
              grouped by category, so that is what its count has to be. */}
          {type === "none"
            ? `${chartCount} categor${chartCount === 1 ? "y" : "ies"}`
            : `${brandCount} brand${brandCount === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className={cn("mt-2 flex items-center gap-2 text-2xl font-extrabold", tone.text)}>
        <span>{skuCount.toLocaleString()} items</span>
        {meta.tone === "success" ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : meta.tone === "error" ? (
          <AlertTriangle className="h-5 w-5" />
        ) : (
          <Tag className="h-5 w-5" />
        )}
      </div>
      <p className={cn("mt-1 text-xs font-medium", tone.text)}>
        {share}% of catalog · {chartCount} chart{chartCount === 1 ? "" : "s"} · {meta.route}
      </p>
    </div>
  );
}

function BrandTableRow({ brand }: { brand: CoverageBrand }) {
  const meta = TYPE_META[brand.brandType];
  const tone = TONE_CLASSES[meta.tone];

  return (
    <tr
      className={cn(
        "transition-colors",
        meta.tone === "error"
          ? "bg-[var(--color-error-light)]/20 hover:bg-[var(--color-error-light)]/40"
          : meta.tone === "warning"
            ? "bg-[var(--color-warning-light)]/20 hover:bg-[var(--color-warning-light)]/40"
            : "hover:bg-[var(--color-brand-light)]/20"
      )}
    >
      <td className="px-6 py-3.5">
        <p className="font-bold text-[var(--color-text-primary)]">{brand.name ?? "No brand detected"}</p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
          {brand.sizingCategories.length} categor{brand.sizingCategories.length === 1 ? "y" : "ies"} ·{" "}
          {brand.rawFormatCount} size format{brand.rawFormatCount === 1 ? "" : "s"}
        </p>
      </td>
      <td className="whitespace-nowrap px-4 py-3.5">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold",
            tone.border,
            tone.text,
            "bg-[var(--color-surface-base)]"
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", tone.dot)} />
          {meta.label}
        </span>
      </td>
      <td className="px-6 py-3.5 font-mono text-[var(--color-text-secondary)]">{brand.skuCount.toLocaleString()}</td>
      <td className="px-6 py-3.5 font-mono text-[var(--color-text-secondary)]">{brand.sizingCategories.length}</td>
      <td className="min-w-[160px] px-6 py-3.5">
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-elevated)]">
            <div className={cn("h-full rounded-full", tone.dot)} style={{ width: `${Math.min(100, brand.share)}%` }} />
          </div>
          <span className="w-12 text-right font-mono text-xs text-[var(--color-text-muted)]">{brand.share}%</span>
        </div>
      </td>
      <td className="px-6 py-3.5 text-right">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
            tone.border,
            tone.text,
            "bg-[var(--color-surface-base)]"
          )}
        >
          {meta.icon} {meta.route}
        </span>
      </td>
    </tr>
  );
}
