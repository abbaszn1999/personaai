"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Sparkles, Store as StoreIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoreConnectionStore } from "@/modules/store/store";
import { cn } from "@/lib/utils/cn";

const POLL_INTERVAL_MS = 5000;

type GateState = "loading" | "no-store" | "indexing" | "not-indexed" | "ready";

/**
 * Whether the wearable agent has a catalog it can actually search.
 *
 * Only `ready` means every product is embedded. A partially indexed catalog is deliberately
 * treated as not ready: the agent would answer from whichever slice happened to be processed
 * first, which reads as missing stock rather than as work in progress.
 */
export function useCatalogReadiness() {
  const hasLoaded = useStoreConnectionStore((s) => s.hasLoaded);
  const connection = useStoreConnectionStore((s) => s.connection);
  const catalogSync = useStoreConnectionStore((s) => s.catalogSync);
  const refreshCatalogSync = useStoreConnectionStore((s) => s.refreshCatalogSync);

  const inFlight = catalogSync.status === "pending" || catalogSync.status === "indexing";

  // Keep polling while indexing runs so the page unblocks on its own the moment it finishes,
  // instead of stranding the merchant on a gate that has gone stale.
  React.useEffect(() => {
    if (!inFlight) return;
    const id = setInterval(refreshCatalogSync, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [inFlight, refreshCatalogSync]);

  const state: GateState = !hasLoaded
    ? "loading"
    : !connection
      ? "no-store"
      : catalogSync.status === "ready"
        ? "ready"
        : inFlight
          ? "indexing"
          : "not-indexed";

  return { state, catalogSync, ready: state === "ready" };
}

interface CatalogReadyGateProps {
  children: React.ReactNode;
  /** `page` fills the route; `inline` sits inside an existing panel. */
  variant?: "page" | "inline";
  /** What the blocked thing is, used in the explanation copy. */
  label?: string;
  /** Set false to pass children straight through — lets a caller scope the gate to wearable
   *  workspaces without duplicating the markup on both branches. */
  enabled?: boolean;
}

/**
 * Withholds children until the catalog is fully indexed.
 *
 * Wearable-only by design — callers decide whether to apply it. The unwearable assistant
 * searches the merchant's store API live and has no index to wait on, so gating it there would
 * block a page that works fine at zero indexed products.
 */
export function CatalogReadyGate({
  children,
  variant = "page",
  label = "This page",
  enabled = true,
}: CatalogReadyGateProps) {
  const { state, catalogSync } = useCatalogReadiness();

  if (!enabled || state === "ready") return <>{children}</>;

  // Render nothing rather than a gate we might immediately retract.
  if (state === "loading") return null;

  const pct =
    catalogSync.total > 0
      ? Math.min(100, Math.round((catalogSync.progress / catalogSync.total) * 100))
      : 0;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === "page" ? "h-full min-h-[420px] px-6 py-16" : "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-4 py-6"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl mb-4",
          variant === "page" ? "h-14 w-14" : "h-10 w-10",
          state === "indexing" ? "gradient-brand" : "panel-glass"
        )}
      >
        {state === "no-store" ? (
          <StoreIcon className={cn(variant === "page" ? "h-6 w-6" : "h-4 w-4", "text-[var(--color-text-muted)]")} />
        ) : state === "indexing" ? (
          <Loader2 className={cn(variant === "page" ? "h-6 w-6" : "h-4 w-4", "text-white animate-spin")} />
        ) : (
          <Sparkles className={cn(variant === "page" ? "h-6 w-6" : "h-4 w-4", "text-[var(--color-text-muted)]")} />
        )}
      </div>

      <h3
        className={cn(
          "font-semibold text-[var(--color-text-primary)]",
          variant === "page" ? "text-base" : "text-sm"
        )}
      >
        {state === "no-store" && "Connect your store first"}
        {state === "indexing" && "Preparing your catalog"}
        {state === "not-indexed" && "Finish store setup"}
      </h3>

      <p className="mt-1.5 text-sm text-[var(--color-text-muted)] max-w-sm">
        {state === "no-store" && `${label} needs a connected store before your agent has anything to recommend.`}
        {state === "indexing" &&
          (catalogSync.total > 0
            ? `${catalogSync.progress.toLocaleString()} of ${catalogSync.total.toLocaleString()} products ready. ${label.toLowerCase()} unlocks automatically when this finishes — you can close this page and come back.`
            : `Counting your catalog. ${label} unlocks automatically when indexing finishes.`)}
        {state === "not-indexed" &&
          `Work through Store — Setup to review your field mapping and build the index. ${label.toLowerCase()} unlocks once that finishes.`}
      </p>

      {state === "indexing" && catalogSync.total > 0 && (
        <div className={cn("mt-5 w-full", variant === "page" ? "max-w-xs" : "max-w-full")}>
          <div className="h-1.5 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
            <div
              className="h-full rounded-full gradient-brand transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">{pct}% complete</p>
        </div>
      )}

      {state !== "indexing" && (
        <div className="mt-5">
          {/* Deep-linked, because "go to /store" lands on Connection — which is already done in the
              not-indexed case, leaving the merchant to work out that the next step is Setup. */}
          <Link href={state === "no-store" ? "/store?section=connection" : "/store?section=setup"}>
            <Button size="sm" variant={variant === "page" ? "primary" : "secondary"}>
              {state === "no-store" ? "Connect a store" : "Open setup"}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
