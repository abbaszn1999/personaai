"use client";

import * as React from "react";
import { ExternalLink, Trash2, RefreshCw, LoaderCircle, TriangleAlert, CheckCircle2, ArrowRight } from "lucide-react";
import type { StoreConnection } from "@/modules/store/types";
import { PLATFORM_LABELS } from "@/modules/store/constants";
import { Badge } from "@/components/ui/badge";
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
  isDisconnecting: boolean;
  syncedAt: string | null;
  onDisconnect: () => Promise<boolean>;
  onSync: () => void;
  onContinueToCategories: () => void;
}

/**
 * The "connected" state of the Connection tab — ported from the demo's confirmation card, kept
 * to Persona's real data only (no fabricated currency/taxonomy-source fields the demo shows).
 * Sync Now and the external-link button are real Persona features the demo doesn't have (its
 * "Sync" is a different, unrelated concept — the sizing delta engine); both are kept alongside
 * the ported Disconnect/Switch and Continue-to-Categories actions.
 */
export function ConnectionCard({
  connection,
  productCount,
  categoryCount,
  isSyncing,
  isDisconnecting,
  syncedAt,
  onDisconnect,
  onSync,
  onContinueToCategories,
}: ConnectionCardProps) {
  const [confirmingDisconnect, setConfirmingDisconnect] = React.useState(false);

  async function confirmDisconnect() {
    await onDisconnect();
    // On success this card unmounts. On failure, closing exposes the API error rendered by the
    // dashboard and leaves the connection available for another attempt.
    setConfirmingDisconnect(false);
  }

  const lastSync = syncedAt
    ? new Date(syncedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : connection.connectedAt
      ? new Date(connection.connectedAt).toLocaleDateString()
      : "Never";

  return (
    <div className="space-y-4 rounded-[var(--radius-2xl)] border border-[var(--color-success)]/25 bg-[var(--color-success-light)] p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-success-border)] bg-[var(--color-success-fill-strong)] text-[var(--color-success)]">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">
                {connection.storeName}
              </h2>
              <Badge variant="neutral" className="uppercase">
                {PLATFORM_EMOJI[connection.platform]} {PLATFORM_LABELS[connection.platform]}
              </Badge>
              <Badge variant="success">Live</Badge>
            </div>
            <p className="max-w-xl text-xs leading-relaxed text-[var(--color-text-secondary)]">
              Store endpoint{" "}
              <span className="font-mono font-semibold text-[var(--color-text-primary)]">
                {connection.storeUrl}
              </span>{" "}
              is linked and syncing.{" "}
              <strong className="text-[var(--color-text-primary)]">
                {productCount.toLocaleString()} products
              </strong>{" "}
              across {categoryCount.toLocaleString()} selected categories.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" loading={isSyncing} onClick={onSync}>
            <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin-slow")} />
            {isSyncing ? "Syncing…" : "Sync Now"}
          </Button>
          <a href={`https://${connection.storeUrl}`} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm" aria-label="Open store in a new tab">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </a>
          <Button
            variant="secondary"
            size="sm"
            disabled={isDisconnecting}
            onClick={() => setConfirmingDisconnect(true)}
            className="hover:border-[var(--color-error)]/40 hover:text-[var(--color-error)]"
          >
            {isDisconnecting ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Disconnect / Switch
          </Button>
          <Button size="sm" onClick={onContinueToCategories}>
            Continue to Categories
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-success)]/20 pt-4 sm:grid-cols-4">
        <MetricTile label="Total Catalog Products" value={productCount.toLocaleString()} />
        <MetricTile label="Active Categories" value={categoryCount.toLocaleString()} />
        <MetricTile label="Last Sync" value={lastSync} />
        <MetricTile label="Next Required Step" value="Scope Categories" accent />
      </div>

      {confirmingDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cancel store disconnection"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            disabled={isDisconnecting}
            onClick={() => setConfirmingDisconnect(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="disconnect-store-title"
            aria-describedby="disconnect-store-description"
            className="relative w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-6 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-error-light)] text-[var(--color-error)]">
                <TriangleAlert className="h-5 w-5" />
              </div>
              <div>
                <h2 id="disconnect-store-title" className="text-base font-semibold text-[var(--color-text-primary)]">
                  Disconnect {connection.storeName}?
                </h2>
                <p id="disconnect-store-description" className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                  This removes the store connection and permanently deletes its catalog from ACS.
                  Cleanup can take a few minutes for a large catalog.
                </p>
              </div>
            </div>

            {isDisconnecting && (
              <div className="mt-4 flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-base)] px-3 py-2.5 text-sm text-[var(--color-text-secondary)]">
                <LoaderCircle className="h-4 w-4 animate-spin text-[var(--color-brand)]" />
                Removing store connection and catalog…
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={isDisconnecting}
                onClick={() => setConfirmingDisconnect(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={isDisconnecting}
                onClick={confirmDisconnect}
              >
                {isDisconnecting ? "Disconnecting…" : "Disconnect store"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-success)]/20 bg-[var(--color-surface-card)]/70 px-3 py-2.5 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 truncate text-sm font-bold",
          accent ? "text-[var(--color-brand-strong)]" : "text-[var(--color-text-primary)]"
        )}
      >
        {value}
      </p>
    </div>
  );
}
