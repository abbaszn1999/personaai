"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Eye, FolderTree, Loader2, Search, Sparkles, Store, Wand2, X } from "lucide-react";
import { SIZING_GROUP_KEYS, isSizingGroup, type SizingGroup } from "@/lib/sizing/measurements";
import type { CategoryParentMap, StorePlatform } from "@/modules/store/types";
import { cn } from "@/lib/utils/cn";
import type { CategoryPreviewTarget } from "../category-preview-modal";
import {
  ParentIcon,
  ParentSelect,
  parentAccent,
  parentLabel,
  parentScope,
  requiredFieldLabels,
} from "./parent-category-ui";
import type { MappablePath, PathNote } from "./types";

/**
 * Step 2 of the Categories tab: every path the merchant put in scope gets one of the five parent
 * sizing categories, and every SKU underneath inherits it.
 *
 * This is where a product's sizing group now comes from. It used to be inferred from the product's
 * title and canonical category, which failed in two ways nobody could see: an unrecognised title
 * dropped the product from sizing entirely, and a misrecognised one sized it against the wrong
 * chart. Asking once per path costs the merchant a few minutes and removes both.
 *
 * Presentational — the parent owns the map and the save. Nothing here writes.
 */
export interface ParentMappingGridProps {
  paths: readonly MappablePath[];
  parentMap: CategoryParentMap;
  onChange: (next: CategoryParentMap) => void;
  platform: StorePlatform;
  /** Fills every still-unmapped path from the store's own taxonomy. Never overwrites a choice the
   *  merchant already made. */
  onAutoClassify: () => void;
  /** Paths whose current value came from `onAutoClassify` rather than an explicit choice, so the
   *  status column can tell the merchant which rows are still only a suggestion. */
  /** Outcome of the last auto-classify press, or null before the first one. */
  autoResult: AutoClassifyResult | null;
  /** The classifier is running: it fetches live products per path, so this is seconds, not ms. */
  classifying: boolean;
  /** Per-path reasons from the last pass, keyed by path id. */
  notes: Record<string, PathNote>;
  suggested: ReadonlySet<string>;
  onBackToScope: () => void;
  /** Opens the shared live-products modal. The only way to answer "what is actually in here" for a
   *  path whose name does not say — which is most of them on a shallow taxonomy. */
  onPreview: (target: CategoryPreviewTarget) => void;
}

/** What one auto-classify pass managed. `mixed` counts paths the model found to hold several
 *  parents at once, which is a different problem from it being unsure. */
export interface AutoClassifyResult {
  filled: number;
  declined: number;
  mixed: number;
  /** The model could not be reached and the offline keyword matcher answered instead. */
  offline?: boolean;
}

/**
 * Says what auto-classify just did, including when the answer is "nothing".
 *
 * Every branch here exists because a silent no-op is indistinguishable from a broken button, which
 * is how this was first reported: a store whose paths all read `Women > Clothing` gave the keyword
 * matcher nothing to work with, and it declined all of them without saying so.
 */
function AutoClassifyNote({ result }: { result: AutoClassifyResult }) {
  const nothingToDo = result.filled === 0 && result.declined === 0;

  return (
    <p
      role="status"
      className="max-w-sm text-right text-[11px] leading-relaxed text-[var(--color-text-muted)]"
    >
      {nothingToDo ? (
        "Every path already has a parent."
      ) : (
        <>
          {result.filled > 0 && (
            <span className="font-semibold text-[var(--color-success)]">
              Suggested {result.filled} path{result.filled === 1 ? "" : "s"}.{" "}
            </span>
          )}
          {result.filled === 0 && (
            <span className="font-semibold text-[var(--color-warning)]">No suggestions. </span>
          )}
          {result.mixed > 0 && (
            <>
              {result.mixed} hold{result.mixed === 1 ? "s" : ""} more than one kind of garment — see
              the note on each.{" "}
            </>
          )}
          {result.declined - result.mixed > 0 && (
            <>{result.declined - result.mixed} still need you. </>
          )}
          {result.offline && (
            <span className="text-[var(--color-warning)]">
              Matched on names only — the classifier could not be reached.
            </span>
          )}
        </>
      )}
    </p>
  );
}

/** The model's reason for a row, and its warning when a path cannot honestly be mapped at all. */
function RowNote({ note }: { note: PathNote }) {
  return (
    <p
      className={cn(
        "mt-0.5 flex items-start gap-1 text-[11px] leading-snug",
        note.mixed ? "text-[var(--color-warning)]" : "text-[var(--color-text-muted)]"
      )}
    >
      {note.mixed && <AlertTriangle className="mt-px h-3 w-3 shrink-0" />}
      <span>
        {note.mixed && <span className="font-semibold">Mixed — </span>}
        {note.reason}
      </span>
    </p>
  );
}

export function ParentMappingGrid({
  paths,
  parentMap,
  onChange,
  platform,
  onAutoClassify,
  autoResult,
  classifying,
  notes,
  suggested,
  onBackToScope,
  onPreview,
}: ParentMappingGridProps) {
  const [query, setQuery] = React.useState("");
  const [parentFilter, setParentFilter] = React.useState<SizingGroup | "all" | "unmapped">("all");
  const [checkedRows, setCheckedRows] = React.useState<ReadonlySet<string>>(new Set());
  const [bulkTarget, setBulkTarget] = React.useState<SizingGroup>("tops");

  const parentOf = React.useCallback(
    (id: string): SizingGroup | null => {
      const value = parentMap[id];
      return isSizingGroup(value) ? value : null;
    },
    [parentMap]
  );

  const counts = React.useMemo(() => {
    const tally = Object.fromEntries(SIZING_GROUP_KEYS.map((key) => [key, 0])) as Record<SizingGroup, number>;
    let unmapped = 0;
    for (const path of paths) {
      const group = parentOf(path.id);
      if (group) tally[group] += 1;
      else unmapped += 1;
    }
    return { tally, unmapped };
  }, [paths, parentOf]);

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return paths.filter((path) => {
      const group = parentOf(path.id);
      if (parentFilter === "unmapped" && group !== null) return false;
      if (parentFilter !== "all" && parentFilter !== "unmapped" && group !== parentFilter) return false;
      if (!needle) return true;
      return (
        path.name.toLowerCase().includes(needle) ||
        path.path.toLowerCase().includes(needle) ||
        (path.handle?.toLowerCase().includes(needle) ?? false) ||
        (group !== null && parentLabel(group).toLowerCase().includes(needle))
      );
    });
  }, [paths, parentOf, parentFilter, query]);

  const allVisibleChecked = visible.length > 0 && visible.every((path) => checkedRows.has(path.id));

  // WooCommerce term counts include descendants, but step 2 only ever lists the frontier of the
  // selection, so no leaf here contains another and the sum is exact. Shopify collections can
  // overlap, which is why that platform's total is labelled as an estimate below.
  const productTotal = paths.reduce((sum, path) => sum + path.productCount, 0);
  const isShopify = platform === "shopify";

  function assign(ids: readonly string[], group: SizingGroup) {
    const next = { ...parentMap };
    for (const id of ids) next[id] = group;
    onChange(next);
  }

  function toggleRow(id: string) {
    setCheckedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setCheckedRows((current) => {
      const next = new Set(current);
      if (allVisibleChecked) for (const path of visible) next.delete(path.id);
      else for (const path of visible) next.add(path.id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Header: what this step is, the five parents at a glance, and the one-click first pass. */}
      <div className="space-y-4 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-5 shadow-[var(--shadow-elevated)] backdrop-blur-xl">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div className="space-y-1">
            <h2 className="text-base font-bold tracking-tight text-[var(--color-text-primary)]">
              Map your categories to the 5 parent sizing categories
            </h2>
            <p className="max-w-3xl text-xs leading-relaxed text-[var(--color-text-secondary)]">
              Each path you put in scope becomes one of five parents. That choice decides which body
              measurements a size chart for it has to carry, and every product in the path inherits
              it.
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-1.5 md:items-end">
            <button
              type="button"
              onClick={onAutoClassify}
              disabled={classifying}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] px-3.5 py-2 text-xs font-bold text-[var(--color-brand)] transition-all hover:border-[var(--color-brand)]/50 active:scale-98 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {classifying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {classifying ? "Reading your products…" : "Auto-classify unmapped"}
            </button>
            {classifying ? (
              <p className="max-w-sm text-right text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                Sampling live products from each path so the suggestion comes from your stock, not
                the category name.
              </p>
            ) : (
              autoResult && <AutoClassifyNote result={autoResult} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SIZING_GROUP_KEYS.map((group) => {
            const isActive = parentFilter === group;
            return (
              <button
                key={group}
                type="button"
                onClick={() => setParentFilter(isActive ? "all" : group)}
                title={parentScope(group)}
                className={cn(
                  "rounded-xl border p-3.5 text-left transition-all",
                  isActive
                    ? "border-transparent"
                    : "border-[var(--color-border)] bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-strong)]"
                )}
                style={
                  isActive
                    ? {
                        backgroundColor: `color-mix(in srgb, ${parentAccent(group)} 12%, transparent)`,
                        boxShadow: `inset 0 0 0 2px ${parentAccent(group)}`,
                      }
                    : undefined
                }
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${parentAccent(group)} 14%, transparent)`,
                      color: parentAccent(group),
                    }}
                  >
                    <ParentIcon group={group} className="h-3.5 w-3.5" />
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-bold",
                      counts.tally[group] > 0
                        ? "bg-[var(--color-brand-light)] text-[var(--color-brand)]"
                        : "bg-[var(--color-surface-base)] text-[var(--color-text-muted)]"
                    )}
                  >
                    {counts.tally[group]}
                  </span>
                </div>
                <h3 className="truncate text-xs font-bold text-[var(--color-text-primary)]">
                  {parentLabel(group)}
                </h3>
                <p className="mt-0.5 truncate text-[10px] text-[var(--color-text-muted)]">
                  Needs: {requiredFieldLabels(group).join(", ")}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter and bulk-apply bar. */}
      <div className="flex flex-col justify-between gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-3.5 shadow-[var(--shadow-card)] backdrop-blur-xl md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a path or parent category…"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] py-1.5 pl-9 pr-8 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <FilterPill active={parentFilter === "all"} onClick={() => setParentFilter("all")}>
            All ({paths.length})
          </FilterPill>
          {counts.unmapped > 0 && (
            <FilterPill
              active={parentFilter === "unmapped"}
              warning
              onClick={() => setParentFilter(parentFilter === "unmapped" ? "all" : "unmapped")}
            >
              Unmapped ({counts.unmapped})
            </FilterPill>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {checkedRows.size > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] p-1 text-xs">
              <span className="px-1.5 font-semibold text-[var(--color-brand)]">
                {checkedRows.size} selected:
              </span>
              <div className="w-44">
                <ParentSelect
                  value={bulkTarget}
                  onChange={setBulkTarget}
                  label={`${checkedRows.size} selected paths`}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  assign([...checkedRows], bulkTarget);
                  setCheckedRows(new Set());
                }}
                className="rounded bg-[var(--color-brand)] px-2.5 py-1 font-bold text-[var(--color-text-inverse)] transition-transform hover:opacity-90 active:scale-95"
              >
                Apply
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={toggleAllVisible}
            disabled={visible.length === 0}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allVisibleChecked ? "Deselect visible" : "Select visible"}
          </button>
        </div>
      </div>

      {/* The mapping table. */}
      <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              <tr>
                <th scope="col" className="w-10 px-3.5 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allVisibleChecked}
                    onChange={toggleAllVisible}
                    aria-label="Select all visible paths"
                    className="cursor-pointer accent-[var(--color-brand)]"
                  />
                </th>
                <th scope="col" className="px-3.5 py-3">
                  Category path
                </th>
                <th scope="col" className="px-3.5 py-3">
                  Source
                </th>
                <th scope="col" className="px-3.5 py-3">
                  Products
                </th>
                <th scope="col" className="min-w-[220px] px-3.5 py-3">
                  Parent sizing category
                </th>
                <th scope="col" className="px-3.5 py-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center">
                    <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
                      No paths match this filter
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      Clear the search or the parent filter to see the rest.
                    </p>
                  </td>
                </tr>
              ) : (
                visible.map((path) => {
                  const group = parentOf(path.id);
                  const isChecked = checkedRows.has(path.id);

                  return (
                    <tr
                      key={path.id}
                      className={cn(
                        "transition-colors",
                        isChecked ? "bg-[var(--color-brand-light)]" : "hover:bg-[var(--color-surface-elevated)]"
                      )}
                    >
                      {/* The accent stripe is the only thing that makes eighty rows scannable: a
                          mapping that looks wrong is a color out of place, spotted without reading
                          the label. */}
                      <td
                        className="px-3.5 py-3 text-center"
                        style={group ? { boxShadow: `inset 3px 0 0 ${parentAccent(group)}` } : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRow(path.id)}
                          aria-label={`Select ${path.path}`}
                          className="cursor-pointer accent-[var(--color-brand)]"
                        />
                      </td>

                      <td className="min-w-[240px] px-3.5 py-3">
                        <span className="block font-bold text-[var(--color-text-primary)]">{path.name}</span>
                        <span className="block font-mono text-[11px] text-[var(--color-text-muted)]">
                          {path.path}
                          {path.handle && (
                            <span className="text-[var(--color-text-muted)] opacity-70"> · {path.handle}</span>
                          )}
                        </span>
                        {notes[path.id] && <RowNote note={notes[path.id]} />}
                      </td>

                      <td className="whitespace-nowrap px-3.5 py-3">
                        <button
                          type="button"
                          onClick={() => onPreview({ categoryId: path.id, categoryName: path.path })}
                          title={`See what is actually in "${path.path}" before choosing`}
                          className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
                        >
                          {isShopify ? <Store className="h-3 w-3" /> : <FolderTree className="h-3 w-3" />}
                          <Eye className="h-3 w-3" />
                          Preview
                        </button>
                      </td>

                      <td className="whitespace-nowrap px-3.5 py-3 font-semibold text-[var(--color-text-secondary)]">
                        {path.productCount.toLocaleString()}
                      </td>

                      <td className="min-w-[220px] whitespace-nowrap px-3.5 py-3">
                        <ParentSelect
                          value={group}
                          onChange={(next) => assign([path.id], next)}
                          id={`parent-${path.id}`}
                          label={path.path}
                        />
                      </td>

                      <td className="whitespace-nowrap px-3.5 py-3">
                        <RowStatus group={group} isSuggested={suggested.has(path.id)} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="px-1 text-[11px] text-[var(--color-text-muted)]">
        {paths.length.toLocaleString()} paths in scope ·{" "}
        {isShopify ? "about " : ""}
        {productTotal.toLocaleString()} products
        {isShopify && " (collections can overlap, so this is an estimate)"} ·{" "}
        <button
          type="button"
          onClick={onBackToScope}
          className="font-semibold text-[var(--color-brand)] hover:underline"
        >
          change what is in scope
        </button>
      </p>
    </div>
  );
}

function FilterPill({
  children,
  active,
  warning,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  warning?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
        active && warning && "bg-[var(--color-warning)] text-white",
        active && !warning && "bg-[var(--color-text-primary)] text-[var(--color-surface-card)]",
        !active && warning && "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
        !active &&
          !warning &&
          "bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      )}
    >
      {children}
    </button>
  );
}

/** Distinguishes a parent the merchant chose from one auto-classify guessed, because only the
 *  second kind is worth re-reading before continuing. */
function RowStatus({ group, isSuggested }: { group: SizingGroup | null; isSuggested: boolean }) {
  if (!group) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-warning)]">
        <AlertTriangle className="h-3 w-3" />
        Needs a parent
      </span>
    );
  }

  if (isSuggested) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-base)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-secondary)]">
        <Sparkles className="h-3 w-3" />
        Suggested
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-success)]">
      <CheckCircle2 className="h-3 w-3" />
      Confirmed
    </span>
  );
}
