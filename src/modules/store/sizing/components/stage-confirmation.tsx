"use client";

import * as React from "react";
import Image from "next/image";
import {
  Code2,
  CheckCircle2,
  Ruler,
  Layers,
  PackageCheck,
  Sparkles,
  Search,
  Tag,
  Eye,
  ImageOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RunProgress, type RunLogLine, type RunPhase } from "@/components/ui/run-progress";
import { StatTile } from "@/components/ui/stat-tile";
import { CatalogIndexCard } from "@/modules/store/components/catalog-index-card";
import { cn } from "@/lib/utils/cn";
import { useSizingStore } from "../store";
import { FOUND_SIZE_CHARTS } from "../mocks/charts";
import { MOCK_SIZING_PRODUCTS } from "../mocks/catalog";
import type { BrandType, FoundSizeChart, GapItem, SizingProduct } from "../types";
import { StageHeaderBanner } from "./stage-header-banner";

type BrandFilter = "all" | BrandType;

/** Mirrors the demo's `resolveSizeChartForProduct`: which chart a given item actually resolves
 *  to, so the "Active Overview" table can show a real answer per row rather than a static label.
 *  Global brands hit their researched chart; private/null brands fall back to whichever gap item
 *  covers their category, then a generic metric matrix if nothing matches yet. */
function resolveSizeChartForProduct(
  product: SizingProduct,
  charts: FoundSizeChart[],
  gaps: GapItem[]
): { chartName: string; chartType: BrandType; sourceLabel: string } {
  const brandLower = product.brand.toLowerCase().trim();

  if (product.brandType === "global") {
    const found = charts.find((c) => c.brand.toLowerCase() === brandLower);
    if (found) {
      return { chartName: `${found.brand} Official Size Chart`, chartType: "global", sourceLabel: "Official brand source" };
    }
  }

  if (product.brandType === "private" && brandLower) {
    const matched = gaps.find((g) => g.brandName.toLowerCase().includes(brandLower) || brandLower.includes(g.brandName.toLowerCase()));
    if (matched) {
      return {
        chartName: `${matched.brandName} — ${matched.categoryPath.split(">").pop()?.trim() ?? matched.categoryPath}`,
        chartType: "private",
        sourceLabel: matched.status === "complete" ? "Custom path matrix" : "Needs review",
      };
    }
  }

  const nullGap = gaps.find((g) => g.type === "category" && g.categoryPath.toLowerCase().includes(product.category.toLowerCase()));
  if (nullGap) {
    return { chartName: `Category Matrix (${nullGap.categoryPath})`, chartType: "null", sourceLabel: nullGap.status === "complete" ? "Category fallback matrix" : "Needs review" };
  }

  return { chartName: "Standard Apparel Metric Matrix", chartType: "null", sourceLabel: "Universal fallback" };
}

const PHASES: RunPhase[] = [
  { id: "ingest", label: "Ingest", description: "Charts & gap grids" },
  { id: "normalize", label: "Normalize", description: "Metric units" },
  { id: "synthesize", label: "Synthesize", description: "Per-SKU schemas" },
  { id: "validate", label: "Validate", description: "Integrity check" },
];

const LOGS: RunLogLine[] = [
  { time: "0.2s", text: "Ingesting 6 researched charts and 5 hand-filled grids...", phaseId: "ingest" },
  { time: "0.7s", text: "Resolving every SKU to its brand + category chart family...", phaseId: "ingest" },
  { time: "1.2s", text: "Normalizing chest, waist, hip, inseam and foot length to cm...", phaseId: "normalize" },
  { time: "1.8s", text: "Mapping regional labels (US, EU, JP) onto one vocabulary...", phaseId: "normalize" },
  { time: "2.4s", text: "Synthesizing per-SKU size specifications...", phaseId: "synthesize" },
  { time: "3.0s", text: "Attaching tolerances from your Size Filter defaults...", phaseId: "synthesize" },
  { time: "3.5s", text: "Validating schema compliance across 2,240 items...", phaseId: "validate" },
  { time: "3.9s", text: "Published: every item in scope now has a size specification.", phaseId: "validate" },
];

const PAYLOAD_STAGES = [
  `{
  "status": "initializing",
  "chart_families": 11,
  "items": 2240
}`,
  `{
  "brand": "Nike",
  "category": "Men > Tops",
  "units": "cm",
  "normalizing": true
}`,
  `{
  "sku": "NK-TS-4410",
  "chart_family": "nike__men-tops",
  "sizes": [
    { "label": "M", "chest_cm": [96, 104] },
    { "label": "L", "chest_cm": [104, 112] }
  ]
}`,
  `{
  "status": "published",
  "items_with_sizing": 2240,
  "coverage": "100%"
}`,
];

/**
 * Stage 6 — turning charts into per-item size specifications.
 *
 * The extraction run is what actually makes sizing usable: up to this point everything is keyed on
 * brand and category, and a shopper's measurements can only be checked against an individual item.
 */
export function StageConfirmation() {
  const extractionDone = useSizingStore((s) => s.extractionDone);
  const setExtractionDone = useSizingStore((s) => s.setExtractionDone);
  const gapItems = useSizingStore((s) => s.gapItems);

  if (!extractionDone) {
    return (
      <RunProgress
        title="Building size specifications"
        subtitle="Resolving every item in scope to a chart and writing its measurement ranges"
        icon={<Code2 className="h-5 w-5" />}
        phases={PHASES}
        logs={LOGS}
        counter={{ total: 2240, noun: "items" }}
        logFileName="size_spec_extraction.log"
        onComplete={() => setExtractionDone(true)}
        renderAside={({ percent }) => {
          const index = Math.min(
            PAYLOAD_STAGES.length - 1,
            Math.floor((percent / 100) * PAYLOAD_STAGES.length)
          );
          return (
            <div className="flex h-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
                <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">
                  size_spec.json
                </span>
                <Badge variant="default" className="text-[10px]">
                  <Sparkles className="h-2.5 w-2.5" /> Streaming
                </Badge>
              </div>
              <pre className="flex-1 overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-[var(--color-success)]">
                <code>{PAYLOAD_STAGES[index]}</code>
              </pre>
            </div>
          );
        }}
      />
    );
  }

  const filledGaps = gapItems.filter((gap) => gap.status === "complete").length;

  return (
    <div className="space-y-4">
      <StageHeaderBanner
        stageNumber={6}
        eyebrow="Publish"
        title="Sizing Pipeline — Active Overview"
        description="Every item in scope now carries a per-SKU size specification your agent can check a shopper against."
      />

      <div className="flex items-start gap-3 rounded-[var(--radius-xl)] border border-[var(--color-success)]/30 bg-[var(--color-success-light)] p-5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-success)]" />
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Sizing is live for your agent
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
            Every item in scope now carries measurement ranges. When a shopper gives their
            measurements, Persona can rule out what will not fit before it recommends anything.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={<Ruler className="h-4 w-4" />}
          label="Charts published"
          value={FOUND_SIZE_CHARTS.length}
          note="Researched from brand size guides"
        />
        <StatTile
          icon={<Layers className="h-4 w-4" />}
          label="Gaps filled"
          value={`${filledGaps} / ${gapItems.length}`}
          note="Private labels and unbranded stock"
        />
        <StatTile
          icon={<PackageCheck className="h-4 w-4" />}
          label="Items covered"
          value="2,240"
          note="100% of your selected categories"
        />
      </div>

      {/* The pipeline's last action, and the only place an index can be started. Everything it needs
          is upstream: Stage 1's approved mapping, the Categories scope, and the charts resolved
          above. */}
      <div className="space-y-3 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Publish to search</h3>
          <p className="text-xs text-[var(--color-text-muted)]">
            Builds the search index your agent queries, carrying everything above with it. Safe to
            re-run — it replaces what is already there rather than duplicating it.
          </p>
        </div>
        <CatalogIndexCard />
      </div>

      <StageConfirmationCatalog gapItems={gapItems} />

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4">
        <p className="text-xs font-semibold text-[var(--color-text-primary)]">What happens next</p>
        <ul className="mt-2 space-y-1.5 text-xs text-[var(--color-text-muted)]">
          <li>
            · New products arriving from your store are handled on the <strong>Sync</strong> tab —
            brands already in the registry cost nothing to resolve.
          </li>
          <li>
            · How strictly a size has to match before an item is ruled out is set on the{" "}
            <strong>Size Filter</strong> tab.
          </li>
        </ul>
      </div>
    </div>
  );
}

const BRAND_FILTER_META: Record<
  BrandFilter,
  { label: string; dotClass: string; activeClass: string; idleClass: string }
> = {
  all: {
    label: "All items",
    dotClass: "",
    activeClass: "bg-[var(--color-neutral-fill-strong)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)]",
    idleClass: "bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)]",
  },
  global: {
    label: "Global brands",
    dotClass: "bg-[var(--color-success)]",
    activeClass: "bg-[var(--color-success-fill-strong)] text-[var(--color-success)] border border-[var(--color-success-border)]",
    idleClass: "bg-[var(--color-success-light)] text-[var(--color-success)] border border-[var(--color-success)]/25 hover:border-[var(--color-success-border)]",
  },
  private: {
    label: "Private brands",
    dotClass: "bg-[var(--color-warning)]",
    activeClass: "bg-[var(--color-warning-fill-strong)] text-[var(--color-warning)] border border-[var(--color-warning-border)]",
    idleClass: "bg-[var(--color-warning-light)] text-[var(--color-warning)] border border-[var(--color-warning)]/25 hover:border-[var(--color-warning-border)]",
  },
  null: {
    label: "Null / no brand",
    dotClass: "bg-[var(--color-error)]",
    activeClass: "bg-[var(--color-error-fill-strong)] text-[var(--color-error)] border border-[var(--color-error-border)]",
    idleClass: "bg-[var(--color-error-light)] text-[var(--color-error)] border border-[var(--color-error)]/25 hover:border-[var(--color-error-border)]",
  },
};

/**
 * The demo's marquee feature for this stage: every item next to the exact size chart it resolves
 * to, with an eye button to inspect it. Reuses the same brand-type filter chips as Stage 2 so the
 * two "browse the catalog" moments in the pipeline look like one interface, not two.
 */
function StageConfirmationCatalog({ gapItems }: { gapItems: GapItem[] }) {
  const openChartModal = useSizingStore((s) => s.openChartModal);
  const [filter, setFilter] = React.useState<BrandFilter>("all");
  const [query, setQuery] = React.useState("");

  const products = MOCK_SIZING_PRODUCTS;

  const counts = React.useMemo(
    () => ({
      all: products.length,
      global: products.filter((p) => p.brandType === "global").length,
      private: products.filter((p) => p.brandType === "private").length,
      null: products.filter((p) => p.brandType === "null").length,
    }),
    [products]
  );

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (filter !== "all" && product.brandType !== filter) return false;
      if (!needle) return true;
      return product.title.toLowerCase().includes(needle) || product.sku.toLowerCase().includes(needle) || product.brand.toLowerCase().includes(needle);
    });
  }, [products, filter, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-[var(--shadow-card)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 pl-1 font-medium text-[var(--color-text-muted)]">
            <Tag className="h-3.5 w-3.5" /> Filter by brand type:
          </span>
          {(["all", "global", "private", "null"] as BrandFilter[]).map((id) => {
            const meta = BRAND_FILTER_META[id];
            const active = filter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition-all",
                  active ? meta.activeClass : meta.idleClass
                )}
              >
                {meta.dotClass && <span className={cn("h-2 w-2 rounded-full", meta.dotClass)} />}
                <span>{meta.label}</span>
                <span className={cn("rounded-full px-1.5 py-0.2 text-[10px] font-bold", active ? "bg-[var(--color-surface-base)]/60" : "bg-[var(--color-surface-base)]")}>
                  {counts[id]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, SKU or brand…"
            className="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] py-2 pl-9 pr-3 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3.5">Product</th>
                <th className="px-3 py-3.5">SKU</th>
                <th className="px-3 py-3.5">Brand</th>
                <th className="px-3 py-3.5">Sizes</th>
                <th className="px-3 py-3.5">Price</th>
                <th className="border-l border-[var(--color-brand)]/20 bg-[var(--color-brand-light)]/40 px-4 py-3.5 text-[var(--color-brand-strong)]">
                  <span className="flex items-center gap-1.5">
                    <Ruler className="h-3.5 w-3.5" /> Size chart
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-[var(--color-text-muted)]">
                    Nothing matches that filter.
                  </td>
                </tr>
              ) : (
                visible.map((product) => {
                  const resolved = resolveSizeChartForProduct(product, FOUND_SIZE_CHARTS, gapItems);
                  const isNull = product.brandType === "null" || !product.brand;
                  const isPrivate = product.brandType === "private";
                  return (
                    <tr
                      key={product.id}
                      className={cn(
                        "transition-colors",
                        isNull
                          ? "bg-[var(--color-error-light)]/20 hover:bg-[var(--color-error-light)]/40"
                          : isPrivate
                            ? "bg-[var(--color-warning-light)]/20 hover:bg-[var(--color-warning-light)]/40"
                            : "hover:bg-[var(--color-brand-light)]/20"
                      )}
                    >
                      <td className="min-w-[200px] px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <ConfirmationThumb src={product.imageUrl} alt={product.title} />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[var(--color-text-primary)]" title={product.title}>
                              {product.title}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-[var(--color-text-secondary)]">{product.sku}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {isNull ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-error)]">
                            No brand
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold",
                              isPrivate
                                ? "border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                                : "border-[var(--color-success)]/30 bg-[var(--color-success-light)] text-[var(--color-success)]"
                            )}
                          >
                            {product.brand}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex max-w-[110px] flex-wrap gap-1">
                          {product.sizes.slice(0, 2).map((size) => (
                            <span key={size} className="rounded border border-[var(--color-border)] bg-[var(--color-surface-base)] px-1 py-0.5 font-mono text-[9px] text-[var(--color-text-secondary)]">
                              {size}
                            </span>
                          ))}
                          {product.sizes.length > 2 && (
                            <span className="self-center font-mono text-[9px] text-[var(--color-text-muted)]">+{product.sizes.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-bold text-[var(--color-text-primary)]">{product.price}</td>
                      <td className="border-l border-[var(--color-brand)]/20 bg-[var(--color-brand-light)]/10 px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold text-[var(--color-text-primary)]" title={resolved.chartName}>
                              {resolved.chartName}
                            </p>
                            <p className="text-[10px] font-medium text-[var(--color-brand)]">{resolved.sourceLabel}</p>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="shrink-0"
                            onClick={() => {
                              const chart = FOUND_SIZE_CHARTS.find((c) => c.brand.toLowerCase() === product.brand.toLowerCase());
                              if (chart) openChartModal(chart, product);
                            }}
                          >
                            <Eye className="h-3 w-3" /> View
                          </Button>
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
    </div>
  );
}

function ConfirmationThumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = React.useState(false);

  return (
    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
      {failed ? (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff className="h-3 w-3 text-[var(--color-text-muted)]" />
        </div>
      ) : (
        <Image src={src} alt={alt} fill sizes="36px" className="object-cover" onError={() => setFailed(true)} unoptimized />
      )}
    </div>
  );
}
