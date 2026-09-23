"use client";

import * as React from "react";
import { Check, Code2, Info, Loader2, PencilLine, Plus, Table as TableIcon, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import {
  draftColumnsFor,
  emptyDraftRows,
  parseDraft,
  type ChartDraftRow,
  type DraftProblem,
} from "@/lib/sizing/chart-draft";
import { SIZE_TYPE_LABELS } from "@/lib/sizing/size-types";
import { isSizingGroup, SIZING_GROUP_LABELS, type Measurement, type SizingGroup } from "@/lib/sizing/measurements";
import { audienceCompatible, audienceForPersonaPath } from "@/lib/sizing/variant-match";
import {
  leafKeysFor,
  leafLabel,
  PERSONA_DEPARTMENTS,
  type PersonaCategoryId,
} from "@/modules/store/mapping/persona-taxonomy";
import { useStoreConnectionStore } from "@/modules/store/store";
import { useSizingStore } from "../store";

/** Inverse of `personaSizingGroup` — the leaf checklist walks categories, not sizing groups. */
const GROUP_TO_CATEGORY_ID: Record<SizingGroup, PersonaCategoryId> = {
  tops: "top",
  bottoms: "bottom",
  dresses: "full-body",
  outerwear: "outerwear",
  footwear: "footwear",
};

/**
 * Doc Parts 4 and 6 — hand-filling a chart for stock research could not reach.
 *
 * A modal launched from Stage 4's gap tabs rather than a stage of its own. Gap filling was stage 5,
 * which made it a step every merchant walked through even with nothing to fill, and put the gap
 * list one screen away from the research results that define it. It is the same decision as the
 * Stage 2 parent correction: the fix belongs next to the thing that is wrong.
 *
 * Columns come from the parent category, so a Bottoms chart asks for waist and never for chest. The
 * grid opens with size labels seeded and every measurement blank — pre-filling a plausible chest
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
  const storeSizeType = useStoreConnectionStore((s) => s.storeSizeSettings.default);

  const group = isSizingGroup(target.sizingCategory) ? target.sizingCategory : "tops";
  const columns = React.useMemo(() => draftColumnsFor(group, target.audience), [group, target.audience]);
  const catId = GROUP_TO_CATEGORY_ID[group];

  // Departments this chart's audience may cover, grouped for the checklist below. Only rendered
  // when the target carries a known audience: a fresh gap has none (doc note on `ManualChartTarget`),
  // and offering a checklist with no audience to filter it by would let a merchant tick a boys leaf
  // onto a chart later read as adult — the same cross-audience mistake `audienceCompatible` exists to
  // block everywhere else.
  const leafGroups = React.useMemo(() => {
    if (!target.audience) return [];
    return PERSONA_DEPARTMENTS.filter((dept) => {
      const deptAudience = audienceForPersonaPath(dept.id);
      return deptAudience !== null && audienceCompatible(deptAudience, target.audience!);
    }).map((dept) => ({ dept, leaves: leafKeysFor(dept.id, catId) }));
  }, [target.audience, catId]);

  function toggleLeaf(leafKey: string) {
    setCoveredLeaves((current) =>
      current.includes(leafKey) ? current.filter((leaf) => leaf !== leafKey) : [...current, leafKey]
    );
  }

  const [rows, setRows] = React.useState<ChartDraftRow[]>(
    () => target.seedRows ?? emptyDraftRows(group)
  );
  const [variantName, setVariantName] = React.useState(target.variantName);
  const [coveredLeaves, setCoveredLeaves] = React.useState<string[]>(target.coversLeaves ?? []);
  const [view, setView] = React.useState<"table" | "json">("table");
  const [saving, setSaving] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  // Problems are only shown once a save has been attempted. Flagging every blank cell the moment
  // the grid opens turns an empty template into a wall of errors before anyone has typed anything.
  const [submitted, setSubmitted] = React.useState(false);

  const { rows: parsedRows, problems } = React.useMemo(
    () => parseDraft(rows, group, target.audience),
    [rows, group, target.audience]
  );
  const shown = submitted ? problems : [];

  function updateCell(rowIndex: number, measurement: Measurement, value: string) {
    setRows((current) =>
      current.map((row, index) =>
        index === rowIndex ? { ...row, values: { ...row.values, [measurement]: value } } : row
      )
    );
  }

  function updateSize(rowIndex: number, value: string) {
    setRows((current) =>
      current.map((row, index) => (index === rowIndex ? { ...row, size: value } : row))
    );
  }

  async function handleSave() {
    setSubmitted(true);
    setServerError(null);
    if (problems.length > 0 || !variantName.trim()) return;

    setSaving(true);
    const error = await saveChart({ rows, variantName: variantName.trim(), coversLeaves: coveredLeaves });
    setSaving(false);
    if (error) setServerError(error);
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
      covers_leaves: coveredLeaves,
      rows: parsedRows,
    },
    null,
    2
  );

  return (
    <Modal
      isOpen
      onClose={close}
      size="xl"
      icon={<PencilLine className="h-4 w-4" />}
      title={`${target.brandName} — ${SIZING_GROUP_LABELS[group]}`}
      description={`${target.skuCount.toLocaleString()} item${target.skuCount === 1 ? "" : "s"} depend on this chart`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save chart
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">{target.reason}</Badge>
        <Badge variant="neutral">Sizes read as {SIZE_TYPE_LABELS[storeSizeType]}</Badge>
        <div className="ml-auto inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] p-0.5">
          <ViewTab active={view === "table"} onClick={() => setView("table")} icon={<TableIcon className="h-3 w-3" />}>
            Table
          </ViewTab>
          <ViewTab active={view === "json"} onClick={() => setView("json")} icon={<Code2 className="h-3 w-3" />}>
            JSON
          </ViewTab>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Chart variant
        </span>
        <input
          value={variantName}
          onChange={(event) => setVariantName(event.target.value)}
          placeholder="Men"
          className={cn(
            "mt-1 w-full max-w-xs rounded-[var(--radius-md)] border bg-[var(--color-surface-base)] px-2.5 py-1.5 text-sm font-semibold text-[var(--color-text-primary)] focus:outline-none",
            submitted && !variantName.trim()
              ? "border-[var(--color-error)]"
              : "border-[var(--color-border)] focus:border-[var(--color-brand)]"
          )}
        />
        <span className="mt-1 block text-[11px] text-[var(--color-text-muted)]">
          What this chart line is called — <strong>Men</strong>, <strong>Women Petite</strong>. You can add
          another variant for the same brand and category later.
        </span>
      </label>

      {leafGroups.length > 0 && (
        <div className="mt-4">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Covers these sub-categories
          </span>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Which mapped categories should auto-match to this exact chart. Leave a sub-category
            unchecked if another chart already covers it, or if nothing should auto-pick this one for
            it.
          </p>
          <div className="mt-2 flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3">
            {leafGroups.map(({ dept, leaves }) => (
              <div key={dept.id} className="flex flex-wrap items-start gap-1.5">
                <span className="mr-1 mt-0.5 w-20 shrink-0 text-[11px] font-semibold text-[var(--color-text-primary)]">
                  {dept.shortLabel}
                </span>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {leaves.map((leafKey) => {
                    const checked = coveredLeaves.includes(leafKey);
                    return (
                      <button
                        key={leafKey}
                        type="button"
                        onClick={() => toggleLeaf(leafKey)}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors",
                          checked
                            ? "border-[var(--color-brand)] bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
                            : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                        )}
                      >
                        {leafLabel(leafKey).split(" · ")[1] ?? leafLabel(leafKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
        <p className="text-xs text-[var(--color-text-muted)]">
          Enter the <strong>body measurements</strong> each size is meant to fit, in centimetres — not the
          garment laid flat. Ranges like <code>96-104</code> are better than a single number; <code>120+</code>{" "}
          and <code>up to 86</code> both work.
        </p>
      </div>

      {view === "table" ? (
        <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)]">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[var(--color-surface-elevated)]">
                <th className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Size
                </th>
                {columns.map((column) => (
                  <th
                    key={column.measurement}
                    className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
                  >
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
                      onChange={(event) => updateSize(rowIndex, event.target.value)}
                      placeholder="M"
                      aria-label={`Size label for row ${rowIndex + 1}`}
                      className={cn(
                        "w-full rounded-[var(--radius-md)] border bg-[var(--color-surface-base)] px-2 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] focus:outline-none",
                        cellHasProblem(shown, rowIndex, undefined)
                          ? "border-[var(--color-error)]"
                          : "border-[var(--color-border)] focus:border-[var(--color-brand)]"
                      )}
                    />
                  </td>
                  {columns.map((column) => (
                    <td key={column.measurement} className="px-2 py-1.5">
                      <input
                        value={row.values[column.measurement] ?? ""}
                        onChange={(event) => updateCell(rowIndex, column.measurement, event.target.value)}
                        placeholder={column.required ? "96-104" : "—"}
                        aria-label={`${column.label} for row ${rowIndex + 1}`}
                        className={cn(
                          "w-full rounded-[var(--radius-md)] border bg-[var(--color-surface-base)] px-2 py-1.5 font-mono text-xs text-[var(--color-text-primary)] focus:outline-none",
                          cellHasProblem(shown, rowIndex, column.measurement)
                            ? "border-[var(--color-error)]"
                            : "border-[var(--color-border)] focus:border-[var(--color-brand)]"
                        )}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => setRows((current) => current.filter((_, i) => i !== rowIndex))}
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
      ) : (
        <pre className="mt-4 max-h-[22rem] overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4 font-mono text-[11px] leading-relaxed text-[var(--color-success)]">
          <code>{json}</code>
        </pre>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRows((current) => [...current, { size: "", values: {} }])}
        >
          <Plus className="h-3.5 w-3.5" /> Add a size
        </Button>
        <p className="text-[11px] text-[var(--color-text-muted)]">
          {parsedRows.length} size{parsedRows.length === 1 ? "" : "s"} ready to save
        </p>
      </div>

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
    </Modal>
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
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
