"use client";

import * as React from "react";
import {
  RefreshCw,
  FolderOpen,
  Package,
  Check,
  Sparkles,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOCK_WEARABLE_CATEGORIES, MOCK_UNWEARABLE_CATEGORIES } from "@/lib/mock-api/catalog";
import type { WorkspaceMode } from "@/modules/workspaces/types";
import { useStoreConnectionStore } from "@/modules/store/store";
import type { StoreCategory } from "@/modules/store/types";
import { topLevelCategories } from "@/lib/catalog/category-scope";
import { cn } from "@/lib/utils/cn";
import { MappingPreviewModal } from "./mapping-preview-modal";

interface CatalogSyncPanelProps {
  productCount: number;
  isSyncing: boolean;
  syncedAt: string | null;
  mode: WorkspaceMode;
  onSync: () => void;
}

export function CatalogSyncPanel({
  productCount,
  isSyncing,
  syncedAt,
  mode,
  onSync,
}: CatalogSyncPanelProps) {
  // Real categories (e.g. Shopify collections) take priority; still-simulated
  // platforms fall back to the mock wearable/unwearable taxonomy.
  const storeCategories = useStoreConnectionStore((s) => s.categories);
  const categories =
    storeCategories.length > 0
      ? storeCategories
      : mode === "wearable"
        ? MOCK_WEARABLE_CATEGORIES
        : MOCK_UNWEARABLE_CATEGORIES;

  return (
    <div className="space-y-4">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg gradient-brand flex items-center justify-center shrink-0">
            <Package className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Products</p>
            <p className="text-xl font-bold text-[var(--color-text-primary)]">
              {isSyncing ? "…" : productCount.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg gradient-accent flex items-center justify-center shrink-0">
            <FolderOpen className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Categories Synced</p>
            <p className="text-xl font-bold text-[var(--color-text-primary)]">
              {/* Top-level only, matching the selector below — reporting a flattened total here
                  reads as a mismatch against a list showing far fewer rows. */}
              {isSyncing ? "…" : topLevelCategories(categories).length}
            </p>
          </div>
        </div>
      </div>

      {/* Sync button + last synced */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-muted)]">
          {syncedAt
            ? `Last synced at ${new Date(syncedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
            : "Not synced yet"}
        </p>
        <Button variant="secondary" size="sm" loading={isSyncing} onClick={onSync}>
          <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin-slow")} />
          {isSyncing ? "Syncing…" : "Sync Now"}
        </Button>
      </div>

      {/* AI index state — separate from the credential sync above, because a
          store can be connected while none of its products are searchable yet */}
      <CatalogIndexStatusCard />

      {/* Category selection — which synced categories the agent can use */}
      <CategorySelector categories={categories} />

      <MappingPreviewModal />
    </div>
  );
}

const POLL_INTERVAL_MS = 5000;

/**
 * Surfaces the enrich-and-embed pipeline, which runs out-of-band and can take
 * minutes on a large catalog. Polls only while work is actually outstanding.
 */
function CatalogIndexStatusCard() {
  const catalogSync = useStoreConnectionStore((s) => s.catalogSync);
  const refreshCatalogSync = useStoreConnectionStore((s) => s.refreshCatalogSync);
  const reindex = useStoreConnectionStore((s) => s.reindex);
  const selectedCategoryIds = useStoreConnectionStore((s) => s.selectedCategoryIds);
  const [starting, setStarting] = React.useState(false);

  const inFlight = catalogSync.status === "pending" || catalogSync.status === "indexing";
  // Indexing walks the selection, so with nothing selected there is no work to start. Offering
  // the button anyway would produce a run that enqueues zero products and looks broken.
  const hasSelection = selectedCategoryIds.length > 0;

  React.useEffect(() => {
    if (!inFlight) return;
    const id = setInterval(refreshCatalogSync, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [inFlight, refreshCatalogSync]);

  async function handleReindex() {
    setStarting(true);
    await reindex();
    setStarting(false);
  }

  const pct =
    catalogSync.total > 0
      ? Math.min(100, Math.round((catalogSync.progress / catalogSync.total) * 100))
      : 0;

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-lg gradient-brand flex items-center justify-center shrink-0">
            {inFlight ? (
              <Loader2 className="h-4 w-4 text-white animate-spin" />
            ) : catalogSync.status === "error" ? (
              <AlertCircle className="h-4 w-4 text-white" />
            ) : (
              <Sparkles className="h-4 w-4 text-white" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">AI Search Index</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {catalogSync.status === "pending" && "Queued — starting shortly…"}
              {catalogSync.status === "indexing" &&
                (catalogSync.total > 0
                  ? `Indexing ${catalogSync.progress.toLocaleString()} of ${catalogSync.total.toLocaleString()} products`
                  : "Counting your catalog…")}
              {catalogSync.status === "ready" &&
                `${catalogSync.progress.toLocaleString()} products searchable by your agent`}
              {catalogSync.status === "error" && "Indexing failed — try again"}
              {catalogSync.status === "idle" &&
                (hasSelection
                  ? "Not indexed yet — your agent can't search products"
                  : "Choose categories below to start indexing")}
            </p>
          </div>
        </div>
        {!inFlight && hasSelection && (
          <Button variant="secondary" size="sm" loading={starting} onClick={handleReindex}>
            {catalogSync.status === "ready" ? "Re-index" : "Build Index"}
          </Button>
        )}
      </div>

      {inFlight && catalogSync.total > 0 && (
        <div className="space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
            <div
              className="h-full rounded-full gradient-brand transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">{pct}% complete</p>
        </div>
      )}
    </div>
  );
}

/**
 * Renders only while a store connection exists (parent gates on `connection`),
 * so it naturally mounts fresh whenever the connection is (re)created —
 * no effect needed to resync local state with the store.
 */
function CategorySelector({ categories }: { categories: StoreCategory[] }) {
  const selectedCategoryIds = useStoreConnectionStore((s) => s.selectedCategoryIds);
  const updateSelectedCategories = useStoreConnectionStore((s) => s.updateSelectedCategories);

  const [selected, setSelected] = React.useState<string[]>(selectedCategoryIds);
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Only top-level categories are offered. Sub-categories come along with their parent, which
  // keeps the list short and removes the repeated "Clothing / Clothing / Clothing" rows a
  // flattened tree produces.
  const options = React.useMemo(() => topLevelCategories(categories), [categories]);

  // What choosing this actually commits to. Indexing is billed per product, so the number the
  // merchant is agreeing to should be on screen before they press save rather than discovered
  // afterwards from the progress bar.
  const selectedProductCount = React.useMemo(
    () =>
      options
        .filter((category) => selected.includes(category.id))
        .reduce((total, category) => total + category.productCount, 0),
    [options, selected]
  );

  const isDirty = React.useMemo(() => {
    const a = [...selected].sort();
    const b = [...selectedCategoryIds].sort();
    return a.length !== b.length || a.some((id, i) => id !== b[i]);
  }, [selected, selectedCategoryIds]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const openMappingPreview = useStoreConnectionStore((s) => s.openMappingPreview);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const outcome = await updateSelectedCategories(selected);
    if (outcome === "ok") {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else if (outcome === "needs_approval") {
      // Not a failure — the merchant just hasn't seen the mapping preview yet (or the mapper
      // changed since they last approved it). Opening the modal here means approving replays
      // this exact save automatically, so nothing typed here is lost.
      await openMappingPreview(selected);
    } else {
      setError("Failed to update categories");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Active Categories
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Pick the categories your agent should sell from. Only these are indexed, and
          sub-categories are included automatically.
        </p>
      </div>

      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}

      {options.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)] py-2">
          No collections found on this store yet. Create a collection in your store admin, then Sync Now.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2">
        {options.map((cat) => {
          const active = selected.includes(cat.id);
          return (
            <button
              key={cat.id}
              onClick={() => toggle(cat.id)}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-all",
                active
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-light)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-brand)]/50 hover:bg-[var(--color-surface-base)]"
              )}
            >
              <div
                className={cn(
                  "h-5 w-5 rounded flex items-center justify-center shrink-0 border transition-all",
                  active
                    ? "gradient-brand border-transparent"
                    : "border-[var(--color-border)] bg-[var(--color-surface-base)]"
                )}
              >
                {active && <Check className="h-3 w-3 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{cat.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {cat.productCount.toLocaleString()} products
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-xs text-[var(--color-text-muted)]">
          {selected.length === 0
            ? "Nothing selected — your agent has nothing to recommend"
            : `${selected.length} of ${options.length} categories · about ${selectedProductCount.toLocaleString()} products to index`}
        </p>
        <Button size="sm" loading={saving} onClick={handleSave} disabled={!isDirty}>
          {saved ? (
            <>
              <Check className="h-3.5 w-3.5" /> Saved
            </>
          ) : (
            "Save & Index"
          )}
        </Button>
      </div>
    </div>
  );
}
