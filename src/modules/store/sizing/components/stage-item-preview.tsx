"use client";

import * as React from "react";
import Image from "next/image";
import {
  ImageOff,
  Search,
  Tag,
  Layers,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { isSizingGroup, type SizingGroup } from "@/lib/sizing/measurements";
import { labelFor } from "@/lib/sizing/summary";
import { useStoreConnectionStore } from "@/modules/store/store";
import { ParentSelect } from "@/modules/store/components/categories/parent-category-ui";
import { useSizingStore } from "../store";
import {
  isScanIncomplete,
  SAMPLE_PAGE_SIZES as PAGE_SIZES,
  type ServerBrandType,
  type SizingSampleRow,
} from "../server-types";
import { StageHeaderBanner } from "./stage-header-banner";
import { ScanProgress } from "./scan-progress";

type BrandFilter = "all" | ServerBrandType;

const BRAND_FILTER_META: Record<BrandFilter, { label: string; dotClass: string; activeClass: string; idleClass: string }> = {
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
  none: {
    label: "No brand",
    dotClass: "bg-[var(--color-error)]",
    activeClass: "bg-[var(--color-error-fill-strong)] text-[var(--color-error)] border border-[var(--color-error-border)]",
    idleClass: "bg-[var(--color-error-light)] text-[var(--color-error)] border border-[var(--color-error)]/25 hover:border-[var(--color-error-border)]",
  },
  unclassified: {
    label: "Not yet classified",
    dotClass: "bg-[var(--color-text-muted)]",
    activeClass: "bg-[var(--color-neutral-fill-strong)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)]",
    idleClass: "bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)]",
  },
};

const FILTERS: BrandFilter[] = ["all", "global", "private", "none", "unclassified"];

/**
 * Stage 2 — what the sizing pipeline actually sees.
 *
 * A live sample read straight from the merchant's store and resolved through the same extraction the
 * scan uses, so what is shown here is literally what will be keyed on. That is the whole point of
 * putting it before the paid stages: a mis-mapped size column or a brand field holding the shop's own
 * name is a store-admin edit at this point, and a wasted research pass a stage later.
 *
 * Read from the store API rather than from coverage because coverage deliberately keeps no product
 * rows — the aggregates it stores are counts, not items.
 */
export function StageItemPreview() {
  const run = useSizingStore((s) => s.run);
  const runLoading = useSizingStore((s) => s.runLoading);
  const loadRun = useSizingStore((s) => s.loadRun);
  const stopPolling = useSizingStore((s) => s.stopPolling);
  const rows = useSizingStore((s) => s.sample);
  const loading = useSizingStore((s) => s.sampleLoading);
  const error = useSizingStore((s) => s.sampleError);
  const loadSample = useSizingStore((s) => s.loadSample);
  const page = useSizingStore((s) => s.samplePage);
  const pageSize = useSizingStore((s) => s.samplePageSize);
  const nextCursor = useSizingStore((s) => s.sampleNextCursor);
  const total = useSizingStore((s) => s.sampleTotal);
  const totalExact = useSizingStore((s) => s.sampleTotalExact);
  const typeCounts = useSizingStore((s) => s.sampleTypeCounts);
  const brandType = useSizingStore((s) => s.sampleBrandType);
  const appliedQuery = useSizingStore((s) => s.sampleQuery);
  const goToPage = useSizingStore((s) => s.goToSamplePage);
  const setPageSize = useSizingStore((s) => s.setSamplePageSize);
  const setBrandType = useSizingStore((s) => s.setSampleBrandType);
  const setQuery = useSizingStore((s) => s.setSampleQuery);

  // Local so typing stays responsive. The applied value lives in the store because the server does
  // the searching — filtering here would only ever search the 25 rows already on screen.
  const [draftQuery, setDraftQuery] = React.useState(appliedQuery);

  const scanning = isScanIncomplete(run);

  React.useEffect(() => {
    void loadRun();
    // The poll chain reschedules itself, so leaving this stage has to break it explicitly or it
    // keeps requesting in the background for as long as the dashboard stays open.
    return () => stopPolling();
  }, [loadRun, stopPolling]);

  React.useEffect(() => {
    // Held back until the scan finishes. Reading the catalog while the scan is walking it would put
    // two concurrent paging loops on the merchant's store, and the brand types this table colours
    // its rows by don't exist until coverage is written.
    if (scanning) return;
    void loadSample();
  }, [scanning, loadSample]);

  React.useEffect(() => {
    if (draftQuery.trim() === appliedQuery) return;
    const timer = setTimeout(() => void setQuery(draftQuery), 400);
    return () => clearTimeout(timer);
  }, [draftQuery, appliedQuery, setQuery]);

  const filter: BrandFilter = brandType ?? "all";
  const filtering = brandType !== null || appliedQuery.length > 0;

  // Position of this page within the selection, derived from the page size rather than tracked. Off
  // by however many rows a short page returned earlier, which only happens where a Shopify
  // collection boundary ends a page early — the same case that already reports its total as
  // approximate. On a union-filtered store every page but the last is full and this is exact.
  const first = rows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + rows.length;
  // Only meaningful unfiltered: under a filter the denominator is the number of matches, which
  // isn't known without walking the whole catalog.
  const totalPages = total === null || filtering ? null : Math.max(1, Math.ceil(total / pageSize));

  const unsized = React.useMemo(() => rows.filter((row) => !row.sizingCategory).length, [rows]);

  // Identification runs inside the scan, so until it finishes this table would show every product's
  // raw brand field — including the empty ones the agent is in the middle of resolving. Showing that
  // and then silently changing it is worse than making the merchant wait for the real answer.
  if (runLoading || scanning) {
    return <ScanProgress />;
  }

  return (
    <div className="space-y-4">
      <StageHeaderBanner
        stageNumber={2}
        eyebrow="Live Catalog Sample"
        title="What the pipeline sees"
        description="Read live from your store through the field mapping you approved. Page through your selected categories and check the brand and size columns look right — fixing them now is a store edit, later it means redoing paid research."
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="Search title, SKU or brand…"
                className="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] py-2 pl-9 pr-3 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadSample({ force: true })}
              disabled={loading}
              title="Reload sample"
              className="shrink-0 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-2 text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          </div>
        }
      />

      {error && (
        <div className="flex items-start gap-2.5 rounded-[var(--radius-xl)] border border-[var(--color-error)]/30 bg-[var(--color-error-light)] p-3.5 text-xs text-[var(--color-error)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {unsized > 0 && (
        <div className="flex items-start gap-2.5 rounded-[var(--radius-xl)] border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] p-3.5 text-xs text-[var(--color-text-secondary)]">
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
          <p>
            <strong className="text-[var(--color-text-primary)]">
              {unsized} on this page have no size chart to find.
            </strong>{" "}
            Bags, scarves and one-size items are skipped rather than researched — there is no body measurement that
            decides whether they fit.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2.5 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 pl-1 text-xs font-medium text-[var(--color-text-muted)]">
            <Tag className="h-3.5 w-3.5" /> Filter by brand type:
          </span>
          {FILTERS.map((id) => {
            // Every chip counts the whole selection, never the loaded page. Brand-type counts come
            // from the scan's coverage, so before it has run only "All items" carries a number —
            // nothing has been classified yet, and a page-local tally would just restate the page
            // size back at the merchant.
            const count = id === "all" ? total : (typeCounts?.[id] ?? null);

            // A bucket this store provably doesn't have is noise. Only hidden once the scan has
            // established that, never on a missing count.
            if (id !== "all" && typeCounts && count === 0) return null;

            const meta = BRAND_FILTER_META[id];
            const active = filter === id;
            const disabled = id !== "all" && !typeCounts;

            return (
              <button
                key={id}
                type="button"
                disabled={disabled || loading}
                title={disabled ? "Brand types are decided by the catalog scan in stage 3" : undefined}
                onClick={() => void setBrandType(id === "all" ? null : id)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition-all",
                  active ? meta.activeClass : meta.idleClass,
                  disabled && "cursor-not-allowed opacity-40"
                )}
              >
                {meta.dotClass && <span className={cn("h-2 w-2 rounded-full", meta.dotClass)} />}
                <span>{meta.label}</span>
                {count !== null && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                      active ? "bg-[var(--color-surface-base)]/60" : "bg-[var(--color-surface-base)]"
                    )}
                  >
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {!typeCounts && (
          <p className="pl-1 text-[11px] text-[var(--color-text-muted)]">
            Brand types are decided by the catalog scan in stage 3 — until it runs, every product is
            unclassified and there is nothing to filter by.
          </p>
        )}
      </div>

      <div className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
        {/* Overlaid rather than swapped in only once `rows` is empty — a filter switch keeps the
            previous filter's rows on screen until the new ones arrive, and without this a store slow
            enough to need several hops looked identical to having frozen. */}
        {loading && rows.length > 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-[var(--color-surface-card)]/70 text-xs font-medium text-[var(--color-text-secondary)] backdrop-blur-sm">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Searching your catalog…
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3.5">Product</th>
                <th className="px-3 py-3.5">SKU</th>
                <th className="px-3 py-3.5">Brand</th>
                <th className="px-3 py-3.5">Sizing category</th>
                <th className="px-3 py-3.5">Sizes read</th>
                <th className="px-3 py-3.5">Price</th>
                <th className="px-3 py-3.5">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-[var(--color-text-muted)]">
                    <RefreshCw className="mx-auto mb-2 h-4 w-4 animate-spin" />
                    Reading from your store…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-[var(--color-text-muted)]">
                    {!filtering
                      ? "No products came back for your selected categories."
                      : nextCursor
                        ? // The server stops after a bounded number of store pages so one click can't
                          // walk a whole catalog. More of it is still unsearched.
                          "No matches in this stretch of your catalog — keep going to search further."
                        : page > 1
                          ? "No more matches."
                          : "Nothing in your selected categories matches that filter."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => <ProductTableRow key={row.externalId} row={row} />)
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-6 py-4">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <Layers className="h-4 w-4 text-[var(--color-brand)]" />
              <span>
                {filtering ? (
                  <>
                    Matches{" "}
                    <strong className="text-[var(--color-text-primary)]">
                      {first.toLocaleString()}–{last.toLocaleString()}
                    </strong>{" "}
                    of{" "}
                    <strong className="text-[var(--color-text-primary)]">
                      {total === null ? "…" : `${totalExact ? "" : "~"}${total.toLocaleString()}`}
                    </strong>{" "}
                    {/* A brand-type filter's total comes straight from the scan's coverage — every
                        SKU of that type, counted exactly, no store walk required — so it earns plain
                        "products in this filter" rather than "searched", which is what's left to say
                        about a free-text query: no index answers that without walking the whole
                        catalog, so its denominator is still a lower bound found so far. */}
                    {brandType ? "products in this filter" : "products searched"}
                    <span className="text-[var(--color-text-muted)]"> · page {page}</span>
                  </>
                ) : (
                  <>
                    Showing{" "}
                    <strong className="text-[var(--color-text-primary)]">
                      {first.toLocaleString()}–{last.toLocaleString()}
                    </strong>{" "}
                    of{" "}
                    <strong className="text-[var(--color-text-primary)]">
                      {total === null ? "…" : `${totalExact ? "" : "~"}${total.toLocaleString()}`}
                    </strong>{" "}
                    products in your selected categories
                    {totalPages !== null && (
                      <span className="text-[var(--color-text-muted)]">
                        {" "}
                        · page {page} of {totalPages.toLocaleString()}
                      </span>
                    )}
                  </>
                )}
              </span>
              <label className="ml-2 flex items-center gap-1.5 text-[var(--color-text-muted)]">
                Show
                <select
                  value={pageSize}
                  onChange={(event) => void setPageSize(Number(event.target.value))}
                  disabled={loading}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-brand)] focus:outline-none disabled:opacity-50"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                per page
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void goToPage(page - 1)}
                disabled={loading || page === 1}
                className="flex items-center gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <button
                type="button"
                onClick={() => void goToPage(page + 1)}
                disabled={loading || !nextCursor}
                className="flex items-center gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {typeCounts && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {/* Written out per type rather than reused from the chip label, which already contains
                  the word "brands" for some types — appending a unit to it would double up into
                  "Global brands brands". "none" counts products, since there is no brand name to
                  count instead; every other type counts distinct brands. */}
              {(
                [
                  ["global", "global brand"],
                  ["private", "private brand"],
                  ["unclassified", "unclassified brand"],
                  ["none", "unbranded item"],
                ] as const
              ).map(([type, noun]) => {
                const count = typeCounts[type];
                if (count === 0) return null;
                return (
                  <span key={type} className="flex items-center gap-1 font-semibold text-[var(--color-text-secondary)]">
                    <span className={cn("h-2 w-2 rounded-full", BRAND_FILTER_META[type].dotClass)} />
                    {count.toLocaleString()} {noun}
                    {count === 1 ? "" : "s"}
                  </span>
                );
              })}
              {/* Coverage only holds stock a chart can be found for, so an unsized item — a bag, a
                  scarf — is in none of these counts even though it is in the total above. */}
              <span className="text-[var(--color-text-muted)]">
                among your selection&apos;s sized items
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The parent a product is sized on, and the one place it can be changed per product.
 *
 * Doc Part 3 asks for the parent to be visible here because it is a deterministic lookup from the
 * Categories tab, not another guess — so this is the screen where a merchant can catch the mapping
 * being wrong before any research is paid for against it. It is editable because a coarse path is
 * sometimes unavoidably wrong: "Men > Clothing" holding 604 tops and bottoms has no single correct
 * parent, and without this the merchant's only recourse would be restructuring their store.
 *
 * A correction is called out rather than shown as though the path produced it, since a hand-made
 * choice and an inherited one need different amounts of trust when reading down the column.
 */
function ParentCell({ row }: { row: SizingSampleRow }) {
  const setSkuParent = useStoreConnectionStore((s) => s.setSkuParent);
  const [saving, setSaving] = React.useState(false);

  const current = isSizingGroup(row.sizingCategory) ? row.sizingCategory : null;
  const isCorrected = row.inheritedCategory !== row.sizingCategory;

  async function choose(group: SizingGroup | null) {
    setSaving(true);
    await setSkuParent(row.externalId, group);
    setSaving(false);
  }

  return (
    <div className={cn("space-y-1", saving && "opacity-60")}>
      <ParentSelect value={current} onChange={(group) => void choose(group)} label={row.title} />

      {isCorrected ? (
        <button
          type="button"
          onClick={() => void choose(null)}
          className="flex items-center gap-1 text-[10px] font-semibold text-[var(--color-brand)] hover:underline"
          title={
            row.inheritedCategory
              ? `Its category path says ${labelFor(row.inheritedCategory)}. Click to go back to that.`
              : "Its category path gives it no parent. Click to go back to that."
          }
        >
          <RotateCcw className="h-2.5 w-2.5" />
          Corrected — reset to path
        </button>
      ) : (
        <p className="text-[10px] text-[var(--color-text-muted)]">
          {current ? "Inherited from its category" : "Its category path has no parent for this"}
        </p>
      )}
    </div>
  );
}

function ProductTableRow({ row }: { row: SizingSampleRow }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const isNone = row.brandType === "none";
  const isPrivate = row.brandType === "private";
  const isGlobal = row.brandType === "global";

  return (
    <tr
      className={cn(
        "transition-colors",
        isNone
          ? "bg-[var(--color-error-light)]/30 hover:bg-[var(--color-error-light)]/50"
          : isPrivate
            ? "bg-[var(--color-warning-light)]/30 hover:bg-[var(--color-warning-light)]/50"
            : "hover:bg-[var(--color-brand-light)]/20"
      )}
    >
      <td className="min-w-[220px] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
            {imageFailed || !row.imageUrl ? (
              <div className="flex h-full w-full items-center justify-center">
                <ImageOff className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
              </div>
            ) : (
              <Image
                src={row.imageUrl}
                alt={row.title}
                fill
                sizes="40px"
                className="object-cover"
                onError={() => setImageFailed(true)}
                unoptimized
              />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-[var(--color-text-primary)]" title={row.title}>
              {row.title}
            </p>
            <p className="truncate text-[11px] text-[var(--color-text-muted)]">
              {row.storeCategoryPath.length > 0 ? row.storeCategoryPath.join(" › ") : "—"}
            </p>
          </div>
        </div>
      </td>

      <td className="whitespace-nowrap px-3 py-3 font-mono text-[var(--color-text-secondary)]">{row.sku ?? "—"}</td>

      <td className="whitespace-nowrap px-3 py-3">
        {isNone ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-error)]">
            <span className="h-2 w-2 rounded-full bg-[var(--color-error)]" /> No brand
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold",
              isPrivate
                ? "border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                : isGlobal
                  ? "border-[var(--color-success)]/30 bg-[var(--color-success-light)] text-[var(--color-success)]"
                  : "border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isPrivate ? "bg-[var(--color-warning)]" : isGlobal ? "bg-[var(--color-success)]" : "bg-[var(--color-text-muted)]"
              )}
            />
            {row.brand}
          </span>
        )}
      </td>

      <td className="min-w-[210px] px-3 py-3">
        <ParentCell row={row} />
      </td>

      <td className="px-3 py-3">
        {row.sizes.length === 0 ? (
          <span className="text-[var(--color-text-muted)]">—</span>
        ) : (
          <div className="flex max-w-[160px] flex-wrap gap-1">
            {row.sizes.slice(0, 4).map((size) => (
              <span
                key={size}
                className="rounded border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--color-brand-strong)]"
              >
                {size}
              </span>
            ))}
            {row.sizes.length > 4 && (
              <span className="self-center font-mono text-[10px] text-[var(--color-text-muted)]">
                +{row.sizes.length - 4}
              </span>
            )}
          </div>
        )}
      </td>

      <td className="whitespace-nowrap px-3 py-3 font-bold text-[var(--color-text-primary)]">
        {row.price === null ? "—" : `${row.price.toLocaleString()}${row.currency ? ` ${row.currency}` : ""}`}
      </td>

      <td className="whitespace-nowrap px-3 py-3">
        {row.inStock ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-success)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" /> In stock
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)]" /> Out of stock
          </span>
        )}
      </td>
    </tr>
  );
}
