"use client";

import * as React from "react";
import { ExternalLink, Trash2, RefreshCw } from "lucide-react";
import type { StoreConnection } from "@/modules/store/types";
import { PLATFORM_LABELS } from "@/modules/store/constants";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const PLATFORM_EMOJI: Record<string, string> = {
  shopify:     "🛍️",
  woocommerce: "🌐",
  wordpress:   "📝",
  custom:      "⚙️",
};

interface ConnectionCardProps {
  connection: StoreConnection;
  productCount: number;
  categoryCount: number;
  isSyncing: boolean;
  syncedAt: string | null;
  onDisconnect: () => void;
  onSync: () => void;
}

export function ConnectionCard({
  connection,
  productCount,
  categoryCount,
  isSyncing,
  syncedAt,
  onDisconnect,
  onSync,
}: ConnectionCardProps) {
  const lastSync = syncedAt
    ? new Date(syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : connection.connectedAt
    ? new Date(connection.connectedAt).toLocaleDateString()
    : "Never";

  return (
    <div className="card-elevated p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-[var(--color-surface-base)] border border-[var(--color-border)] flex items-center justify-center text-xl shrink-0">
          {PLATFORM_EMOJI[connection.platform]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              {connection.storeName}
            </h3>
            <StatusPill status={connection.status} />
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">{connection.storeUrl}</p>
        </div>
        <span className="text-xs font-medium text-[var(--color-text-muted)] shrink-0 mt-0.5">
          {PLATFORM_LABELS[connection.platform]}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Products",   value: productCount  },
          { label: "Categories", value: categoryCount },
          { label: "Last Sync",  value: lastSync       },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-[var(--radius-lg)] bg-[var(--color-surface-base)] px-3 py-2.5 text-center">
            <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
            <p className="text-sm font-semibold text-[var(--color-text-primary)] mt-0.5 truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={isSyncing}
          onClick={onSync}
          className="flex-1"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin-slow")} />
          {isSyncing ? "Syncing…" : "Sync Now"}
        </Button>
        <a
          href={`https://${connection.storeUrl}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="secondary" size="sm">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </a>
        <Button variant="danger" size="sm" onClick={onDisconnect}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
