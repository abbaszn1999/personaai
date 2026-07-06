"use client";

import * as React from "react";
import { RefreshCw, FolderOpen, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOCK_WEARABLE_CATEGORIES, MOCK_UNWEARABLE_CATEGORIES } from "@/lib/mock-api/catalog";
import type { WorkspaceMode } from "@/modules/workspaces/types";
import { cn } from "@/lib/utils/cn";

interface CatalogSyncPanelProps {
  productCount: number;
  categoryCount: number;
  isSyncing: boolean;
  syncedAt: string | null;
  mode: WorkspaceMode;
  onSync: () => void;
}

export function CatalogSyncPanel({
  productCount,
  categoryCount,
  isSyncing,
  syncedAt,
  mode,
  onSync,
}: CatalogSyncPanelProps) {
  const categories = mode === "wearable" ? MOCK_WEARABLE_CATEGORIES : MOCK_UNWEARABLE_CATEGORIES;

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
            <p className="text-xs text-[var(--color-text-muted)]">Categories</p>
            <p className="text-xl font-bold text-[var(--color-text-primary)]">
              {isSyncing ? "…" : categoryCount}
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

      {/* Category tree */}
      <div className="space-y-1">
        <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
          Synced Categories
        </p>
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center justify-between rounded-[var(--radius-lg)] px-3 py-2 hover:bg-[var(--color-surface-base)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <FolderOpen className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
              <span className="text-sm text-[var(--color-text-primary)]">{cat.name}</span>
            </div>
            <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
              {cat.productCount} products
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
