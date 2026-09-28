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
import { isSizingGroup, SIZING_GROUP_LABELS, type Measurement } from "@/lib/sizing/measurements";
import {
  audienceCompatible,
  audienceForPersonaPath,
} from "@/lib/sizing/variant-match";
import {
  manualChartAudiences,
} from "@/lib/sizing/manual-chart-coverage";
import {
  leafLabel,
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
  const mappedLeaves = useSizingStore((s) => s.mappedLeaves);
  const charts = useSizingStore((s) => s.charts);
  const storeSizeType = useStoreConnectionStore((s) => s.storeSizeSettings.default);

  const group = isSizingGroup(target.sizingCategory) ? target.sizingCategory : "tops";
  const availableLeaves = React.useMemo(
    () =>
      [...new Set([
        ...(target.coversLeaves ?? []),
        ...mappedLeaves.filter((leaf) => personaSizingGroup(leaf.split(":")[1] ?? "") === target.sizingCategory),
      ])].sort((a, b) => leafLabel(a).localeCompare(leafLabel(b))),
    [mappedLeaves, target.coversLeaves, target.sizingCategory],
  );
  const audienceOptions = React.useMemo(() => manualChartAudiences(availableLeaves), [availableLeaves]);
  const [selectedAudience, setAudience] = React.useState<ChartAudience | null>(
    target.audience ?? null,
  );
  const audience =
    selectedAudience ?? (audienceOptions.length === 1 ? audienceOptions[0] : null);
  const columns = React.useMemo(
    () => draftColumnsFor(group, audience ?? undefined),
    [group, audience],
  );
  const priorCoveredLeaves = React.useMemo(
    () =>
      target.seedRows && !target.editing
        ? []
        : [
            ...new Set(
              charts
                .filter(
                  (chart) =>
                    chart.id !== target.id &&
                    chart.brandKey === target.brandKey &&
                    chart.sizingCategory === target.sizingCategory,
                )
                .flatMap((chart) => chart.coversLeaves),
            ),
          ],
    [charts, target.brandKey, target.editing, target.id, target.seedRows, target.sizingCategory],
  );
  const [savedLeaves, setSavedLeaves] = React.useState<string[]>(priorCoveredLeaves);

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
  const selectableLeaves = React.useMemo(
    () =>
      availableLeaves.filter((leaf) => {
        if (savedLeaves.includes(leaf)) return false;
        const leafAudience = audienceForPersonaPath(leaf);
        return audience !== null && leafAudience !== null && audienceCompatible(leafAudience, audience);
      }),
    [audience, availableLeaves, savedLeaves],
  );
  const leafGroups = React.useMemo(
    () =>
      PERSONA_DEPARTMENTS.map((dept) => ({
        dept,
        leaves: selectableLeaves.filter((leaf) => leaf.startsWith(`${dept.id}:`)),
      })).filter(({ leaves }) => leaves.length > 0),
    [selectableLeaves],
  );
  const remainingAfterCurrent = availableLeaves.filter(
    (leaf) => !savedLeaves.includes(leaf) && !coveredLeaves.includes(leaf),
  );

  const { rows: parsedRows, problems } = React.useMemo(
    () => parseDraft(rows, group, audience ?? undefined),
    [rows, group, audience],
  );
  const shown = submitted ? problems : [];

  function chooseAudience(nextAudience: ChartAudience) {
    setAudience(nextAudience);
    setCoveredLeaves((current) =>
      current.filter((leaf) => {
        const leafAudience = audienceForPersonaPath(leaf);
        return leafAudience !== null && audienceCompatible(leafAudience, nextAudience);
      }),
    );
  }

  function toggleLeaf(leafKey: string) {
    setCoveredLeaves((current) =>
      current.includes(leafKey) ? current.filter((leaf) => leaf !== leafKey) : [...current, leafKey],
    );
  }

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

  async function handleSave(addAnother = false) {
    setSubmitted(true);
    setServerError(null);
    if (!audience) {
      setServerError("Choose who this chart is for.");
      return;
    }
    if (availableLeaves.length > 0 && coveredLeaves.length === 0) {
      setServerError("Choose at least one mapped sub-category for this chart.");
      return;
    }
    if (problems.length > 0 || !variantName.trim()) return;

    setSaving(true);
    const error = await saveChart({
      rows,
      variantName: variantName.trim(),
      coversLeaves: coveredLeaves,
      audience,
      keepOpen: addAnother,
    });
    setSaving(false);
    if (error) {
      setServerError(error);
      return;
    }
    if (addAnother) {
      const nowSaved = [...new Set([...savedLeaves, ...coveredLeaves])];
      const remaining = availableLeaves.filter((leaf) => !nowSaved.includes(leaf));
      const remainingAudiences = [
        ...new Set(
          remaining
            .map((leaf) => audienceForPersonaPath(leaf))
            .filter((value): value is ChartAudience => value !== null),
        ),
      ];
      setSavedLeaves(nowSaved);
      setCoveredLeaves([]);
      setVariantName("");
      setRows(emptyDraftRows(group));
      setSubmitted(false);
      setServerError(null);
      if (
        !remaining.some((leaf) => {
          const leafAudience = audienceForPersonaPath(leaf);
          return leafAudience !== null && audienceCompatible(leafAudience, audience);
        })
      ) {
        setAudience(remainingAudiences.length === 1 ? remainingAudiences[0] : null);
      }
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
          {!target.editing && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleSave(true)}
              disabled={saving || coveredLeaves.length === 0 || remainingAfterCurrent.length === 0}
            >
              <Plus className="h-3.5 w-3.5" />
              Save &amp; add another
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={
              saving ||
              (!target.editing && availableLeaves.length > 0 && remainingAfterCurrent.length > 0)
            }
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {target.editing ? "Save changes" : "Save chart"}
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

      {audienceOptions.length > 0 && (
        <div className="mt-4">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Chart audience
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {audienceOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => chooseAudience(option)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                  audience === option
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
                    : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
                )}
              >
                {AUDIENCE_LABELS[option]}
              </button>
            ))}
          </div>
          {audienceOptions.length > 1 && !audience && (
            <p className="mt-1 text-[11px] text-[var(--color-warning)]">
              These products span more than one audience. Choose one chart audience first.
            </p>
          )}
        </div>
      )}

      <label className="mt-4 block">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Chart name
        </span>
        <input
          value={variantName}
          onChange={(event) => setVariantName(event.target.value)}
          disabled={target.editing}
          placeholder="Regular chart"
          className={cn(
            "mt-1 w-full max-w-xs rounded-[var(--radius-md)] border bg-[var(--color-surface-base)] px-2.5 py-1.5 text-sm font-semibold text-[var(--color-text-primary)] focus:outline-none",
            target.editing && "cursor-not-allowed opacity-70",
            submitted && !variantName.trim()
              ? "border-[var(--color-error)]"
              : "border-[var(--color-border)] focus:border-[var(--color-brand)]"
          )}
        />
        <span className="mt-1 block text-[11px] text-[var(--color-text-muted)]">
          A label that distinguishes this table from another table, such as <strong>Regular</strong>{" "}
          or <strong>Petite</strong>. This name does not assign products; only the selected
          sub-category coverage below does.
        </span>
      </label>

      {availableLeaves.length > 0 && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Covers these sub-categories
            </span>
            {leafGroups.length > 0 && (
              <div className="ml-auto flex gap-1">
                <button
                  type="button"
                  onClick={() => setCoveredLeaves(selectableLeaves)}
                  className="text-[11px] font-semibold text-[var(--color-brand)]"
                >
                  Select all shown
                </button>
                <span className="text-[var(--color-border)]">·</span>
                <button
                  type="button"
                  onClick={() => setCoveredLeaves([])}
                  className="text-[11px] font-semibold text-[var(--color-text-muted)]"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Choose only the mapped leaves that this exact table fits. Unchecked leaves need another
            chart; they are not automatically included just because they share the same parent.
          </p>
          {savedLeaves.length > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-[var(--color-success)]">
              {savedLeaves.length} sub-categor{savedLeaves.length === 1 ? "y has" : "ies have"} already
              been covered in this session.
            </p>
          )}
          <div className="mt-2 flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3">
            {!audience && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Choose an audience to see its mapped sub-categories.
              </p>
            )}
            {audience && leafGroups.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">
                All mapped sub-categories for this audience have been covered.
              </p>
            )}
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
