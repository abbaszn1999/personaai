"use client";

/**
 * Preview of a store category's live products, a page at a time (25 / 50 / 100), for the Mapping tab.
 * Every field shown comes from the merchant's store through `/api/store-connection/category-samples`
 * — real SKU, brand, price, stock and sizes — so what the merchant checks here is what the scan sees.
 */

import * as React from "react";
import {
  X,
  Search,
  Package,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import type { CategorySamplePage, CategorySampleProduct } from "../types";
import type { StoreCategoryItem } from "./persona-taxonomy";

const PAGE_SIZES = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];
const DEFAULT_PAGE_SIZE: PageSize = 50;

interface LoadedPage {
  items: CategorySampleProduct[];
  nextCursor: string | null;
  hiddenNoImage: number;
}

function formatPrice(item: CategorySampleProduct): string {
  if (item.price === null) return "—";
  return `${item.currency ?? ""} ${item.price.toFixed(2)}`.trim();
}

function matchesSearch(item: CategorySampleProduct, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    (item.sku ?? "").toLowerCase().includes(q) ||
    (item.brand ?? "").toLowerCase().includes(q) ||
    item.sizes.some((size) => size.toLowerCase().includes(q))
  );
}

function StockBadge({ inStock }: { inStock: boolean }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium",
        inStock
          ? "border-[var(--color-success-border)] bg-[var(--color-success-light)] text-[var(--color-success)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-muted)]"
      )}
    >
      {inStock ? "In stock" : "Out of stock"}
    </span>
  );
}

/**
 * Pages are fetched by cursor, so the cursor for page N+1 only exists once page N has loaded. The
 * hook keeps that chain and a per-(size, cursor) cache, which makes going back a page instant and
 * going forward cost one request.
 */
function useCategoryPreviewPages(categoryId: string, fallbackTotal: number) {
  const [pageSize, setPageSizeState] = React.useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [page, setPage] = React.useState<LoadedPage | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState<{ value: number; exact: boolean }>({
    value: fallbackTotal,
    exact: false,
  });
  const [retryNonce, setRetryNonce] = React.useState(0);

  const cursorsRef = React.useRef<Array<string | null>>([null]);
  const cacheRef = React.useRef(new Map<string, LoadedPage>());

  React.useEffect(() => {
    const cursor = cursorsRef.current[pageIndex] ?? null;
    const cacheKey = `${pageSize}|${cursor ?? ""}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      cursorsRef.current[pageIndex + 1] = cached.nextCursor;
      setPage(cached);
      setStatus("ready");
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    setErrorMessage(null);

    const query = new URLSearchParams({ categoryId, pageSize: String(pageSize) });
    if (cursor) query.set("cursor", cursor);

    fetch(`/api/store-connection/category-samples?${query.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as Partial<CategorySamplePage> & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not load products");
        const loaded: LoadedPage = {
          items: data.items ?? [],
          nextCursor: data.nextCursor ?? null,
          hiddenNoImage: data.hiddenNoImage ?? 0,
        };
        cacheRef.current.set(cacheKey, loaded);
        cursorsRef.current[pageIndex + 1] = loaded.nextCursor;
        if (data.total !== null && data.total !== undefined) {
          setTotal({ value: data.total, exact: Boolean(data.totalExact) });
        }
        setPage(loaded);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not load products");
        setStatus("error");
      });

    return () => controller.abort();
  }, [categoryId, pageSize, pageIndex, retryNonce]);

  const setPageSize = React.useCallback((size: PageSize) => {
    // A cursor is only valid for the size that produced it, so a new size restarts from the top.
    cursorsRef.current = [null];
    setPageIndex(0);
    setPageSizeState(size);
  }, []);

  const lastPageReached = status === "ready" && page !== null && page.nextCursor === null;
  const knownTotal = lastPageReached ? pageIndex * pageSize + (page?.items.length ?? 0) : total.value;

  return {
    pageSize,
    setPageSize,
    pageIndex,
    goPrev: () => setPageIndex((index) => Math.max(0, index - 1)),
    goNext: () => setPageIndex((index) => index + 1),
    page,
    status,
    errorMessage,
    retry: () => setRetryNonce((n) => n + 1),
    total: knownTotal,
    totalExact: lastPageReached || total.exact,
  };
}

interface CategoryItemsPreviewModalProps {
  category: StoreCategoryItem | null;
  onClose: () => void;
  onSelectForMapping?: (category: StoreCategoryItem) => void;
}

export function CategoryItemsPreviewModal({ category, onClose, onSelectForMapping }: CategoryItemsPreviewModalProps) {
  if (!category) return null;
  return <PreviewBody category={category} onClose={onClose} onSelectForMapping={onSelectForMapping} />;
}

function PreviewBody({
  category,
  onClose,
  onSelectForMapping,
}: {
  category: StoreCategoryItem;
  onClose: () => void;
  onSelectForMapping?: (category: StoreCategoryItem) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"grid" | "table">("grid");
  const pages = useCategoryPreviewPages(category.id, category.productCount);

  const items = React.useMemo(() => pages.page?.items ?? [], [pages.page]);
  const filteredItems = React.useMemo(() => items.filter((item) => matchesSearch(item, search)), [items, search]);

  const firstShown = items.length === 0 ? 0 : pages.pageIndex * pages.pageSize + 1;
  const lastShown = pages.pageIndex * pages.pageSize + items.length;
  const totalPages = Math.max(1, Math.ceil(pages.total / pages.pageSize));
  const hasNext = pages.page?.nextCursor != null;
  const isLoading = pages.status === "loading";

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      className="max-w-4xl max-h-[90vh]"
      icon={<Package className="h-5 w-5" />}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-base font-extrabold tracking-tight sm:text-lg">{category.name}</span>
          <span className="rounded-[var(--radius-md)] border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-2 py-0.5 text-xs font-bold text-[var(--color-brand-strong)]">
            {pages.total.toLocaleString()} {pages.totalExact ? "" : "~"}SKUs
          </span>
          {category.status === "mapped" ? (
            <span className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-success-border)] bg-[var(--color-success-light)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-success)]">
              <CheckCircle2 className="h-3 w-3" /> Mapped
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-warning-border)] bg-[var(--color-warning-light)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-warning)]">
              <AlertCircle className="h-3 w-3" /> Unmapped
            </span>
          )}
        </span>
      }
      description={
        <span className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 truncate">
            <span>Store Route:</span>
            <span className="truncate font-semibold text-[var(--color-text-secondary)]">{category.storePath}</span>
          </span>
          {category.assignedPersonaPath && (
            <span className="flex items-center gap-1.5 truncate">
              <span className="text-[11px]">Persona Mapping:</span>
              <span className="truncate rounded border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-1.5 py-0.2 font-bold text-[var(--color-brand-strong)]">
                {category.assignedPersonaPath}
              </span>
            </span>
          )}
        </span>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="text-xs font-medium text-[var(--color-text-muted)]">
            Category ID: <code className="font-mono text-[var(--color-text-secondary)]">{category.id}</code>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-sticky)] px-3.5 py-1.5 text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-elevated)]">
              Close
            </button>
            {onSelectForMapping && (
              <button
                type="button"
                onClick={() => { onSelectForMapping(category); onClose(); }}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-xl)] px-4 py-1.5 text-xs font-bold text-white gradient-brand shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-glow)]"
              >
                <span>Select for Mapping</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="-mx-5 -mt-5 flex shrink-0 flex-col items-stretch justify-between gap-2.5 border-b border-[var(--color-mapping-border)] bg-[var(--color-mapping-panel)] p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this page by title, SKU, brand or size…"
            className="w-full rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] py-1.5 pl-9 pr-8 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)]">
            Per page
            <select
              value={pages.pageSize}
              onChange={(e) => pages.setPageSize(Number(e.target.value) as PageSize)}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-1.5 py-1 text-xs font-bold text-[var(--color-text-primary)] focus:border-[var(--color-brand)] focus:outline-none"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-0.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-0.5">
            {(["grid", "table"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-bold transition-colors",
                  viewMode === mode ? "bg-[var(--color-surface-sticky)] text-[var(--color-brand-strong)] shadow-[var(--shadow-card)]" : "text-[var(--color-text-secondary)]"
                )}
              >
                {mode === "grid" ? "Grid" : "List"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="-mx-5 min-h-0 flex-1 overflow-y-auto bg-[var(--color-mapping-canvas)] p-4 sm:p-5">
        {pages.status === "error" ? (
          <div className="space-y-2 rounded-[var(--radius-xl)] border border-[var(--color-danger-border,var(--color-border))] bg-[var(--color-surface-sticky)] p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-[var(--color-danger,var(--color-warning))]" />
            <p className="text-xs font-bold text-[var(--color-text-secondary)]">Could not load products from your store</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">{pages.errorMessage}</p>
            <button type="button" onClick={pages.retry} className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-brand-strong)] hover:underline">
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        ) : isLoading && items.length === 0 ? (
            <div className="p-12 text-center text-sm font-semibold text-[var(--color-text-muted)]">Loading live products…</div>
        ) : items.length === 0 ? (
          <div className="space-y-2 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-sticky)] p-8 text-center">
            <Package className="mx-auto h-8 w-8 text-[var(--color-text-muted)]" />
            <p className="text-xs font-bold text-[var(--color-text-secondary)]">No active products in this category</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Drafts and archived products are not shown.</p>
          </div>
          ) : filteredItems.length === 0 ? (
            <div className="space-y-2 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-sticky)] p-8 text-center">
              <Package className="mx-auto h-8 w-8 text-[var(--color-text-muted)]" />
            <p className="text-xs font-bold text-[var(--color-text-secondary)]">Nothing on this page matches your search</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Search covers the {items.length} products on this page. Go to another page or clear the search.</p>
              <button type="button" onClick={() => setSearch("")} className="text-xs font-bold text-[var(--color-brand-strong)] hover:underline">
                Clear search
              </button>
            </div>
          ) : viewMode === "grid" ? (
          <div className={cn("grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-4", isLoading && "opacity-60")}>
              {filteredItems.map((item) => (
              <div key={item.externalId} className="mapping-interactive group flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-mapping-border)] bg-[var(--color-mapping-panel-alt)] shadow-[var(--shadow-card)]">
                  <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-surface-base)]">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]"><Package className="h-8 w-8" /></div>
                    )}
                  {item.sku && (
                    <span className="absolute left-2 top-2 max-w-[70%] truncate rounded bg-[var(--color-surface-sticky)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-text-primary)]">{item.sku}</span>
                  )}
                  <span className="absolute bottom-2 right-2 rounded-[var(--radius-md)] bg-[#fff7f0] px-2 py-0.5 text-xs font-extrabold text-slate-900 shadow-[var(--shadow-card)]">{formatPrice(item)}</span>
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-2 p-3">
                    <div>
                      <h4 className="line-clamp-2 text-xs font-bold leading-tight text-[var(--color-text-primary)]">{item.title}</h4>
                    <p className="mt-1 truncate text-[11px] text-[var(--color-text-muted)]">{item.brand ?? "No brand"}</p>
                    </div>
                    <div className="flex items-center justify-between gap-1 border-t border-[var(--color-border)] pt-2 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1">
                        {item.sizes.slice(0, 3).map((s) => (
                          <span key={s} className="rounded bg-[var(--color-surface-base)] px-1 py-0.2 text-[9px] font-bold text-[var(--color-text-secondary)]">{s}</span>
                        ))}
                        {item.sizes.length > 3 && <span className="text-[9px] text-[var(--color-text-muted)]">+{item.sizes.length - 3}</span>}
                      </div>
                    <StockBadge inStock={item.inStock} />
                  </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div className={cn("overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-sticky)]", isLoading && "opacity-60")}>
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-base)] font-semibold text-[var(--color-text-muted)]">
                    <th className="px-3 py-2.5">Item</th>
                    <th className="px-3 py-2.5">SKU</th>
                  <th className="px-3 py-2.5">Brand</th>
                    <th className="px-3 py-2.5">Price</th>
                    <th className="px-3 py-2.5">Sizes</th>
                  <th className="px-3 py-2.5 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {filteredItems.map((item) => (
                  <tr key={item.externalId} className="transition-colors hover:bg-[var(--color-brand-light)]/40">
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)] object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-muted)]"><Package className="h-4 w-4" /></div>
                        )}
                        {item.productUrl ? (
                          <a href={item.productUrl} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 font-bold text-[var(--color-text-primary)] hover:text-[var(--color-brand-strong)]">
                            <span className="line-clamp-1">{item.title}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]" />
                          </a>
                        ) : (
                          <span className="line-clamp-1 font-bold text-[var(--color-text-primary)]">{item.title}</span>
                        )}
                        </div>
                      </td>
                    <td className="px-3 py-2.5 font-mono font-medium text-[var(--color-text-secondary)]">{item.sku ?? "—"}</td>
                    <td className="max-w-[140px] truncate px-3 py-2.5 text-[var(--color-text-secondary)]">{item.brand ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-extrabold text-[var(--color-text-primary)]">{formatPrice(item)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                        {item.sizes.length === 0 && <span className="text-[var(--color-text-muted)]">—</span>}
                          {item.sizes.map((s) => (
                            <span key={s} className="rounded bg-[var(--color-surface-base)] px-1 py-0.2 font-mono text-[9px] font-bold text-[var(--color-text-secondary)]">{s}</span>
                          ))}
                        </div>
                      </td>
                    <td className="px-3 py-2.5 text-right"><StockBadge inStock={item.inStock} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <div className="-mx-5 -mb-5 flex shrink-0 items-center justify-between gap-3 border-t border-[var(--color-mapping-border)] bg-[var(--color-mapping-panel)] px-4 py-2.5 text-xs">
        <span className="font-medium text-[var(--color-text-muted)]">
          {items.length === 0
            ? isLoading ? "Loading…" : "No products"
            : `${firstShown.toLocaleString()}–${lastShown.toLocaleString()} of ${pages.total.toLocaleString()}${pages.totalExact ? "" : "+"}`}
          {search.trim() && items.length > 0 && ` · ${filteredItems.length} match on this page`}
          {(pages.page?.hiddenNoImage ?? 0) > 0 && (
            <span
              className="text-[var(--color-warning)]"
              title="Products without an image cannot be shown to shoppers, so they are never published."
            >
              {` · ${pages.page!.hiddenNoImage.toLocaleString()} hidden: no image`}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--color-text-muted)]">
            Page {pages.pageIndex + 1}{pages.total > 0 ? ` of ${Math.max(totalPages, pages.pageIndex + 1)}${pages.totalExact ? "" : "+"}` : ""}
          </span>
          <button
            type="button"
            onClick={pages.goPrev}
            disabled={pages.pageIndex === 0 || isLoading}
            aria-label="Previous page"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-elevated)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={pages.goNext}
            disabled={!hasNext || isLoading}
            aria-label="Next page"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-elevated)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
