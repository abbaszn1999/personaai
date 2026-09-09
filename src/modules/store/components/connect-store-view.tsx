"use client";

import { Server } from "lucide-react";
import type { useStoreConnect } from "../hooks/use-store-connect";
import { ConnectionCard } from "./connection-card";
import { ConnectStoreForm } from "./connect-store-form";
import { cn } from "@/lib/utils/cn";

interface ConnectStoreViewProps {
  store: ReturnType<typeof useStoreConnect>;
  onConnect: () => void | Promise<void>;
  onContinueToCategories: () => void;
}

/**
 * The Connection tab's full page — ported section-for-section from the demo's
 * `ConnectStoreView.tsx`, recolored to Persona's dark theme and brand orange. Unlike the demo,
 * the platform/credentials card and the connected summary card are mutually exclusive: Persona
 * only supports one live connection at a time, and disconnecting deletes the ACS catalog, so
 * there is no safe "re-test while connected" state to show alongside it.
 */
export function ConnectStoreView({ store, onConnect, onContinueToCategories }: ConnectStoreViewProps) {
  const connection = store.connection;

  return (
    <div className="space-y-5">
      <ConnectionBanner storeName={connection?.storeName ?? null} />

      {connection ? (
        <ConnectionCard
          connection={connection}
          productCount={store.productCount}
          categoryCount={store.categoryCount}
          isSyncing={store.isSyncing}
          isDisconnecting={store.isDisconnecting}
          syncedAt={store.syncedAt}
          onDisconnect={store.disconnect}
          onSync={store.syncNow}
          onContinueToCategories={onContinueToCategories}
        />
      ) : (
        <ConnectStoreForm
          platform={store.form.platform}
          storeUrl={store.form.storeUrl}
          apiKey={store.form.apiKey}
          clientId={store.form.clientId}
          clientSecret={store.form.clientSecret}
          wpUsername={store.form.wpUsername}
          wpAppPassword={store.form.wpAppPassword}
          isConnecting={store.isConnecting}
          canConnect={store.canConnect}
          error={store.connectError}
          onChange={store.updateForm}
          onConnect={onConnect}
        />
      )}

      <ArchitectureCallout />
    </div>
  );
}

function ConnectionBanner({ storeName }: { storeName: string | null }) {
  const isConnected = storeName !== null;

  return (
    <div className="card-base flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-[var(--color-brand-light)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-brand-strong)]">
            Step 1 of Onboarding
          </span>
          <span className="text-xs font-semibold text-[var(--color-text-muted)]">·</span>
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">
            Store Authentication Gate
          </span>
        </div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
          Connect Your E-commerce Store
        </h1>
        <p className="max-w-2xl text-sm text-[var(--color-text-muted)]">
          Authenticate your storefront to sync your raw product catalog and category taxonomy.
          Persona reads your store&apos;s category structure to scope sizing intelligence before
          running the setup pipeline.
        </p>
      </div>

      <div className="flex items-center gap-3 self-start rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3 md:self-auto">
        <span
          className={cn(
            "h-3 w-3 shrink-0 rounded-full",
            isConnected
              ? "bg-[var(--color-success)] ring-4 ring-[var(--color-success-light)]"
              : "bg-[var(--color-warning)] ring-4 ring-[var(--color-warning-light)]"
          )}
        />
        <div>
          <div className="text-xs font-bold text-[var(--color-text-primary)]">
            {isConnected ? "Store Connected" : "Connection Required"}
          </div>
          <div className="max-w-[12rem] truncate font-mono text-[11px] text-[var(--color-text-muted)]">
            {isConnected ? storeName : "No active store"}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArchitectureCallout() {
  return (
    <div className="space-y-2 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-5 text-xs text-[var(--color-text-secondary)]">
      <div className="flex items-center gap-2 font-bold text-[var(--color-text-primary)]">
        <Server className="h-4 w-4 text-[var(--color-brand)]" />
        <span>Why connect first? Scope discipline for every downstream agent</span>
      </div>
      <p className="leading-relaxed">
        Authenticating your store unlocks its category taxonomy. In{" "}
        <strong className="text-[var(--color-text-primary)]">Categories</strong>, you scope which
        leaf categories your agent actually sells from. Every downstream workflow in{" "}
        <strong className="text-[var(--color-text-primary)]">Setup</strong> (stages 1–6),{" "}
        <strong className="text-[var(--color-text-primary)]">Sync</strong>, and{" "}
        <strong className="text-[var(--color-text-primary)]">Size Filter</strong> only ever
        touches products inside that scope — so you never pay to index or size gift cards,
        accessories, or anything outside your catalog.
      </p>
    </div>
  );
}
