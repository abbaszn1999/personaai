"use client";

import * as React from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  ExternalLink,
  Info,
  Loader2,
  PencilLine,
  Plus,
  Table as TableIcon,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import {
  draftColumnsFor,
  emptyDraftRows,
  parseDraft,
  type ChartDraftRow,
  type DraftProblem,
} from "@/lib/sizing/chart-draft";
import { SIZE_TYPE_LABELS } from "@/lib/sizing/size-types";
import {
  isChildAudience,
  isSizingGroup,
  SIZING_GROUP_LABELS,
  type Measurement,
  type SizingGroup,
} from "@/lib/sizing/measurements";
import { audienceCompatible, audienceForPersonaPath } from "@/lib/sizing/variant-match";
import { departmentLeaves, suggestChartName, type DepartmentLeaves } from "@/lib/sizing/manual-chart-coverage";
import type { LeafSourceLink } from "@/lib/catalog/storefront-links";
import type { BrandSourceLink } from "@/lib/sizing/brand-leaf-sources";
import { BrandItemsLinks } from "./brand-items-links";
import {
  absorbedSubCategories,
  formatLeafLabel,
  leafDisplayName,
  PERSONA_DEPARTMENTS,
  personaSizingGroup,
} from "@/modules/store/mapping/persona-taxonomy";
import { useStoreConnectionStore } from "@/modules/store/store";
import { useSizingStore } from "../store";
import type { ChartAudience } from "../server-types";

const AUDIENCE_LABELS: Record<ChartAudience, string> = {
  mens: "Men",
  womens: "Women",
  boys: "Boys",
  girls: "Girls",
  kids: "Kids / unisex",
  unisex: "Adult unisex",
};

type View = { kind: "departments" } | { kind: "fill"; departmentIds: string[]; audience: ChartAudience };

/**
 * Doc Parts 4 and 6 — hand-filling a chart for stock research could not reach.
 *
 * A modal launched from Stage 4's gap tabs rather than a stage of its own: the fix belongs next to
 * the thing that is wrong.
 *
 * Two screens. The first lists the departments this brand stocks in the row's sizing group, each with
 * how many of its subcategories already have a chart. Picking one opens its subcategories: the
 * merchant ticks the ones a single printed table fits, fills that table and saves, and the ticked
 * ones turn green. One department per chart, because a chart is one body block; the template follows
 * from it, so a kids chart asks for age and height and a bottoms chart asks for waist, never chest.
 *
 * The grid opens with size labels seeded and every measurement blank — pre-filling a plausible chest
 * range would attribute invented body data to the merchant, and it is exactly the kind of number
 * nobody re-checks.
 */
export function ManualChartModal() {
  const target = useSizingStore((s) => s.manualChartTarget);
  if (!target) return null;
  // Keyed so opening a different gap remounts with its own rows rather than showing the last one's.
  return <ManualChartForm key={target.id} />;
}

function ManualChartForm() {
  const target = useSizingStore((s) => s.manualChartTarget)!;
  const close = useSizingStore((s) => s.closeManualChart);
  const saveChart = useSizingStore((s) => s.saveManualChart);
  const charts = useSizingStore((s) => s.charts);
  const leafCountRows = useSizingStore((s) => s.chartLeafCounts);
  const leafSources = useSizingStore((s) => s.chartLeafSources);
  const brandSources = useSizingStore((s) => s.chartBrandLeafSources[target.brandKey]);
  const storeSizeType = useStoreConnectionStore((s) => s.storeSizeSettings.default);

  const group: SizingGroup = isSizingGroup(target.sizingCategory) ? target.sizingCategory : "tops";
  const editing = target.editing === true;

  const leafCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of leafCountRows) {
      if (entry.brandKey !== target.brandKey || entry.skuCount <= 0) continue;
      if (personaSizingGroup(entry.leafKey.split(":")[1] ?? "") !== group) continue;
      counts[entry.leafKey] = (counts[entry.leafKey] ?? 0) + entry.skuCount;
    }
    return counts;
  }, [group, leafCountRows, target.brandKey]);

  // Which of this brand's other charts in this group already holds each leaf. Re-read after every
  // save, so a subcategory turns green as soon as the chart that covers it exists.
  const chartedBy = React.useMemo(() => {
    const owners = new Map<string, string>();
    for (const chart of charts) {
      if (chart.id === target.chartId || chart.brandKey !== target.brandKey) continue;
      if (chart.sizingCategory !== target.sizingCategory) continue;
      for (const leaf of chart.coversLeaves) if (!owners.has(leaf)) owners.set(leaf, chart.variantName);
    }
    return owners;
  }, [charts, target.brandKey, target.chartId, target.sizingCategory]);

  // A fresh gap lists what is still missing plus what this brand stocks that already has a chart, so
  // the merchant sees the whole department and what is left of it. Editing lists the chart's own
  // leaves and the uncovered ones it could take on.
  const listedLeaves = React.useMemo(() => {
    const missing = target.coversLeaves ?? [];
    if (editing) {
      return missing.filter((leaf) => {
        const leafAudience = audienceForPersonaPath(leaf);
        return !target.audience || (leafAudience !== null && audienceCompatible(leafAudience, target.audience));
      });
    }
    const stockedCharted = Object.keys(leafCounts).filter((leaf) => chartedBy.has(leaf));
    return [...new Set([...missing, ...stockedCharted])];
  }, [chartedBy, editing, leafCounts, target.audience, target.coversLeaves]);

  const departments = React.useMemo(
    () => departmentLeaves(listedLeaves, editing ? new Set() : new Set(chartedBy.keys())),
    [chartedBy, editing, listedLeaves],
  );

  const [view, setView] = React.useState<View>(() => {
    if (editing && target.audience) {
      return {
        kind: "fill",
        departmentIds: departments.map((dept) => dept.departmentId),
        audience: target.audience,
      };
    }
    // A brand stocked in one department has nothing to choose between, so the list is skipped.
    if (departments.length === 1) {
      return { kind: "fill", departmentIds: [departments[0].departmentId], audience: departments[0].audience };
    }
    return { kind: "departments" };
  });

  const audience = view.kind === "fill" ? view.audience : null;
  const [rows, setRows] = React.useState<ChartDraftRow[]>(
    () => target.seedRows ?? emptyDraftRows(group, audience ?? undefined),
  );
  const [rowsTouched, setRowsTouched] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>(target.selectedLeaves ?? []);
  const [typedName, setTypedName] = React.useState(target.variantName);
  const [nameTouched, setNameTouched] = React.useState(Boolean(target.variantName));
  const [mode, setMode] = React.useState<"table" | "json">("table");
  const [saving, setSaving] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [lastSaved, setLastSaved] = React.useState<{ name: string; leaves: string[] } | null>(null);
  // Problems are only shown once a save has been attempted. Flagging every blank cell the moment
  // the grid opens turns an empty template into a wall of errors before anyone has typed anything.
  const [submitted, setSubmitted] = React.useState(false);

  const variantName = nameTouched ? typedName : suggestChartName(selected);
  const columns = React.useMemo(() => draftColumnsFor(group, audience ?? undefined), [group, audience]);
  const childAudience = audience !== null && isChildAudience(audience);
  const { rows: parsedRows, problems } = React.useMemo(
    () => parseDraft(rows, group, audience ?? undefined),
    [rows, group, audience],
  );
  const shown = submitted ? problems : [];

  const duplicateName = React.useMemo(() => {
    const wanted = variantName.trim().toLowerCase();
    if (!wanted) return false;
    return charts.some(
      (chart) =>
        !chart.shared &&
        chart.id !== target.chartId &&
        chart.brandKey === target.brandKey &&
        chart.sizingCategory === target.sizingCategory &&
        chart.variantName.trim().toLowerCase() === wanted,
    );
  }, [charts, target.brandKey, target.chartId, target.sizingCategory, variantName]);

  const isCharted = (leaf: string) => !editing && chartedBy.has(leaf);
  const shownDepartments: DepartmentLeaves[] =
    view.kind === "fill" ? departments.filter((dept) => view.departmentIds.includes(dept.departmentId)) : [];
  const openInView = shownDepartments.flatMap((dept) => dept.leaves.filter((leaf) => !isCharted(leaf)));
  const allDone = !editing && departments.length > 0 && departments.every((dept) => dept.open.length === 0);

  function resetDraft(nextAudience: ChartAudience | null) {
    setSelected([]);
    setRows(emptyDraftRows(group, nextAudience ?? undefined));
    setRowsTouched(false);
    setTypedName("");
    setNameTouched(false);
    setSubmitted(false);
    setServerError(null);
  }

  function openDepartment(dept: DepartmentLeaves) {
    resetDraft(dept.audience);
    setLastSaved(null);
    setView({ kind: "fill", departmentIds: [dept.departmentId], audience: dept.audience });
  }

  function backToDepartments() {
    const unsaved = selected.length > 0 && (rowsTouched || nameTouched);
    if (unsaved && !window.confirm("Leave this table without saving it?")) return;
    resetDraft(null);
    setView({ kind: "departments" });
  }

  function toggleLeaf(leafKey: string) {
    setSelected((current) =>
      current.includes(leafKey) ? current.filter((leaf) => leaf !== leafKey) : [...current, leafKey],
    );
  }

  function editRow(rowIndex: number, change: (row: ChartDraftRow) => ChartDraftRow) {
    setRowsTouched(true);
    setRows((current) => current.map((row, index) => (index === rowIndex ? change(row) : row)));
  }

  async function handleSave() {
    setSubmitted(true);
    setServerError(null);
    if (!audience) {
      setServerError("Choose a department first.");
      return;
    }
    if (selected.length === 0) {
      setServerError("Tick at least one subcategory this table fits.");
      return;
    }
    if (problems.length > 0 || !variantName.trim()) return;
    if (duplicateName) {
      setServerError(
        `You already have a chart named "${variantName.trim()}" for this brand and category. Choose a different name.`,
      );
      return;
    }

    setSaving(true);
    const savedLeaves = [...selected];
    const savedName = variantName.trim();
    const error = await saveChart({
      rows,
      variantName: savedName,
      coversLeaves: savedLeaves,
      audience,
      keepOpen: !editing,
    });
    setSaving(false);
    if (error) {
      setServerError(error);
      return;
    }
    if (!editing) {
      resetDraft(audience);
      setLastSaved({ name: savedName, leaves: savedLeaves });
    }
  }

  // The JSON view shows what will actually be stored, not a re-rendering of the boxes above. That is
  // the point of having it: doc Part 6 asks for both views synchronized, and a JSON pane echoing the
  // raw text would hide precisely the conversion a merchant might want to check.
  const json = JSON.stringify(
    {
      brand: target.brandName,
      parent_category: group,
      variant_name: variantName.trim() || null,
      size_type: storeSizeType,
      provenance: "manual",
      audience,
      covers_leaves: selected,
      rows: parsedRows,
    },
    null,
    2,
  );

  const departmentName = (id: string) => PERSONA_DEPARTMENTS.find((dept) => dept.id === id)?.name ?? id;
  const title =
    view.kind === "fill" && !editing && shownDepartments.length === 1
      ? `${target.brandName} — ${departmentName(shownDepartments[0].departmentId)} ${SIZING_GROUP_LABELS[group]}`
      : `${target.brandName} — ${SIZING_GROUP_LABELS[group]}`;

  const footer =
    view.kind === "departments" ? (
      <Button size="sm" variant={allDone ? "primary" : "secondary"} onClick={close}>
        {allDone ? <Check className="h-3.5 w-3.5" /> : null}
        {allDone ? "Done" : "Close"}
      </Button>
    ) : (
      <>
        {!editing && departments.length > 1 && (
          <Button variant="ghost" size="sm" onClick={backToDepartments} disabled={saving} className="mr-auto">
            <ArrowLeft className="h-3.5 w-3.5" /> All departments
          </Button>
        )}
        <Button variant={allDone ? "primary" : "secondary"} size="sm" onClick={close} disabled={saving}>
          {editing ? "Cancel" : allDone ? "Done" : "Close"}
        </Button>
        {(editing || openInView.length > 0) && (
          <Button size="sm" onClick={() => void handleSave()} disabled={saving || selected.length === 0}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {editing ? "Save changes" : "Save chart"}
          </Button>
        )}
      </>
    );

  return (
    <Modal
      isOpen
      onClose={close}
      size="xl"
      icon={<PencilLine className="h-4 w-4" />}
      title={title}
      description={`${target.skuCount.toLocaleString()} item${target.skuCount === 1 ? "" : "s"} depend on this chart`}
      footer={footer}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">{target.reason}</Badge>
        <Badge variant="neutral">Sizes read as {SIZE_TYPE_LABELS[storeSizeType]}</Badge>
        {view.kind === "fill" && selected.length > 0 && (
          <div className="ml-auto inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] p-0.5">
            <ViewTab active={mode === "table"} onClick={() => setMode("table")} icon={<TableIcon className="h-3 w-3" />}>
              Table
            </ViewTab>
            <ViewTab active={mode === "json"} onClick={() => setMode("json")} icon={<Code2 className="h-3 w-3" />}>
              JSON
            </ViewTab>
          </div>
        )}
      </div>

      {view.kind === "departments" ? (
        <DepartmentPicker
          departments={departments}
          leafCounts={leafCounts}
          allDone={allDone}
          onOpen={openDepartment}
        />
      ) : (
        <>
          {lastSaved && (
            <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-3 py-2.5">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
              <p className="text-xs text-[var(--color-text-primary)]">
                Saved <strong>{lastSaved.name}</strong> for {lastSaved.leaves.map(leafDisplayName).join(", ")}.
                {openInView.length > 0
                  ? " Tick the next subcategories to fill their table."
                  : departments.length > 1
                    ? " Every subcategory here has a chart now. Go back to the departments for the next one."
                    : " Every subcategory here has a chart now."}
              </p>
            </div>
          )}

          <div className="mt-4 space-y-4">
            {shownDepartments.map((dept) => (
              <SubcategoryChecklist
                key={dept.departmentId}
                department={dept}
                showHeading={editing || shownDepartments.length > 1}
                selected={selected}
                isCharted={isCharted}
                chartedBy={chartedBy}
                leafCounts={leafCounts}
                leafSources={leafSources}
                brandSources={brandSources}
                brandName={target.brandName}
                onToggle={toggleLeaf}
                onSelectAll={() =>
                  setSelected((current) => [
                    ...new Set([...current, ...dept.leaves.filter((leaf) => !isCharted(leaf))]),
                  ])
                }
                onClear={() => setSelected((current) => current.filter((leaf) => !dept.leaves.includes(leaf)))}
              />
            ))}
          </div>

          {selected.length === 0 ? (
            openInView.length > 0 ? (
              <p className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">
                Tick the subcategories one printed size table fits, then fill that table here.
              </p>
            ) : (
              !lastSaved && (
                <p className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">
                  Every subcategory here already has a chart. Change one from Saved private charts with Edit.
                </p>
              )
            )
          ) : (
            <>
              <label className="mt-5 block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Chart name
                </span>
                <input
                  value={variantName}
                  onChange={(event) => {
                    setNameTouched(true);
                    setTypedName(event.target.value);
                  }}
                  placeholder="Regular chart"
                  className={cn(
                    "mt-1 w-full max-w-md rounded-[var(--radius-md)] border bg-[var(--color-surface-base)] px-2.5 py-1.5 text-sm font-semibold text-[var(--color-text-primary)] focus:outline-none",
                    (submitted && !variantName.trim()) || duplicateName
                      ? "border-[var(--color-error)]"
                      : "border-[var(--color-border)] focus:border-[var(--color-brand)]",
                  )}
                />
                {duplicateName && (
                  <span className="mt-1 block text-[11px] font-semibold text-[var(--color-error)]">
                    You already have a chart with this name for this brand and category.
                  </span>
                )}
                <span className="mt-1 block text-[11px] text-[var(--color-text-muted)]">
                  Only tells this table apart from your other ones. The ticked subcategories decide which
                  products it sizes.
                </span>
              </label>

              <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
                <p className="text-xs text-[var(--color-text-muted)]">
                  {audience ? (
                    <>
                      Template for <strong>{AUDIENCE_LABELS[audience]}</strong> {SIZING_GROUP_LABELS[group]}:{" "}
                      {columns.map((column) => `${column.label}${column.required ? " (required)" : ""}`).join(", ")}
                      {childAudience ? ", plus the Age each size is for. " : ". "}
                    </>
                  ) : null}
                  Enter the <strong>body measurements</strong> each size fits, in centimetres, not the garment laid
                  flat. Ranges like <code>96-104</code> are best; <code>120+</code> and <code>up to 86</code> work too.
                </p>
              </div>

              {mode === "table" ? (
                <DraftGrid
                  rows={rows}
                  columns={columns}
                  childAudience={childAudience}
                  problems={shown}
                  onSize={(index, value) => editRow(index, (row) => ({ ...row, size: value }))}
                  onAge={(index, value) => editRow(index, (row) => ({ ...row, age: value }))}
                  onCell={(index, measurement, value) =>
                    editRow(index, (row) => ({ ...row, values: { ...row.values, [measurement]: value } }))
                  }
                  onRemove={(index) => {
                    setRowsTouched(true);
                    setRows((current) => current.filter((_, i) => i !== index));
                  }}
                />
              ) : (
                <pre className="mt-4 max-h-[22rem] overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4 font-mono text-[11px] leading-relaxed text-[var(--color-success)]">
                  <code>{json}</code>
                </pre>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRowsTouched(true);
                    setRows((current) => [...current, { size: "", values: {} }]);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add a size
                </Button>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  {parsedRows.length} size{parsedRows.length === 1 ? "" : "s"} ready to save
                </p>
              </div>
            </>
          )}

          {(shown.length > 0 || serverError) && (
            <ul className="mt-3 space-y-1 rounded-[var(--radius-lg)] border border-[var(--color-error)]/40 bg-[var(--color-error-light)] px-3 py-2.5">
              {serverError && <li className="text-xs text-[var(--color-error)]">{serverError}</li>}
              {shown.slice(0, 6).map((problem, index) => (
                <li key={index} className="text-xs text-[var(--color-error)]">
                  Row {problem.rowIndex + 1}: {problem.message}
                </li>
              ))}
              {shown.length > 6 && (
                <li className="text-xs text-[var(--color-error)]">…and {shown.length - 6} more.</li>
              )}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}

function DepartmentPicker({
  departments,
  leafCounts,
  allDone,
  onOpen,
}: {
  departments: DepartmentLeaves[];
  leafCounts: Record<string, number>;
  allDone: boolean;
  onOpen: (dept: DepartmentLeaves) => void;
}) {
  if (departments.length === 0) {
    return (
      <p className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-3 py-6 text-center text-xs text-[var(--color-text-muted)]">
        No mapped subcategories were found for this brand here. Check the Mapping step, then run the scan again.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        Choose a department
      </p>
      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
        Each department gets its own tables. Open one, tick the subcategories a table fits and save it.
      </p>
      {allDone && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-success)]">
          <CheckCircle2 className="h-3.5 w-3.5" /> Every subcategory of this brand has a chart.
        </p>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {departments.map((dept) => {
          const def = PERSONA_DEPARTMENTS.find((item) => item.id === dept.departmentId);
          const done = dept.leaves.length - dept.open.length;
          const complete = dept.open.length === 0;
          const items = dept.leaves.reduce((sum, leaf) => sum + (leafCounts[leaf] ?? 0), 0);
          return (
            <button
              key={dept.departmentId}
              type="button"
              onClick={() => onOpen(dept)}
              className={cn(
                "group flex items-center gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-colors",
                complete
                  ? "border-[var(--color-success)]/40 bg-[var(--color-success-light)]/50"
                  : "border-[var(--color-border)] bg-[var(--color-surface-base)] hover:border-[var(--color-brand)]/50",
              )}
            >
              <span
                className="h-8 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: def?.accentColor ?? "var(--color-border)" }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--color-text-primary)]">
                  {def?.name ?? dept.departmentId}
                  {complete && <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />}
                </span>
                <span className="mt-0.5 block text-[11px] text-[var(--color-text-muted)]">
                  {dept.leaves.length} subcategor{dept.leaves.length === 1 ? "y" : "ies"}
                  {items > 0 ? ` · ${items.toLocaleString()} items` : ""}
                </span>
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-elevated)]">
                    <span
                      className="block h-full rounded-full bg-[var(--color-success)] transition-all"
                      style={{ width: `${(done / dept.leaves.length) * 100}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold text-[var(--color-text-muted)]">
                    {done} of {dept.leaves.length} charted
                  </span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-text-muted)] transition-colors group-hover:text-[var(--color-brand)]" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SubcategoryChecklist({
  department,
  showHeading,
  selected,
  isCharted,
  chartedBy,
  leafCounts,
  leafSources,
  brandSources,
  brandName,
  onToggle,
  onSelectAll,
  onClear,
}: {
  department: DepartmentLeaves;
  showHeading: boolean;
  selected: string[];
  isCharted: (leaf: string) => boolean;
  chartedBy: ReadonlyMap<string, string>;
  leafCounts: Record<string, number>;
  leafSources: Record<string, LeafSourceLink[]>;
  /** This brand's own collections per subcategory; absent until a scan has saved them. */
  brandSources: Record<string, BrandSourceLink[]> | undefined;
  brandName: string;
  onToggle: (leaf: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const def = PERSONA_DEPARTMENTS.find((item) => item.id === department.departmentId);
  const openLeaves = department.leaves.filter((leaf) => !isCharted(leaf));
  const done = department.leaves.length - openLeaves.length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {showHeading ? `${def?.name ?? department.departmentId} subcategories` : "Subcategories"}
        </span>
        <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">
          {done} of {department.leaves.length} charted
        </span>
        {openLeaves.length > 1 && (
          <div className="ml-auto flex gap-1">
            <button type="button" onClick={onSelectAll} className="text-[11px] font-semibold text-[var(--color-brand)]">
              Select all remaining
            </button>
            <span className="text-[var(--color-border)]">·</span>
            <button type="button" onClick={onClear} className="text-[11px] font-semibold text-[var(--color-text-muted)]">
              Clear
            </button>
          </div>
        )}
      </div>
      <ul className="mt-2 divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)]">
        {department.leaves.map((leaf) => {
          const charted = isCharted(leaf);
          const checked = selected.includes(leaf);
          const sub = leaf.split(":")[2] ?? leaf;
          const absorbed = absorbedSubCategories(leaf);
          const count = leafCounts[leaf] ?? 0;
          return (
            <li
              key={leaf}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                checked && "bg-[var(--color-brand-light)]/40",
                charted && "bg-[var(--color-success-light)]/30",
              )}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={charted || checked}
                disabled={charted}
                onClick={() => onToggle(leaf)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
              >
                {charted ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-success)]" />
                ) : (
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      checked
                        ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white"
                        : "border-[var(--color-border)] bg-[var(--color-surface-base)]",
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-[var(--color-text-primary)]">
                    {formatLeafLabel(sub, department.departmentId)}
                  </span>
                  <span className="block text-[11px] text-[var(--color-text-muted)]">
                    {charted
                      ? `In your chart "${chartedBy.get(leaf)}"`
                      : absorbed.length > 0
                        ? `Includes ${absorbed.map((name) => formatLeafLabel(name)).join(", ")}`
                        : null}
                  </span>
                </span>
              </button>
              {count > 0 && (
                <span className="shrink-0 font-mono text-[11px] font-semibold text-[var(--color-text-secondary)]">
                  {count.toLocaleString()} item{count === 1 ? "" : "s"}
                </span>
              )}
              {/* This brand's own collections when the scan has saved them; before that, every
                  collection mapped to the subcategory, which is what this list used to be. */}
              {brandSources?.[leaf]?.length ? (
                <BrandItemsLinks links={brandSources[leaf]} brandName={brandName} />
              ) : (
                <SourceLinks sources={leafSources[leaf] ?? []} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Where this subcategory's products live on the storefront: the collections mapped to it in Mapping.
 * One collection opens directly; several open a short list, each link in its own tab.
 */
function SourceLinks({ sources }: { sources: LeafSourceLink[] }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const linked = sources.filter((source) => source.url);
  const linkClass =
    "inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]";

  if (linked.length === 0) {
    return (
      <span
        className="shrink-0 text-[11px] text-[var(--color-text-muted)]"
        title={sources.length > 0 ? "These collections have no public address" : "No collection is mapped here"}
      >
        No store link
      </span>
    );
  }
  if (linked.length === 1) {
    return (
      <a href={linked[0].url!} target="_blank" rel="noopener noreferrer" className={cn(linkClass, "shrink-0")}>
        View items <ExternalLink className="h-3 w-3" />
      </a>
    );
  }
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((value) => !value)} className={linkClass} aria-expanded={open}>
        View items ({linked.length})
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-72 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-1.5 shadow-[var(--shadow-elevated)]">
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Collections mapped here
          </p>
          {linked.map((source) => (
            <a
              key={source.categoryId}
              href={source.url!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--color-brand-light)]/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-[var(--color-text-primary)]">{source.name}</span>
                <span className="block truncate text-[10px] text-[var(--color-text-muted)]">
                  {source.trail.join(" / ")} · {source.productCount.toLocaleString()} products
                </span>
              </span>
              <ExternalLink className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function DraftGrid({
  rows,
  columns,
  childAudience,
  problems,
  onSize,
  onAge,
  onCell,
  onRemove,
}: {
  rows: ChartDraftRow[];
  columns: ReturnType<typeof draftColumnsFor>;
  childAudience: boolean;
  problems: DraftProblem[];
  onSize: (rowIndex: number, value: string) => void;
  onAge: (rowIndex: number, value: string) => void;
  onCell: (rowIndex: number, measurement: Measurement, value: string) => void;
  onRemove: (rowIndex: number) => void;
}) {
  const heading =
    "whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]";
  const input =
    "w-full rounded-[var(--radius-md)] border bg-[var(--color-surface-base)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none";
  const tone = (bad: boolean) =>
    bad ? "border-[var(--color-error)]" : "border-[var(--color-border)] focus:border-[var(--color-brand)]";

  return (
    <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)]">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-[var(--color-surface-elevated)]">
            <th className={heading}>Size</th>
            {childAudience && (
              <th className={heading}>
                <span className="flex items-center gap-1">
                  Age
                  <Badge variant="default" className="px-1 py-0 text-[8px]">Req</Badge>
                </span>
              </th>
            )}
            {columns.map((column) => (
              <th key={column.measurement} className={heading}>
                <span className="flex items-center gap-1">
                  {column.label}
                  <Badge variant={column.required ? "default" : "neutral"} className="px-1 py-0 text-[8px]">
                    {column.required ? "Req" : "Opt"}
                  </Badge>
                </span>
              </th>
            ))}
            <th className="w-10 px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td className="px-2 py-1.5">
                <input
                  value={row.size}
                  onChange={(event) => onSize(rowIndex, event.target.value)}
                  placeholder="M"
                  aria-label={`Size label for row ${rowIndex + 1}`}
                  className={cn(input, "font-semibold", tone(cellHasProblem(problems, rowIndex, undefined)))}
                />
              </td>
              {childAudience && (
                <td className="px-2 py-1.5">
                  <input
                    value={row.age ?? ""}
                    onChange={(event) => onAge(rowIndex, event.target.value)}
                    placeholder="8-9y"
                    aria-label={`Age for row ${rowIndex + 1}`}
                    className={cn(
                      input,
                      tone(problems.some((problem) => problem.rowIndex === rowIndex && problem.alias === "age")),
                    )}
                  />
                </td>
              )}
              {columns.map((column) => (
                <td key={column.measurement} className="px-2 py-1.5">
                  <input
                    value={row.values[column.measurement] ?? ""}
                    onChange={(event) => onCell(rowIndex, column.measurement, event.target.value)}
                    placeholder={column.required ? "96-104" : "—"}
                    aria-label={`${column.label} for row ${rowIndex + 1}`}
                    className={cn(input, "font-mono", tone(cellHasProblem(problems, rowIndex, column.measurement)))}
                  />
                </td>
              ))}
              <td className="px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => onRemove(rowIndex)}
                  aria-label={`Remove row ${rowIndex + 1}`}
                  className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-error)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cellHasProblem(problems: DraftProblem[], rowIndex: number, measurement?: Measurement): boolean {
  return problems.some((p) => p.rowIndex === rowIndex && p.measurement === measurement);
}

function ViewTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors",
        active
          ? "bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
