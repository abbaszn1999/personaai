"use client";

import * as React from "react";
import { Check, Plug, Store, Lock, ShieldCheck, RefreshCw } from "lucide-react";
import type { StorePlatform } from "@/modules/store/types";
import { PLATFORM_LABELS } from "@/modules/store/constants";
import { PLATFORM_API_LABEL } from "../mocks/connections";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface PlatformMeta {
  emoji: string;
  description: string;
  pillLabel: string;
  pillTone: "success" | "info" | "neutral";
}

// Capability pills describe real behavior, not marketing: Shopify collections have no parent/child
// links (flat), only WooCommerce reports a real hierarchy, and Custom is whatever the feed sends.
const PLATFORM_META: Record<StorePlatform, PlatformMeta> = {
  shopify: {
    emoji: "🛍️",
    description: "Admin API — read-only products & collections",
    pillLabel: "Flat collections",
    pillTone: "info",
  },
  woocommerce: {
    emoji: "🌐",
    description: "WooCommerce REST API — nested category hierarchy",
    pillLabel: "Category tree, any depth",
    pillTone: "success",
  },
  wordpress: {
    emoji: "📝",
    description: "WooCommerce REST API — nested category hierarchy",
    pillLabel: "Category tree, any depth",
    pillTone: "success",
  },
  custom: {
    emoji: "⚙️",
    description: "Any headless or custom storefront",
    pillLabel: "Direct feed ingest",
    pillTone: "neutral",
  },
};

const PILL_TONE_CLASSES: Record<PlatformMeta["pillTone"], string> = {
  success: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  info:    "bg-[var(--color-info-light)] text-[var(--color-info)]",
  neutral: "bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]",
};

// Persona's 3 real, working integrations only — no BigCommerce tile like the demo has, since
// there is nothing behind it here.
const PLATFORMS: StorePlatform[] = ["shopify", "wordpress", "custom"];

const VERIFY_STEPS = [
  "Validating API credentials and endpoint security…",
  "Querying store metadata…",
  "Fetching category taxonomy…",
  "Finalizing connection…",
];

interface ConnectStoreFormProps {
  platform: StorePlatform | null;
  storeUrl: string;
  apiKey: string;
  clientId: string;
  clientSecret: string;
  wpUsername: string;
  wpAppPassword: string;
  isConnecting: boolean;
  canConnect: boolean;
  error?: string | null;
  onChange: (patch: {
    platform?: StorePlatform | null;
    storeUrl?: string;
    apiKey?: string;
    clientId?: string;
    clientSecret?: string;
    wpUsername?: string;
    wpAppPassword?: string;
  }) => void;
  onConnect: () => void;
}

/**
 * The "not yet connected" state of the Connection tab — ported from the demo's platform +
 * credentials card. Connection logic is untouched: same 3 platforms, same required fields per
 * platform, same `onChange`/`onConnect`/`canConnect` contract from `useStoreConnect`.
 */
export function ConnectStoreForm({
  platform,
  storeUrl,
  apiKey,
  clientId,
  clientSecret,
  wpUsername,
  wpAppPassword,
  isConnecting,
  canConnect,
  error,
  onChange,
  onConnect,
}: ConnectStoreFormProps) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-base)] px-6 py-4">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-[var(--color-brand)]" />
          <h2 className="text-sm font-bold text-[var(--color-text-primary)]">
            Select Platform &amp; API Configuration
          </h2>
        </div>
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          Read-only catalog &amp; taxonomy permissions
        </span>
      </div>

      <div className="space-y-6 p-6">
        {/* Platform selector */}
        <div className="space-y-2.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
            1. Choose your e-commerce platform
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PLATFORMS.map((p) => (
              <PlatformTile
                key={p}
                platform={p}
                selected={platform === p}
                onSelect={() =>
                  onChange({
                    platform: p,
                    storeUrl: "",
                    apiKey: "",
                    clientId: "",
                    clientSecret: "",
                    wpUsername: "",
                    wpAppPassword: "",
                  })
                }
              />
            ))}
          </div>
        </div>

        {/* Credentials */}
        {platform && (
          <div className="space-y-4 border-t border-[var(--color-border)] pt-5 animate-fade-in">
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
              2. Enter authentication details ({PLATFORM_LABELS[platform]})
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Store URL"
                placeholder={
                  platform === "shopify"
                    ? "yourstore.myshopify.com"
                    : "yourstore.com"
                }
                value={storeUrl}
                onChange={(e) => onChange({ storeUrl: e.target.value })}
              />

              {platform === "shopify" ? (
                <>
                  <Input
                    label="Client ID"
                    placeholder="Paste your app's Client ID"
                    value={clientId}
                    onChange={(e) => onChange({ clientId: e.target.value })}
                    hint="Create a Custom app for your store in the Shopify Dev Dashboard (Settings → Client credentials), grant it the read_products and read_orders scopes, and install it on your store — then paste its Client ID and Client Secret here. Verified live and stored encrypted."
                  />
                  <Input
                    label="Client Secret"
                    type="password"
                    icon={<Lock className="h-3.5 w-3.5" />}
                    placeholder="Paste your app's Client Secret"
                    value={clientSecret}
                    onChange={(e) => onChange({ clientSecret: e.target.value })}
                  />
                </>
              ) : platform === "wordpress" ? (
                <>
                  <Input
                    label="WordPress Username"
                    placeholder="e.g. shop-manager"
                    value={wpUsername}
                    onChange={(e) => onChange({ wpUsername: e.target.value })}
                    hint="Generate an Application Password from a dedicated WordPress user (Users → Profile → Application Passwords) — ideally a Shop Manager account rather than your personal admin login. Verified live against your store's WooCommerce REST API and stored encrypted."
                  />
                  <Input
                    label="Application Password"
                    type="password"
                    icon={<Lock className="h-3.5 w-3.5" />}
                    placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                    value={wpAppPassword}
                    onChange={(e) => onChange({ wpAppPassword: e.target.value })}
                  />
                </>
              ) : (
                <Input
                  label={PLATFORM_API_LABEL[platform]}
                  type="password"
                  icon={<Lock className="h-3.5 w-3.5" />}
                  placeholder="Paste your API key here"
                  value={apiKey}
                  onChange={(e) => onChange({ apiKey: e.target.value })}
                  hint="This platform's integration is currently simulated — no real API calls are made yet."
                />
              )}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-error-light)] px-3 py-2 text-sm text-[var(--color-error)]">
            {error}
          </p>
        )}

        {isConnecting && <VerifyingPanel />}

        <div className="flex flex-col items-center justify-between gap-3 border-t border-[var(--color-border)] pt-5 sm:flex-row">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <ShieldCheck className="h-4 w-4 text-[var(--color-success)]" />
            <span>Read-only access · credentials encrypted at rest</span>
          </div>

          <Button
            onClick={onConnect}
            disabled={!canConnect}
            loading={isConnecting}
            size="lg"
            className="w-full sm:w-auto"
          >
            <Plug className="h-4 w-4" />
            {isConnecting ? "Connecting…" : "Connect & Authenticate Store"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PlatformTile({
  platform,
  selected,
  onSelect,
}: {
  platform: StorePlatform;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = PLATFORM_META[platform];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex flex-col justify-between gap-3 rounded-[var(--radius-xl)] border p-4 text-left transition-all",
        selected
          ? "border-[var(--color-brand)] bg-[var(--color-brand-light)] ring-2 ring-[var(--color-brand)]/30"
          : "border-[var(--color-border)] bg-[var(--color-surface-base)] hover:border-[var(--color-border-strong)]"
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full gradient-brand">
          <Check className="h-2.5 w-2.5 text-white" />
        </span>
      )}

      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-surface-elevated)] text-base">
        {meta.emoji}
      </span>

      <div>
        <p className="text-sm font-bold text-[var(--color-text-primary)]">
          {PLATFORM_LABELS[platform]}
        </p>
        <p className="mt-0.5 text-[11px] leading-tight text-[var(--color-text-muted)]">
          {meta.description}
        </p>
      </div>

      <span
        className={cn(
          "w-fit rounded px-2 py-0.5 text-[10px] font-semibold",
          PILL_TONE_CLASSES[meta.pillTone]
        )}
      >
        {meta.pillLabel}
      </span>
    </button>
  );
}

/**
 * Purely cosmetic — Persona's connect call is one real request with no granular server progress.
 * This cycles through generic status lines on a timer so the wait doesn't feel dead, and unmounts
 * the moment `isConnecting` flips back to false, whether the real call succeeded or failed.
 */
function VerifyingPanel() {
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % VERIFY_STEPS.length), 900);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-1.5 rounded-[var(--radius-lg)] border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-brand-strong)]">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Verifying store connection &amp; scanning catalog…</span>
      </div>
      <p className="text-xs text-[var(--color-text-secondary)]">{VERIFY_STEPS[step]}</p>
    </div>
  );
}
