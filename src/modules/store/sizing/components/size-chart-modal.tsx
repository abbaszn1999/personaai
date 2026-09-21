"use client";

import * as React from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  Layers2,
  PencilLine,
  Ruler,
  ShieldCheck,
  Table as TableIcon,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import { MappingSelect } from "@/modules/store/components/mapping-select";
import { useSizingStore, type ChartModalChart } from "../store";
import type { ResearchedChart } from "../server-types";
import type { SizingProduct } from "../types";

/** A real stored chart carries its own defect list; the sync views' mock charts do not. Narrowing on
 *  that is what lets one modal render either without the caller having to say which it passed. */
function isResearched(chart: ChartModalChart): chart is ResearchedChart {
  return "quality" in chart;
}

interface ChartEntry {
  category: string;
  variantName: string;
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
      entries.push({ category: chart.sizingCategory, variantName: chart.variantName || "Standard", chart });
    } else {
      const categories = chart.categories.length > 0 ? chart.categories : ["General"];
      for (const category of categories) entries.push({ category, variantName: "Standard", chart });
    }
  }
  return entries;
}

/**
 * One brand, every chart it publishes, in one view.
 *
 * Used to be one modal per (brand, category, variant) triple, opened from a chevron under the
 * brand's row in Stage 4's table — so a brand with a men's and a women's tops table and its own
 * footwear guide was three separate "View" clicks, on three separate rows, with no way to move
 * between them once one was open. This is the one entry point per brand doc Part 5 and the demo
 * both describe instead: every category the brand covers is a tab here, and every variant a
 * category carries is a dropdown inside it, so a merchant checking Tommy Hilfiger's numbers never
 * has to leave the modal to see its other three tables.
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
  const { charts, product, initialCategory } = target;
  const brandName = charts[0].brand;

  const entries = React.useMemo(() => buildEntries(charts), [charts]);
  const categories = React.useMemo(
    () => [...new Set(entries.map((entry) => entry.category))].sort((a, b) => a.localeCompare(b)),
    [entries]
  );

  const [selectedCategory, setSelectedCategory] = React.useState<string>(() =>
    initialCategory && categories.includes(initialCategory) ? initialCategory : "ALL"
  );
  const [variantByCategory, setVariantByCategory] = React.useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const category of categories) {
      const firstForCategory = entries.find((entry) => entry.category === category);
      if (firstForCategory) map[category] = firstForCategory.variantName;
    }
    return map;
  });
  const [view, setView] = React.useState<"table" | "json">("table");
  const [copied, setCopied] = React.useState(false);

  const categoriesToRender = selectedCategory === "ALL" ? categories : [selectedCategory];

  // The JSON view follows the same category+variant selection as the table — the tab currently
  // active, or the first category when every one of them is showing at once.
  const jsonCategory = selectedCategory === "ALL" ? categories[0] : selectedCategory;
  const jsonEntries = entries.filter((entry) => entry.category === jsonCategory);
  const jsonActive = jsonEntries.find((entry) => entry.variantName === variantByCategory[jsonCategory]) ?? jsonEntries[0];
  const jsonString = jsonActive
    ? JSON.stringify(
        {
          brand: brandName,
          sizing_category: jsonCategory,
          variant: jsonActive.variantName,
          confidence_percent: jsonActive.chart.confidence,
          headers: jsonActive.chart.headers,
          size_chart: jsonActive.chart.rows,
        },
        null,
        2
      )
    : "{}";

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
      icon={<Ruler className="h-4 w-4" />}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {brandName}
          <Badge variant="info">Size guide</Badge>
          {product && <Badge variant="neutral">SKU {product.sku}</Badge>}
        </span>
      }
      description={
        categories.length > 1
          ? `Publishes ${categories.length} categories — switch categories and variants below.`
          : "Switch variants below if this brand publishes more than one fit line."
      }
      footer={
        <>
          <p className="mr-auto max-w-md text-[11px] text-[var(--color-text-muted)]">
            {entries.some((entry) => isResearched(entry.chart) && entry.chart.shared)
              ? `Shared across every Persona store carrying ${brandName} — use "Make my own copy" on a table to adjust it just for you.`
              : "Your own chart, not shared with any other store."}
          </p>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-bold text-[var(--color-text-secondary)]">Category:</span>
          <CategoryTab active={selectedCategory === "ALL"} onClick={() => setSelectedCategory("ALL")}>
            Show all ({categories.length})
          </CategoryTab>
          {categories.map((category) => (
            <CategoryTab
              key={category}
              active={selectedCategory === category}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </CategoryTab>
          ))}
        </div>

        <div className="inline-flex self-start rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] p-0.5 text-xs">
          <ViewToggle active={view === "table"} onClick={() => setView("table")} icon={<TableIcon className="h-3 w-3" />}>
            Table
          </ViewToggle>
          <ViewToggle active={view === "json"} onClick={() => setView("json")} icon={<Code2 className="h-3 w-3" />}>
            JSON
          </ViewToggle>
        </div>
      </div>

      {view === "table" ? (
        <div className="mt-4 space-y-6">
          {categoriesToRender.map((category) => {
            const categoryEntries = entries.filter((entry) => entry.category === category);
            const activeVariantName = variantByCategory[category] ?? categoryEntries[0]?.variantName;
            const active = categoryEntries.find((entry) => entry.variantName === activeVariantName) ?? categoryEntries[0];
            if (!active) return null;

            return (
              <CategoryBlock
                key={category}
                brandName={brandName}
                category={category}
                entries={categoryEntries}
                active={active}
                product={product}
                onSelectVariant={(variantName) =>
                  setVariantByCategory((current) => ({ ...current, [category]: variantName }))
                }
                onFork={() => handleFork(active.chart)}
              />
            );
          })}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-text-secondary)]">
              <Code2 className="h-3.5 w-3.5 text-[var(--color-brand)]" />
              {brandName} — {jsonCategory} ({jsonActive?.variantName ?? "chart"})
            </span>
            <button
              type="button"
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
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
          <pre className="max-h-[24rem] overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4 font-mono text-[11px] leading-relaxed text-[var(--color-success)]">
            <code>{jsonString}</code>
          </pre>
        </div>
      )}
    </Modal>
  );
}

/**
 * One category's table, plus the toolbar that switches the variant behind it.
 *
 * The measurement columns are whatever the active variant actually has — a footwear chart shares
 * no column with a tops chart, and the bounds arrive already formatted, so nothing here knows the
 * measurement vocabulary.
 */
function CategoryBlock({
  brandName,
  category,
  entries,
  active,
  product,
  onSelectVariant,
  onFork,
}: {
  brandName: string;
  category: string;
  entries: ChartEntry[];
  active: ChartEntry;
  product: SizingProduct | null;
  onSelectVariant: (variantName: string) => void;
  onFork: () => void;
}) {
  const chart = active.chart;
  const researched = isResearched(chart);
  const hasMultipleVariants = entries.length > 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 border-b border-[var(--color-border)] pb-2.5 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-xs font-bold text-[var(--color-text-primary)]">
          {brandName} — {category} sizing matrix
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          {hasMultipleVariants ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
              <span>Variant:</span>
              <MappingSelect
                options={entries.map((entry) => ({
                  key: entry.variantName,
                  label: entry.variantName,
                }))}
                value={active.variantName}
                onChange={onSelectVariant}
                label={`${brandName} ${category} chart variant`}
                compact
                className="min-w-40"
              />
            </div>
          ) : (
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
          <ShieldCheck className="h-3 w-3" /> {chart.confidence}% confidence
        </Badge>
        {researched && (
          <Badge variant="neutral">
            <Users className="h-3 w-3" /> {chart.audience}
          </Badge>
        )}
        <Badge variant="neutral">
          <Globe className="h-3 w-3" /> {chart.region}
        </Badge>
        <Badge variant="neutral">
          <CalendarClock className="h-3 w-3" /> Updated {chart.lastUpdated}
        </Badge>
        {chart.skuCount !== undefined && <Badge variant="info">{chart.skuCount.toLocaleString()} items</Badge>}
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

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)]">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[var(--color-surface-elevated)]">
              {chart.headers.map((header) => (
                <th
                  key={header}
                  className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {chart.rows.map((row, index) => (
              <tr key={index} className={cn(index % 2 === 1 && "bg-[var(--color-surface-base)]")}>
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
                    {row[header] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
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
        (EU, UK, US, neck, denim inch) are the brand&apos;s own printed sizes, kept so your stock&apos;s size
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
