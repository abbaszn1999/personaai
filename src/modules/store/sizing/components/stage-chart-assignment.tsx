"use client";

import * as React from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Eye,
  ExternalLink,
  Filter,
  Loader2,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import { SIZING_GROUP_KEYS, SIZING_GROUP_LABELS, isSizingGroup } from "@/lib/sizing/measurements";
import { MappingSelect, type SelectOption } from "@/modules/store/components/mapping-select";
import { useSizingStore } from "../store";
import type { AssignableVariant, PathAssignment } from "../server-types";
import { StageHeaderBanner } from "./stage-header-banner";

/** Dropdown value for "this path publishes no chart". A sentinel because `<option value="">` and a
 *  real variant named the empty string are indistinguishable to a form. */
const NO_CHART = "__none__";

type StatusFilter = "all" | "assigned" | "unresolved" | "auto" | "merchant" | "skipped";

/**
 * Stage 5 — doc Part 7's Chart Assignment. Which of a brand's published charts governs which of the
 * merchant's own category paths.
 *
 * The stage exists because research and the catalog each know half the answer. Research can prove that
 * Tommy Hilfiger publishes a men's tops table and a women's one; it cannot know that this store's
 * `Sale > Tops` is womenswear. The merchant knows that and nothing else in the pipeline does, so this
 * is the one screen where a human decision is the point rather than a fallback.
 *
 * The rows come from `sizing_path_coverage`, which the scan aggregates as counts only — brand, deepest
 * mapped category, sizing parent, SKU count. No product rows are stored to build this screen, which is
 * the same constraint every other stage works under.
 *
 * Unambiguous cases arrive already resolved: a brand publishing one chart for a parent, or a path whose
 * own breadcrumb names an audience exactly one variant matches. Everything else is left blank on
 * purpose. Guessing between a brand's Regular and its Petite line sizes every shopper on that path
 * against the wrong body and reports the path as governed, which is worse than leaving it obviously
 * undone.
 */
export function StageChartAssignment() {
  const paths = useSizingStore((s) => s.assignmentPaths);
  const totals = useSizingStore((s) => s.assignmentTotals);
  const autoMatched = useSizingStore((s) => s.assignmentAutoMatched);
  const loading = useSizingStore((s) => s.assignmentsLoading);
  const loaded = useSizingStore((s) => s.assignmentsLoaded);
  const error = useSizingStore((s) => s.assignmentsError);
  const saving = useSizingStore((s) => s.assignmentSaving);
  const loadAssignments = useSizingStore((s) => s.loadAssignments);
  const setPathVariant = useSizingStore((s) => s.setPathVariant);

  const [query, setQuery] = React.useState("");
  const [brandFilter, setBrandFilter] = React.useState("all");
  const [parentFilter, setParentFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [previewing, setPreviewing] = React.useState<{ path: PathAssignment; variant: AssignableVariant } | null>(null);
  const [inspecting, setInspecting] = React.useState<PathAssignment | null>(null);

  React.useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const brands = React.useMemo(
    () => [...new Set(paths.map((path) => path.brandName))].sort((a, b) => a.localeCompare(b)),
    [paths]
  );

  const filtered = React.useMemo(
    () =>
      paths.filter((path) => {
        const needle = query.trim().toLowerCase();
        if (needle) {
          const haystack = [path.brandName, path.categoryPath.join(" › "), path.sizingCategory, path.variantName ?? ""];
          if (!haystack.some((value) => value.toLowerCase().includes(needle))) return false;
        }
        if (brandFilter !== "all" && path.brandName !== brandFilter) return false;
        if (parentFilter !== "all" && path.sizingCategory !== parentFilter) return false;

        const state = stateOf(path);
        if (statusFilter === "assigned" && state !== "assigned") return false;
        if (statusFilter === "unresolved" && state !== "unresolved") return false;
        if (statusFilter === "skipped" && state !== "skipped") return false;
        if (statusFilter === "auto" && !(state === "assigned" && path.source === "auto")) return false;
        if (statusFilter === "merchant" && !(state === "assigned" && path.source === "merchant")) return false;
        return true;
      }),
    [paths, query, brandFilter, parentFilter, statusFilter]
  );

  const filtersActive = query !== "" || brandFilter !== "all" || parentFilter !== "all" || statusFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setBrandFilter("all");
    setParentFilter("all");
    setStatusFilter("all");
  };

  if (loading && !loaded) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-10 text-sm text-[var(--color-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading your category paths…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StageHeaderBanner
        stageNumber={5}
        eyebrow="Mapping Rules"
        title={
          totals.paths === 0
            ? "No category paths to assign yet"
            : `${totals.assigned} of ${totals.paths} category paths assigned`
        }
        description={
          totals.paths === 0
            ? "Category paths come from the catalog scan. Read the catalog first, then research at least one brand."
            : `Every product under a path inherits the chart you pick for it. ${totals.assignedSkus.toLocaleString()} item${totals.assignedSkus === 1 ? "" : "s"} are covered so far${autoMatched > 0 ? `, including ${autoMatched} path${autoMatched === 1 ? "" : "s"} matched automatically where there was only one possible answer` : ""}.`
        }
        actions={
          <Button variant="ghost" size="sm" onClick={() => void loadAssignments({ force: true })} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {error && (
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-error-border)] bg-[var(--color-error-light)] px-4 py-3 text-xs text-[var(--color-error)]">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Category paths" value={`${totals.paths}`} />
        <StatCard label="Assigned" value={`${totals.assigned}`} tone="success" />
        <StatCard
          label="Unresolved"
          value={`${totals.unresolved}`}
          detail={`${totals.unresolvedSkus.toLocaleString()} items`}
          tone={totals.unresolved > 0 ? "warning" : "neutral"}
        />
        <StatCard label="Items covered" value={totals.assignedSkus.toLocaleString()} tone="info" />
      </div>

      {/* The unresolved banner is the one thing on this screen that has to be impossible to miss: an
          unassigned path is stock that will publish with no size chart, and nothing downstream says so.
          Skipped paths are excluded — that is a decision the merchant already made. */}
      {totals.unresolved > 0 && (
        <div className="flex flex-col gap-3 rounded-[var(--radius-2xl)] border border-[var(--color-warning-border)] bg-[var(--color-warning-light)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
            <div>
              <p className="text-sm font-bold text-[var(--color-text-primary)]">
                {totals.unresolved} path{totals.unresolved === 1 ? "" : "s"} have no chart assigned (
                {totals.unresolvedSkus.toLocaleString()} item{totals.unresolvedSkus === 1 ? "" : "s"})
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                Those products will publish without a size chart. Either pick a variant, or set the path to
                &ldquo;No chart&rdquo; so it stops being counted as outstanding work.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => setStatusFilter("unresolved")}
          >
            <Filter className="h-3.5 w-3.5" /> Show only these
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by brand, category path or chart variant…"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] py-2 pl-8 pr-3 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-3">
          <SelectFilter
            label="Brand"
            value={brandFilter}
            onChange={setBrandFilter}
            options={[
              { key: "all", label: `All brands (${brands.length})` },
              ...brands.map((brand) => ({ key: brand, label: brand })),
            ]}
          />

          <SelectFilter
            label="Parent"
            value={parentFilter}
            onChange={setParentFilter}
            options={[
              { key: "all", label: "All 5 parents" },
              ...SIZING_GROUP_KEYS.map((key) => ({ key, label: SIZING_GROUP_LABELS[key] })),
            ]}
          />

          <SelectFilter
            label="Status"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as StatusFilter)}
            options={[
              { key: "all", label: `All statuses (${totals.paths})` },
              { key: "assigned", label: `Assigned (${totals.assigned})` },
              { key: "unresolved", label: `Unresolved (${totals.unresolved})` },
              { key: "skipped", label: `No chart by choice (${totals.skipped})` },
              { key: "auto", label: "Matched automatically" },
              { key: "merchant", label: "Chosen by you" },
            ]}
          />

          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto text-xs font-semibold text-[var(--color-brand)] hover:underline"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      <AssignmentTable
        paths={filtered}
        hasPaths={paths.length > 0}
        savingId={saving}
        onSelect={(path, value) => void setPathVariant(path.id, value)}
        onPreview={(path, variant) => setPreviewing({ path, variant })}
        onInspect={setInspecting}
      />

      {previewing && (
        <ChartPreviewModal
          path={previewing.path}
          variant={previewing.variant}
          onClose={() => setPreviewing(null)}
        />
      )}
      {inspecting && <PathInspectorModal path={inspecting} onClose={() => setInspecting(null)} />}
    </div>
  );
}

/** The four states a row can be in. Kept as one function so the table, the filters and the counts
 *  cannot each decide "unresolved" differently. */
type PathState = "assigned" | "unresolved" | "skipped" | "no_variants";

function stateOf(path: PathAssignment): PathState {
  if (path.variantName !== null && !path.missingVariant) return "assigned";
  if (path.decided && path.variantName === null) return "skipped";
  // Nothing has been researched for this brand and parent yet, so there is nothing to choose between.
  // Distinct from unresolved, because the fix is on Stage 4 rather than here.
  if (path.variants.length === 0 && !path.decided) return "no_variants";
  return "unresolved";
}

function AssignmentTable({
  paths,
  hasPaths,
  savingId,
  onSelect,
  onPreview,
  onInspect,
}: {
  paths: PathAssignment[];
  hasPaths: boolean;
  savingId: string | null;
  onSelect: (path: PathAssignment, variantName: string | null) => void;
  onPreview: (path: PathAssignment, variant: AssignableVariant) => void;
  onInspect: (path: PathAssignment) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-brand-light)]/30 px-6 py-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-brand)]" />
        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
          Brand &amp; category path → chart variant ({paths.length})
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            <tr>
              <th className="px-6 py-3.5">Brand</th>
              <th className="px-6 py-3.5">Merchant category path</th>
              <th className="px-6 py-3.5">Parent</th>
              <th className="px-6 py-3.5">Assigned chart variant</th>
              <th className="px-6 py-3.5 text-center">SKUs governed</th>
              <th className="px-6 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {paths.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-xs text-[var(--color-text-muted)]">
                  {hasPaths
                    ? "No category path matches the active filters."
                    : "No category paths yet. They are aggregated by the catalog scan, so read the catalog first."}
                </td>
              </tr>
            ) : (
              paths.map((path) => {
                const state = stateOf(path);
                const busy = savingId === path.id;
                const selected = path.variants.find((variant) => variant.variantName === path.variantName) ?? null;

                return (
                  <tr
                    key={path.id}
                    className={cn(
                      "transition-colors",
                      state === "unresolved"
                        ? "border-l-4 border-l-[var(--color-warning)] bg-[var(--color-warning-light)]/30 hover:bg-[var(--color-warning-light)]/50"
                        : "hover:bg-[var(--color-brand-light)]/20"
                    )}
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[var(--color-text-primary)]">{path.brandName}</span>
                        <BrandTypeTag type={path.brandType} />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2.5 py-1 font-mono text-[11px] font-semibold text-[var(--color-text-primary)]">
                        {path.categoryPath.join(" › ") || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-brand-strong)]">
                        {path.sizingCategory}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <VariantPicker path={path} state={state} busy={busy} onSelect={onSelect} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => onInspect(path)}
                        title="What this rule governs"
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2.5 py-1 font-mono text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
                      >
                        <Package className="h-3 w-3" /> {path.skuCount.toLocaleString()}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => selected && onPreview(path, selected)}
                          disabled={!selected}
                          title={selected ? "Check the numbers behind this assignment" : "Nothing assigned to preview"}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Eye className="h-3.5 w-3.5" /> View chart
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The dropdown, plus what the current choice means.
 *
 * "No chart" is offered as a real option rather than left as the absence of one. A merchant who has
 * looked at a path and decided it publishes nothing needs a way to say so — otherwise the unresolved
 * count never reaches zero and stops being a signal.
 */
function VariantPicker({
  path,
  state,
  busy,
  onSelect,
}: {
  path: PathAssignment;
  state: PathState;
  busy: boolean;
  onSelect: (path: PathAssignment, variantName: string | null) => void;
}) {
  if (state === "no_variants") {
    return (
      <p className="text-xs text-[var(--color-text-muted)]">
        No chart researched for this brand and parent yet — generate it on Stage 4.
      </p>
    );
  }

  const value = path.variantName !== null && !path.missingVariant ? path.variantName : state === "skipped" ? NO_CHART : "";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <MappingSelect
          options={[
            ...path.variants.map((variant) => ({
              key: variant.variantName,
              label: variant.variantName,
              hint: `${variant.audience} · ${variant.confidence}% confidence`,
            })),
            { key: NO_CHART, label: "No chart for this path" },
          ]}
          value={value}
          onChange={(next) => onSelect(path, next === NO_CHART ? null : next)}
          label={`Chart variant for ${path.brandName}, ${path.categoryPath.join(" › ")}`}
          saving={busy}
          placeholder="Pick a chart variant…"
          className={cn(
            "max-w-xs flex-1",
            state === "unresolved" && "border-[var(--color-warning-border)] bg-[var(--color-warning-light)]"
          )}
        />

        {state === "assigned" && path.source === "auto" && (
          <span
            title="Matched automatically because there was exactly one possible answer. Change it freely."
            className="inline-flex shrink-0 cursor-help items-center gap-1 rounded-md border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-brand-strong)]"
          >
            <Sparkles className="h-3 w-3" /> Auto
          </span>
        )}
        {state === "assigned" && path.source === "merchant" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-success)]">
            <CheckCircle2 className="h-3 w-3" /> Yours
          </span>
        )}
        {state === "skipped" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-text-secondary)]">
            <Ban className="h-3 w-3" /> No chart
          </span>
        )}
      </div>

      {/* The stored choice no longer exists. Said out loud rather than silently reset, because the
          merchant's decision is still the best evidence of what they wanted. */}
      {path.missingVariant && (
        <p className="text-[11px] font-semibold text-[var(--color-warning)]">
          &ldquo;{path.variantName}&rdquo; is gone — research renamed or dropped it. Pick again.
        </p>
      )}
      {state === "unresolved" && !path.missingVariant && (
        <p className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-warning)]">
          <AlertTriangle className="h-3 w-3" /> {path.skuCount.toLocaleString()} item
          {path.skuCount === 1 ? "" : "s"} will publish with no size chart
        </p>
      )}
    </div>
  );
}

function BrandTypeTag({ type }: { type: PathAssignment["brandType"] }) {
  const label = type === "none" ? "No brand" : type;
  const toneClass =
    type === "global"
      ? "border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
      : type === "private"
        ? "border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
        : "border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]";

  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize", toneClass)}>{label}</span>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "success" | "warning" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "border-[var(--color-success)]/25 bg-[var(--color-success-light)]/50"
      : tone === "warning"
        ? "border-[var(--color-warning-border)] bg-[var(--color-warning-light)]/60"
        : tone === "info"
          ? "border-[var(--color-brand)]/25 bg-[var(--color-brand-light)]/40"
          : "border-[var(--color-border)] bg-[var(--color-surface-card)]";

  return (
    <div className={cn("rounded-[var(--radius-xl)] border p-3.5", toneClass)}>
      <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-[var(--color-text-primary)]">{value}</p>
      {detail && <p className="text-[11px] text-[var(--color-text-secondary)]">{detail}</p>}
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
      <span className="text-[11px] text-[var(--color-text-muted)]">{label}:</span>
      <MappingSelect
        options={options}
        value={value}
        onChange={onChange}
        label={`${label} filter`}
        compact
        className="min-w-36"
      />
    </div>
  );
}

/** The numbers behind an assignment, so a merchant can check the chart rather than trust its name. */
function ChartPreviewModal({
  path,
  variant,
  onClose,
}: {
  path: PathAssignment;
  variant: AssignableVariant;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      title={
        <>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand)]">
            Assigned chart
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
            {path.brandName} — {variant.variantName}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold",
                variant.needsReview
                  ? "border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                  : "border-[var(--color-success)]/30 bg-[var(--color-success-light)] text-[var(--color-success)]"
              )}
            >
              <ShieldCheck className="h-3 w-3" /> {variant.confidence}%
            </span>
          </span>
        </>
      }
    >
      <p className="text-xs text-[var(--color-text-secondary)]">
        Governs {path.skuCount.toLocaleString()} item{path.skuCount === 1 ? "" : "s"} under{" "}
        <span className="font-mono font-semibold text-[var(--color-text-primary)]">
          {path.categoryPath.join(" › ")}
        </span>
        . Published for <span className="font-semibold">{variant.audience}</span>
        {variant.variantFitType ? `, ${variant.variantFitType} fit` : ""}. All measurements are of the body, in
        centimetres.
      </p>

      <div className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            <tr>
              {variant.headers.map((header) => (
                <th key={header} className="px-3 py-2.5">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] font-mono text-[var(--color-text-primary)]">
            {variant.rows.map((row, index) => (
              <tr key={index}>
                {variant.headers.map((header) => (
                  <td key={header} className="px-3 py-2">
                    {row[header] || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 truncate text-[11px] text-[var(--color-text-muted)]">
        From {variant.sourceTitle || "an untitled table"}
        {variant.sourceUrl && (
          <>
            {" · "}
            <a
              href={variant.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--color-brand)] hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> source
            </a>
          </>
        )}
      </p>
    </Modal>
  );
}

/**
 * What a rule governs, without listing products.
 *
 * The demo version listed matching SKUs. This one deliberately cannot: the scan stores a count per
 * path and no product rows, so naming individual products here would mean either storing the
 * merchant's catalog or paging their store live to populate a modal. The count, the parent and the
 * measurements the chart is matched on are what the decision actually rests on.
 */
function PathInspectorModal({ path, onClose }: { path: PathAssignment; onClose: () => void }) {
  const state = stateOf(path);

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      title={
        <>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand)]">
            What this rule governs
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
            {path.brandName} — {path.categoryPath.join(" › ")}
            <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-text-secondary)]">
              <Package className="h-3 w-3" /> {path.skuCount.toLocaleString()} SKUs
            </span>
          </span>
        </>
      }
    >
      <dl className="space-y-3 text-xs">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-3">
          <dt className="font-semibold text-[var(--color-text-muted)]">Sizing parent</dt>
          <dd className="text-right">
            <span className="font-mono font-bold text-[var(--color-text-primary)]">{path.sizingCategory}</span>
            {isSizingGroup(path.sizingCategory) && (
              <p className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
                {SIZING_GROUP_LABELS[path.sizingCategory]}
              </p>
            )}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-3">
          <dt className="font-semibold text-[var(--color-text-muted)]">Inherited chart</dt>
          <dd className="text-right font-bold text-[var(--color-text-primary)]">
            {state === "assigned" ? (
              path.variantName
            ) : state === "skipped" ? (
              <span className="text-[var(--color-text-secondary)]">None, by your choice</span>
            ) : (
              <span className="text-[var(--color-warning)]">Nothing yet</span>
            )}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="font-semibold text-[var(--color-text-muted)]">Variants available</dt>
          <dd className="text-right font-bold text-[var(--color-text-primary)]">{path.variants.length}</dd>
        </div>
      </dl>

      <p className="mt-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2.5 text-[11px] text-[var(--color-text-secondary)]">
        Every product filed under this category and carrying this brand inherits the assignment — the rule is stored
        once against the path rather than copied onto each product, which is why your catalog does not have to live in
        our database for this to work.
      </p>
    </Modal>
  );
}
