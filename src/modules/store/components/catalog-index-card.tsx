"use client";

import * as React from "react";
import { AlertCircle, FolderOpen, Loader2, Package, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoreConnectionStore } from "@/modules/store/store";

const POLL_INTERVAL_MS = 5000;

/**
 * Starting the index, and watching it run. The last thing a merchant does in setup.
 *
 * This used to be a tab of its own, which put it *before* the sizing pipeline in the sidebar and let
 * a merchant index a catalog Persona could search but not size. It is one control in one place now:
 * everything the index needs — an approved mapping from Stage 1, a category scope, and (from Phase 7)
 * resolved size charts — is upstream of it by construction, so the ordering enforces what a runtime
 * gate used to have to check.
 *
 * The credential-level "Sync Now" that lived alongside it is not reproduced here; it only refreshes
 * the store's taxonomy and product count, and already exists on the Connection tab.
 */
export function CatalogIndexCard() {
  const catalogSync = useStoreConnectionStore((s) => s.catalogSync);
  const refreshCatalogSync = useStoreConnectionStore((s) => s.refreshCatalogSync);
  const reindex = useStoreConnectionStore((s) => s.reindex);
  const selectedCategoryIds = useStoreConnectionStore((s) => s.selectedCategoryIds);
  const categories = useStoreConnectionStore((s) => s.categories);
  const productCount = useStoreConnectionStore((s) => s.productCount);
  const syncError = useStoreConnectionStore((s) => s.syncError);
  const [starting, setStarting] = React.useState(false);

  const inFlight = catalogSync.status === "pending" || catalogSync.status === "indexing";
  // Indexing walks the selection, so with nothing selected there is no work to start. Offering the
  // button anyway would produce a run that enqueues zero products and looks broken.
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
    catalogSync.total > 0 ? Math.min(100, Math.round((catalogSync.progress / catalogSync.total) * 100)) : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4">
          <div className="gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Package className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Products in store</p>
            <p className="text-xl font-bold text-[var(--color-text-primary)]">{productCount.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4">
          <div className="gradient-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <FolderOpen className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Categories selected</p>
            <p className="text-xl font-bold text-[var(--color-text-primary)]">
              {/* Of every category the store reports, at any depth — the same tree the Categories
                  tab shows, so a top-level-only count would read as a mismatch against it. */}
              {selectedCategoryIds.length.toLocaleString()}
              <span className="text-sm font-medium text-[var(--color-text-muted)]">
                {" "}
                / {categories.length.toLocaleString()}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
              {inFlight ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
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
                    : "Choose categories on the Categories tab first")}
              </p>
            </div>
          </div>
          {!inFlight && hasSelection && (
            <Button size="sm" loading={starting} onClick={handleReindex}>
              {catalogSync.status === "ready" ? "Re-index" : "Build index"}
            </Button>
          )}
        </div>

        {inFlight && catalogSync.total > 0 && (
          <div className="space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
              <div
                className="gradient-brand h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">{pct}% complete</p>
          </div>
        )}

        {syncError && (
          <p className="flex items-start gap-1.5 text-xs text-[var(--color-error)]">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {syncError}
          </p>
        )}
      </div>
    </div>
  );
}
