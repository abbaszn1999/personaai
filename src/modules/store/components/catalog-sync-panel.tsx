"use client";

import * as React from "react";
import { RefreshCw, FolderOpen, Package, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOCK_WEARABLE_CATEGORIES, MOCK_UNWEARABLE_CATEGORIES } from "@/lib/mock-api/catalog";
import type { WorkspaceMode } from "@/modules/workspaces/types";
import { useStoreConnectionStore } from "@/modules/store/store";
import { cn } from "@/lib/utils/cn";

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
              {isSyncing ? "…" : categories.length}
            </p>
          </div>
        </div>
      </div>

      {/* Sync button + last synced */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-muted)]">
          {syncedAt
            ? `Last synced at ${new Date(syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Not synced yet"}
        </p>
        <Button variant="secondary" size="sm" loading={isSyncing} onClick={onSync}>
          <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin-slow")} />
          {isSyncing ? "Syncing…" : "Sync Now"}
        </Button>
      </div>

      {/* Category selection — which synced categories the agent can use */}
      <CategorySelector categories={categories} />
    </div>
  );
}

interface CategoryOption {
  id: string;
  name: string;
  productCount: number;
}

/**
 * Renders only while a store connection exists (parent gates on `connection`),
 * so it naturally mounts fresh whenever the connection is (re)created —
 * no effect needed to resync local state with the store.
 */
function CategorySelector({ categories }: { categories: CategoryOption[] }) {
  const selectedCategoryIds = useStoreConnectionStore((s) => s.selectedCategoryIds);
  const updateSelectedCategories = useStoreConnectionStore((s) => s.updateSelectedCategories);

  const [selected, setSelected] = React.useState<string[]>(selectedCategoryIds);
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isDirty = React.useMemo(() => {
    const a = [...selected].sort();
    const b = [...selectedCategoryIds].sort();
    return a.length !== b.length || a.some((id, i) => id !== b[i]);
  }, [selected, selectedCategoryIds]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const ok = await updateSelectedCategories(selected);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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
          Choose which synced categories the agent can access and recommend.
        </p>
      </div>

      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}

      {categories.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)] py-2">
          No collections found on this store yet. Create a collection in your store admin, then Sync Now.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2">
        {categories.map((cat) => {
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
                <p className="text-xs text-[var(--color-text-muted)]">{cat.productCount} products</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-[var(--color-text-muted)]">
          {selected.length} of {categories.length} categories selected
        </p>
        <Button size="sm" loading={saving} onClick={handleSave} disabled={!isDirty}>
          {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
