"use client";

import * as React from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  Layers2,
  PencilLine,
  Ruler,
  ShieldCheck,
  Sliders,
  Table as TableIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import { MappingSelect } from "@/modules/store/components/mapping-select";
import {
  isSizingGroup,
  MEASUREMENTS,
  requiredMeasurementsFor,
  SIZING_GROUP_LABELS,
  type SizingGroup,
} from "@/lib/sizing/measurements";
import { isAudience, type Audience } from "@/lib/sizing/keys";
import { SIZE_TYPE_LABELS, sizeTypeFor } from "@/lib/sizing/size-types";
import { leafLabel } from "@/modules/store/mapping/persona-taxonomy";
import { useStoreConnectionStore } from "@/modules/store/store";
import { useSizingStore, type ChartModalChart } from "../store";
import type { ResearchedChart } from "../server-types";
import type { SizingProduct } from "../types";

/** A real stored chart carries its own defect list; the sync views' mock charts do not. Narrowing on
 *  that is what lets one modal render either without the caller having to say which it passed. */
function isResearched(chart: ChartModalChart): chart is ResearchedChart {
  return "quality" in chart;
}

/**
 * Chart audience → the Persona department the merchant knows it by.
 *
 * The audience keys are the sizing pipeline's own vocabulary, and showing them raw was the problem:
 * a brand's chart set is really a grid of department × category, but the modal had no audience axis,
 * so every audience collapsed into one variant dropdown. Tommy Hilfiger's bottoms then read as nine
 * unrelated names — `Boys`, `Girls`, `Infant`, `Men`, `Men Big & Tall`, `Women`, `Women Denim` … —
 * with nothing saying that the first three cannot size an adult.
 *
 * Declaration order is the taxonomy's own, so the chips read in the order the Categories tab does.
 */
const AUDIENCE_LABELS: Record<string, string> = {
  womens: "Women",
  mens: "Men",
  unisex: "Unisex",
  boys: "Kids Boys",
  girls: "Kids Girls",
  kids: "Kids Unisex",
};

const AUDIENCE_ORDER = Object.keys(AUDIENCE_LABELS);

function audienceLabel(audience: string): string {
  return AUDIENCE_LABELS[audience] ?? audience;
}

/** `SIZING_GROUP_LABELS` inverted, so a mock chart's display category ("Tops") resolves to the same
 *  group key a researched chart already carries ("tops"). */
const LABEL_TO_SIZING_GROUP: Record<string, SizingGroup> = Object.fromEntries(
  Object.entries(SIZING_GROUP_LABELS).map(([key, label]) => [label, key as SizingGroup])
);

/**
 * The sizing group a table's own category names — reads two constants the pipeline already exports
 * rather than computing anything new. A `ResearchedChart` names it directly (`"tops"`); a mock
 * `FoundSizeChart` groups its categories under the display label instead (`"Tops"`), so both forms
 * are checked. Null for a category this build doesn't recognise, which callers treat as "don't know
 * which columns are required" rather than guessing.
 */
function resolveSizingGroup(category: string): SizingGroup | null {
  const lower = category.toLowerCase();
  if (isSizingGroup(lower)) return lower;
  return LABEL_TO_SIZING_GROUP[category] ?? null;
}

/**
 * Header labels a chart in this group cannot be trusted without, phrased exactly as `chartTable`
 * builds them (`"Chest (cm)"`) so a plain string match is enough — no header-parsing of our own.
 *
 * This is what lets the table badge a column "Req" or "Opt" without the modal knowing the
 * measurement vocabulary: `requiredMeasurementsFor` is the one place that fact is decided, and this
 * only reformats its answer into the strings already on screen.
 */
function requiredHeaders(group: SizingGroup | null, audience?: Audience): ReadonlySet<string> {
  const measurementHeaders = group
    ? requiredMeasurementsFor(group, audience).map(
        (measurement) => `${MEASUREMENTS[measurement].label} (${MEASUREMENTS[measurement].unit})`
      )
    : [];
  return new Set(["Size", ...measurementHeaders]);
}

interface ChartEntry {
  category: string;
  variantName: string;
  /** Null for the mock `FoundSizeChart` the sync views still pass, which carries no audience. The
   *  audience axis hides itself in that case rather than inventing a department. */
  audience: string | null;
  chart: ChartModalChart;
}

/**
 * Every (category, variant) table the modal has to offer, flattened out of whatever the caller
 * opened it with.
 *
 * A real `ResearchedChart` already names one category and one variant, so it becomes exactly one
 * entry. A mock `FoundSizeChart` — still what the sync and confirmation views pass — names several
 * merchant category paths but carries a single shared table for all of them, which is that surface's
 * own simplification; it is repeated once per category here rather than losing every category past
 * the first.
 */
function buildEntries(charts: ChartModalChart[]): ChartEntry[] {
  const entries: ChartEntry[] = [];
  for (const chart of charts) {
    if (isResearched(chart)) {
      entries.push({
        category: chart.sizingCategory,
        variantName: chart.variantName || "Standard",
        audience: chart.audience,
        chart,
      });
    } else {
      const categories = chart.categories.length > 0 ? chart.categories : ["General"];
      for (const category of categories) {
        entries.push({ category, variantName: "Standard", audience: null, chart });
      }
    }
  }
  return entries;
}

/** Unique even when the same variant name is published in several categories. */
function entryKey(entry: ChartEntry): string {
  return `${entry.chart.id}\u0000${entry.audience ?? ""}\u0000${entry.category}\u0000${entry.variantName}`;
}

/**
 * One brand, every chart it publishes, in one view.
 *
 * Used to be one modal per (brand, category, variant) triple, opened from a chevron under the
 * brand's row in Stage 4's table — so a brand with a men's and a women's tops table and its own
 * footwear guide was three separate "View" clicks, on three separate rows, with no way to move
 * between them once one was open. This is the one entry point per brand doc Part 5 describes
 * instead: every category the brand covers is a tab here, and every variant it carries is its own
 * block underneath — there is no variant picker to lose one behind, only department and category
 * left to filter by.
 */
export function SizeChartModal() {
  const target = useSizingStore((s) => s.chartModal);
  const close = useSizingStore((s) => s.closeChartModal);

  if (!target || target.charts.length === 0) return null;

  // Remounted whenever a different chart set opens — a different brand, or the same brand reopened
  // on a different category chip — so category and variant selection never leak from one open into
  // the next.
  const key = `${target.charts.map((chart) => chart.id).join(",")}|${target.initialCategory ?? ""}`;

  return <SizeChartModalBody key={key} target={target} onClose={close} />;
}

function SizeChartModalBody({
  target,
  onClose,
}: {
  target: { charts: ChartModalChart[]; product: SizingProduct | null; initialCategory: string | null };
  onClose: () => void;
}) {
  const forkChart = useSizingStore((s) => s.forkChart);
  const sizeSettings = useStoreConnectionStore((s) => s.storeSizeSettings);
  const assignmentPaths = useSizingStore((s) => s.assignmentPaths);
  const mappedLeaves = useSizingStore((s) => s.mappedLeaves);
  const assignmentsLoaded = useSizingStore((s) => s.assignmentsLoaded);
  const loadAssignments = useSizingStore((s) => s.loadAssignments);
  const { charts, product, initialCategory } = target;
  const brandName = charts[0].brand;
  const brandKey = isResearched(charts[0]) ? charts[0].brandKey : null;

  // Stage 5's own data, not a copy of it — the one place that already knows every persona leaf this
  // store's catalog actually maps to for this brand. Loaded here too, and not just from Stage 5,
  // because a merchant opening this modal from Stage 4 (View chart, before ever visiting Stage 5)
  // still needs it to filter "Covers" down to leaves they have, rather than every leaf the brand
  // publishes. `loadAssignments` no-ops if Stage 5 already fetched it.
  React.useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  // Null means "don't know" (the mock `FoundSizeChart` charts carry no `brandKey`), which is read
  // downstream as "show every leaf the chart claims" rather than as "this merchant maps to nothing".
  // A leaf → SKU count map, not just a membership set: this is also what lets each chart badge its
  // own item count (below) instead of the brand-wide `sizing_coverage` bucket total every variant
  // used to repeat identically.
  //
  // Seeded from `mappedLeaves` first — the merchant's taxonomy *structure*, brand-agnostic and
  // independent of live stock — so a leaf they have mapped a store category to still shows as
  // "covered" (at 0 items) even when this exact brand has nothing in it right now, rather than
  // vanishing the moment `sizing_path_coverage` (a scan artifact) happens to have no row for it.
  // `assignmentPaths` then overwrites with this brand's real counts wherever it has them. Summed
  // rather than overwritten across several `assignmentPaths` rows for the same leaf, because Stage
  // 2's per-product parent override can legitimately split one leaf across two `sizingCategory` rows.
  const merchantLeaves = React.useMemo(() => {
    if (!brandKey) return null;
    const map = new Map<string, number>();
    for (const leaf of mappedLeaves) map.set(leaf, 0);
    for (const path of assignmentPaths) {
      if (path.brandKey !== brandKey) continue;
      // Merchandise Scope is authoritative once loaded. A stale or category-level scan path must
      // not silently expand the taxonomy the merchant explicitly selected.
      if (!map.has(path.categoryId)) continue;
      map.set(path.categoryId, (map.get(path.categoryId) ?? 0) + path.skuCount);
    }
    return map;
  }, [assignmentPaths, mappedLeaves, brandKey]);
  // Display-only — the size type this brand's labels are read as, same lookup the matching pipeline
  // itself uses (brand override if one exists, otherwise the store default). Not a filter: every
  // chart here already carries this brand's own aliases, so there is nothing to switch between.
  const sizeType = sizeTypeFor(brandName, sizeSettings);

  const allEntries = React.useMemo(() => buildEntries(charts), [charts]);

  // Stage 4 used to filter only each block's "Covers" chips while still rendering every chart the
  // brand publishes. That produced exactly the misleading state this guard fixes: a merchant with
  // only `women:top:shirt` and `women:top:sweatshirt` selected still saw Swim Tops and Bras, both
  // with no Covers row and zero items. Once the merchant taxonomy has loaded, a researched chart is
  // part of this store's view only if at least one of its claimed leaves exists in that taxonomy.
  // Empty-coverage charts are excluded too: they have no path by which any SKU can reach them.
  const entries = React.useMemo(() => {
    if (!brandKey || !assignmentsLoaded || !merchantLeaves) return allEntries;
    return allEntries.filter(
      (entry) =>
        !isResearched(entry.chart) ||
        entry.chart.coversLeaves.some((leaf) => merchantLeaves.has(leaf))
    );
  }, [allEntries, assignmentsLoaded, brandKey, merchantLeaves]);

  // Only the departments this brand actually publishes for, in taxonomy order. Empty for the mock
  // charts, which is what hides the axis rather than showing a filter with one option in it.
  const audiences = React.useMemo(() => {
    const present = new Set(entries.map((entry) => entry.audience).filter((value): value is string => value !== null));
    const known = AUDIENCE_ORDER.filter((audience) => present.has(audience));
    // Anything the pipeline started emitting that this map has not caught up with, rather than
    // silently dropping the charts filed under it.
    const unknown = [...present].filter((audience) => !AUDIENCE_ORDER.includes(audience)).sort();
    return [...known, ...unknown];
  }, [entries]);

  // One department at a time, never "all of them at once" — a brand's chart set stacked across
  // every department it publishes ran to dozens of tables in one scroll, which read as "show all"
  // silently dropping charts rather than as a lot of charts. Picking one department keeps every
  // count on screen honest: "Show all" on the category row below now really does mean every table
  // the one department in the dropdown carries, nothing more and nothing less.
  const [selectedAudience, setSelectedAudience] = React.useState<string>(() => audiences[0] ?? "");
  const [selectedCategory, setSelectedCategory] = React.useState<string>(() =>
    initialCategory && entries.some((entry) => entry.category === initialCategory) ? initialCategory : "ALL"
  );
  const [view, setView] = React.useState<"table" | "json">("table");
  const [copied, setCopied] = React.useState(false);

  // No department axis at all for the mock `FoundSizeChart` charts (every entry's `audience` is
  // null) — filtering by an empty selection would hide everything, so the axis is a no-op there
  // instead, same as it always was.
  const visible = React.useMemo(
    () => (audiences.length === 0 ? entries : entries.filter((entry) => entry.audience === selectedAudience)),
    [entries, audiences, selectedAudience]
  );

  // Derived from the visible set, not the whole one: picking Kids Girls has to drop the category chips
  // that department publishes nothing for, or the tabs offer empty tables.
  const categories = React.useMemo(
    () => [...new Set(visible.map((entry) => entry.category))].sort((a, b) => a.localeCompare(b)),
    [visible]
  );

  // A category chip can go away under the selection when the audience narrows — Kids Girls has no
  // footwear table. Falling back to showing everything is better than rendering nothing and better
  // than resetting the audience the merchant just chose.
  const activeCategory = selectedCategory !== "ALL" && categories.includes(selectedCategory) ? selectedCategory : "ALL";
  // No variant filter — "Show all" is every chart the department carries, and picking a category
  // narrows the same list to its own charts, but there is nothing narrower than that: a category
  // with three variants shows all three, each its own block, rather than picking one to hide behind.
  const filteredEntries = React.useMemo(
    () => (activeCategory === "ALL" ? visible : visible.filter((entry) => entry.category === activeCategory)),
    [activeCategory, visible]
  );

  // JSON mirrors the table exactly — the same filtered set, not a single chart picked out of it.
  const jsonString = JSON.stringify(
    {
      brand: brandName,
      department: selectedAudience ? audienceLabel(selectedAudience) : undefined,
      charts: filteredEntries.map((entry) => ({
        sizing_category: entry.category,
        covers_leaves: isResearched(entry.chart) ? entry.chart.coversLeaves : undefined,
        confidence_percent: entry.chart.confidence,
        headers: entry.chart.headers,
        size_chart: entry.chart.rows,
      })),
    },
    null,
    2
  );

  function handleCopyJson() {
    void navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Doc Part 6. A researched chart is shared with every other store carrying the brand, so
  // correcting it forks a copy scoped to this connection rather than editing the shared row
  // underneath everyone else — and the fork opens its own editor, so this modal steps aside for it.
  function handleFork(chart: ChartModalChart) {
    if (!isResearched(chart)) return;
    forkChart(chart);
    onClose();
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      bodyClassName="overflow-hidden p-0"
      icon={<Ruler className="h-4 w-4" />}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {brandName}
          <Badge variant="info">Size guide</Badge>
          {product && <Badge variant="neutral">SKU {product.sku}</Badge>}
        </span>
      }
      description={
        audiences.length > 1
          ? `Official sizing chart matrix for ${brandName}. Switch categories or departments below.`
          : `Official sizing chart matrix for ${brandName}. Switch categories below.`
      }
      footer={
        <>
          <p className="mr-auto max-w-md text-[11px] text-[var(--color-text-muted)]">
            {entries.some((entry) => isResearched(entry.chart) && entry.chart.shared)
              ? `Shared across every Persona store carrying ${brandName} — use "Make my own copy" on a table to adjust it just for you.`
              : "Your own chart, not shared with any other store."}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 py-2 text-xs font-bold text-[var(--color-text-inverse)] shadow-sm transition-opacity hover:opacity-90"
          >
            Done &amp; Close
          </button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
      {/* A true pinned row, structurally outside the scrolling chart pane below. This replaces the
          previous `position: sticky` implementation, whose threshold left table content visible
          between the modal header and filters while scrolling. */}
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface-base)] px-5 py-3">
        <div className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-3 py-2.5">
          {/* Department is the outermost axis — it decides which categories and variants even exist
              to filter by below — so it gets its own row at the very top of the header, once for the
              whole modal, rather than repeating in every table's own header underneath it. */}
          {audiences.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-[11px] font-bold text-[var(--color-text-secondary)]">
                Department:
              </span>
              <MappingSelect
                options={audiences.map((audience) => ({ key: audience, label: audienceLabel(audience) }))}
                value={selectedAudience}
                onChange={setSelectedAudience}
                label={`${brandName} department`}
                compact
                className="min-w-40"
              />
            </div>
          )}
          {/* Category first — it's the axis every open of this modal starts on, and it's the one
              the "Show all" count and the JSON/Table toggle both read off, so both live together on
              this line. Store Size is a fact about this brand's own labels, not a filter with
              anything to switch, so it sits as a plain badge rather than a control. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 shrink-0 text-[11px] font-bold text-[var(--color-text-secondary)]">
                Category:
              </span>
              {/* "Show all" removes the category filter, so its count is every chart available in
                  the selected department. Individual category chips show their narrower counts —
                  there is no variant picker downstream to make that count redundant. */}
              <CategoryTab
                active={activeCategory === "ALL"}
                onClick={() => setSelectedCategory("ALL")}
              >
                Show all ({visible.length})
              </CategoryTab>
              {categories.map((category) => {
                const count = visible.filter((entry) => entry.category === category).length;
                return (
                  <CategoryTab
                    key={category}
                    active={activeCategory === category}
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category} ({count})
                  </CategoryTab>
                );
              })}
            </div>

            <div className="flex items-center gap-2 self-start">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-text-secondary)]">
                <Sliders className="h-3 w-3 text-[var(--color-brand)]" />
                {SIZE_TYPE_LABELS[sizeType]}
              </span>
              <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] p-0.5 text-xs">
                <ViewToggle active={view === "table"} onClick={() => setView("table")} icon={<TableIcon className="h-3 w-3" />}>
                  Table
                </ViewToggle>
                <ViewToggle active={view === "json"} onClick={() => setView("json")} icon={<Code2 className="h-3 w-3" />}>
                  JSON
                </ViewToggle>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
      {view === "table" ? (
        <div className="mt-5 space-y-6">
          {filteredEntries.map((entry) => (
            <CategoryBlock
              key={entryKey(entry)}
              brandName={brandName}
              category={entry.category}
              active={entry}
              merchantLeaves={merchantLeaves}
              product={product}
              onFork={() => handleFork(entry.chart)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-text-secondary)]">
              <Code2 className="h-3.5 w-3.5 text-[var(--color-brand)]" />
              {activeCategory === "ALL"
                ? `${brandName} — all ${filteredEntries.length} charts`
                : `${brandName} — ${activeCategory} (${filteredEntries.length} chart${filteredEntries.length === 1 ? "" : "s"})`}
            </span>
            <button
              type="button"
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-[var(--color-success)]" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy JSON
                </>
              )}
            </button>
          </div>

          {/* A deliberately dark shell regardless of the app theme — a code block reads as code
              because it looks like a terminal, not because it picked up the page's own surface
              colour. The filename bar names exactly what's selected above the table, same as the
              toolbar strip. */}
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-white/10 bg-[#0b0f19] shadow-inner">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-2.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-brand-light)]">
                <Code2 className="h-3.5 w-3.5" />
                {brandName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_
                {activeCategory === "ALL" ? "all_charts" : `${activeCategory.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_charts`}
                .json
              </span>
              <span className="text-[10px] text-white/35">application/json</span>
            </div>
            <pre className="max-h-[24rem] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-emerald-400">
              <code>{jsonString}</code>
            </pre>
          </div>
        </div>
      )}
      </div>
      </div>
    </Modal>
  );
}

/**
 * One chart table selected by the Category (and, above it, Department) filters. The department
 * picker used to repeat in this block's own header, once per variant on screen — three variants
 * under "bottoms" meant three identical "Department: Women" dropdowns stacked on top of each other,
 * all driving the same one piece of state. It is a single control in the modal's own header now.
 *
 * The measurement columns are whatever the active variant actually has — a footwear chart shares
 * no column with a tops chart, and the bounds arrive already formatted, so nothing here knows the
 * measurement vocabulary.
 */
function CategoryBlock({
  brandName,
  category,
  active,
  merchantLeaves,
  product,
  onFork,
}: {
  brandName: string;
  category: string;
  active: ChartEntry;
  /** This store's own persona leaves for this brand, and the SKU count behind each (from Stage 5's
   *  path data) — or null when the chart carries no `brandKey` to look one up by (the mock
   *  `FoundSizeChart` charts). Narrows the "Covers" chips below to what this merchant actually maps
   *  to, rather than everything the brand publishes — a merchant with two of a chart's seven leaves
   *  in their taxonomy has no use for the other five, and showing them reads as "this chart covers
   *  products you don't have". Also what lets this chart's own item badge sum only the leaves it
   *  actually claims, instead of repeating the brand's whole `sizing_coverage` bucket total. */
  merchantLeaves: ReadonlyMap<string, number> | null;
  product: SizingProduct | null;
  onFork: () => void;
}) {
  const chart = active.chart;
  const researched = isResearched(chart);
  const audience = isAudience(active.audience) ? active.audience : undefined;
  const required = React.useMemo(
    () => requiredHeaders(resolveSizingGroup(category), audience),
    [category, audience]
  );
  const productSizes = product?.sizes ?? [];
  const firstHeader = chart.headers[0];
  // Narrowed to leaves this merchant's own taxonomy actually maps to for this brand — see the note
  // on `merchantLeaves` above. `null` (no brandKey to look one up by) falls back to every leaf the
  // chart claims, same as before this filter existed.
  const visibleCoveredLeaves = React.useMemo(() => {
    if (!researched) return [];
    if (!merchantLeaves) return chart.coversLeaves;
    return chart.coversLeaves.filter((leaf) => merchantLeaves.has(leaf));
  }, [researched, chart, merchantLeaves]);

  // This chart's own item count, not the shared (brand x sizing category) bucket total every variant
  // under one department used to repeat identically — see doc note on `merchantLeaves` above. Summed
  // over exactly the leaves this merchant maps to *and* this exact chart claims, which is the only
  // number "how many of my SKUs does this table govern" can honestly mean under one source of truth
  // (taxonomy path decides the chart, nothing else). Undefined — no badge — for a chart with no leaf
  // to attribute stock to at all (an empty-`coversLeaves` table nobody has bound to a path in Stage 5
  // yet) rather than showing a brand-wide number that has nothing to do with this specific table, and
  // for the mock `FoundSizeChart` charts this filter cannot run against, which keep their own count.
  const itemCount = React.useMemo(() => {
    if (!researched) return chart.skuCount;
    if (!merchantLeaves) return chart.skuCount;
    if (chart.coversLeaves.length === 0) return undefined;
    return visibleCoveredLeaves.reduce((sum, leaf) => sum + (merchantLeaves.get(leaf) ?? 0), 0);
  }, [researched, chart, merchantLeaves, visibleCoveredLeaves]);

  // The leaf(s) a table covers are its real identity under one source of truth — taxonomy decides
  // which table governs a SKU, so the taxonomy path is what a merchant should recognise a block by,
  // not the brand's own internal name for the artifact. Heading leads with leaves when there are any
  // to show; falls back to the plain category only for a table with no leaf yet (an unassigned
  // template a merchant would still pick by name in Stage 5 — the one place `variantName` remains a
  // human-facing label, because there is nothing else to pick it by there).
  const headingLeaves = visibleCoveredLeaves.map((leaf) => leafLabel(leaf));
  const heading =
    researched && headingLeaves.length > 0
      ? headingLeaves.length <= 2
        ? headingLeaves.join(" · ")
        : `${headingLeaves.slice(0, 2).join(" · ")} +${headingLeaves.length - 2} more`
      : category;
  const identifiedByLeaf = researched && headingLeaves.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 border-b border-[var(--color-border)] pb-2.5 sm:flex-row sm:items-center sm:justify-between">
        {/* The department no longer needs naming here — it's the one control pinned above every
            block in the modal's own header now, so repeating it per table only competed with the
            confidence and defect signals this row exists to show. */}
        <h4 className="text-xs font-bold text-[var(--color-text-primary)]">
          {brandName} — {heading} sizing matrix
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          {/* No variant-name badge once the block is identified by leaf above — the taxonomy path is
              the only thing that decided which table this is, so naming the brand's own internal
              label for it a second time here read as a second, competing identity. Kept only for a
              table with no leaf to be identified by (empty `coversLeaves`), where the name is the
              only handle a merchant has on it at all. */}
          {!identifiedByLeaf && (
            <Badge variant="info">
              <Layers2 className="h-3 w-3" /> {active.variantName}
            </Badge>
          )}
          {researched && (
            <button
              type="button"
              onClick={onFork}
              title="Make your own editable copy of this chart"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
            >
              <PencilLine className="h-3 w-3" /> Make my own copy
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={!researched || !chart.needsReview ? "success" : "warning"}>
          {!researched || !chart.needsReview ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            <ShieldCheck className="h-3 w-3" />
          )}{" "}
          {chart.confidence}% Match
        </Badge>
        {/* The department used to be badged here as the raw audience key. It is in the heading now, so
            repeating it only competed with the confidence and defect signals this row is for. */}
        {/* Read off the rows, so it names every regional scale the chart carries rather than picking
            one. Absent when the source published alpha labels only — no regional scale to name. */}
        {chart.labelSystems && (
          <Badge variant="neutral">
            <Globe className="h-3 w-3" /> {chart.labelSystems}
          </Badge>
        )}
        <Badge variant="neutral">
          <CalendarClock className="h-3 w-3" /> Updated {chart.lastUpdated}
        </Badge>
        {itemCount !== undefined && <Badge variant="info">{itemCount.toLocaleString()} items</Badge>}
        {researched
          ? chart.sourceUrl && (
              <a
                href={chart.sourceUrl}
                target="_blank"
                rel="noreferrer"
                title={chart.sourceUrl}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand)] hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> View source
              </a>
            )
          : chart.isInheritedFromSetup && (
              <Badge variant="default">{chart.inheritedFromSetupLabel ?? "Reused from setup"}</Badge>
            )}
      </div>

      {/* Defects found in the chart itself, spelled out rather than reduced to a colour. The
          confidence badge above is the model's opinion of its own work; these are checks on the
          artifact, and when the two disagree it is this list that has been right. */}
      {researched && chart.quality.length > 0 && (
        <ul className="space-y-1.5">
          {chart.quality.map((flag) => (
            <li
              key={flag.code}
              className={cn(
                "flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-[11px]",
                flag.severity === "error"
                  ? "border-[var(--color-error-border)] bg-[var(--color-error-light)] text-[var(--color-error)]"
                  : "border-[var(--color-warning-border)] bg-[var(--color-warning-light)] text-[var(--color-warning)]"
              )}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-bold">{flag.label}.</span>{" "}
                <span className="text-[var(--color-text-secondary)]">{flag.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {researched && chart.sourceTitle && (
        <p className="truncate text-[11px] text-[var(--color-text-muted)]" title={chart.sourceTitle}>
          Transcribed from &ldquo;{chart.sourceTitle}&rdquo;
        </p>
      )}

      {researched && visibleCoveredLeaves.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            Covers:
          </span>
          {visibleCoveredLeaves.map((leaf) => (
            <span
              key={leaf}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]"
            >
              {leafLabel(leaf)}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)]">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[var(--color-surface-elevated)]">
              {chart.headers.map((header) => {
                const isReq = required.has(header);
                return (
                  <th
                    key={header}
                    className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>{header}</span>
                      <span
                        className={cn(
                          "rounded px-1 py-[1px] font-mono text-[9px] font-bold normal-case tracking-normal",
                          isReq
                            ? "bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
                            : "bg-[var(--color-surface-base)] text-[var(--color-text-muted)]"
                        )}
                      >
                        {isReq ? "Req" : "Opt"}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {chart.rows.map((row, index) => {
              // Greys out sizes the product itself doesn't stock, so a chart opened for one SKU reads
              // as "here's your size, and here's the rest of the brand's range" rather than a flat
              // table with no indication which row is the reason the modal was opened.
              const rawSize = (row[firstHeader] ?? "").trim().toUpperCase();
              const isStoreSize =
                !product || productSizes.length === 0
                  ? true
                  : productSizes.some((size) => {
                      const upper = size.trim().toUpperCase();
                      return upper === rawSize || (rawSize !== "" && (rawSize.includes(upper) || upper.includes(rawSize)));
                    });
              const showStockTag = Boolean(product) && productSizes.length > 0;

              return (
                <tr
                  key={index}
                  className={cn(
                    index % 2 === 1 && "bg-[var(--color-surface-base)]",
                    showStockTag && !isStoreSize && "opacity-45"
                  )}
                >
                  {chart.headers.map((header, columnIndex) => (
                    <td
                      key={header}
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5",
                        columnIndex === 0
                          ? "font-semibold text-[var(--color-text-primary)]"
                          : "font-mono text-[var(--color-text-secondary)]"
                      )}
                    >
                      {columnIndex === 0 && showStockTag ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span>{row[header] ?? "—"}</span>
                          {isStoreSize ? (
                            <span className="rounded-full bg-[var(--color-success-light)] px-1.5 py-[1px] text-[9px] font-bold text-[var(--color-success)]">
                              In store
                            </span>
                          ) : (
                            <span className="text-[9px] italic text-[var(--color-text-muted)]">unstocked</span>
                          )}
                        </span>
                      ) : (
                        row[header] ?? "—"
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {product && (
        <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
          Opened from <span className="text-[var(--color-text-primary)]">{product.title}</span>{" "}
          <span className="font-mono">({product.sku})</span>
        </p>
      )}

      <p className="text-[10px] text-[var(--color-text-muted)]">
        Every measurement is a body range in centimetres, not a garment measurement. The label columns beside them
        (EU, UK, US, Alpha, Numeric, Age, neck) are the brand&apos;s own printed sizes, kept so your stock&apos;s size
        strings can be matched back to a row.
      </p>
    </div>
  );
}

function CategoryTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors",
        active
          ? "bg-[var(--color-brand)] text-white shadow-xs"
          : "border border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
      )}
    >
      {children}
    </button>
  );
}

function ViewToggle({
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
