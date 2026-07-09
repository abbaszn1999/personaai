"use client";

import * as React from "react";
import { Check, Plug } from "lucide-react";
import type { StorePlatform } from "@/modules/store/types";
import { PLATFORM_LABELS } from "@/modules/store/constants";
import { PLATFORM_API_LABEL } from "../mocks/connections";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const PLATFORMS: { id: StorePlatform; emoji: string; description: string }[] = [
  { id: "shopify",     emoji: "🛍️", description: "Connect via Admin API key" },
  { id: "wordpress",   emoji: "📝", description: "Connect via Application Password" },
  { id: "custom",      emoji: "⚙️", description: "Any headless or custom store" },
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
    <div className="space-y-5">
      {/* Platform picker */}
      <div>
        <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
          Select Platform
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PLATFORMS.map((p) => {
            const selected = platform === p.id;
            return (
              <button
                key={p.id}
                onClick={() =>
                  onChange({
                    platform: p.id,
                    storeUrl: "",
                    apiKey: "",
                    clientId: "",
                    clientSecret: "",
                    wpUsername: "",
                    wpAppPassword: "",
                  })
                }
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-[var(--radius-xl)] border p-3 text-center transition-all duration-150 relative",
                  selected
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-light)] ring-2 ring-[var(--color-brand)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-card)] hover:border-[var(--color-brand)]"
                )}
              >
                {selected && (
                  <span className="absolute top-2 right-2 h-4 w-4 rounded-full gradient-brand flex items-center justify-center">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </span>
                )}
                <span className="text-xl">{p.emoji}</span>
                <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                  {PLATFORM_LABELS[p.id]}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)] leading-tight">
                  {p.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Credentials */}
      {platform && (
        <div className="space-y-3 animate-fade-in">
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
                hint="Create a Custom app for your store in the Shopify Dev Dashboard (Settings → Client credentials), grant it the read_products scope, and install it on your store — then paste its Client ID and Client Secret here. Verified live and stored encrypted."
              />
              <Input
                label="Client Secret"
                type="password"
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
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                value={wpAppPassword}
                onChange={(e) => onChange({ wpAppPassword: e.target.value })}
              />
            </>
          ) : (
            <Input
              label={PLATFORM_API_LABEL[platform]}
              type="password"
              placeholder="Paste your API key here"
              value={apiKey}
              onChange={(e) => onChange({ apiKey: e.target.value })}
              hint="This platform's integration is currently simulated — no real API calls are made yet."
            />
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] rounded-[var(--radius-md)] px-3 py-2">
          {error}
        </p>
      )}

      <Button
        onClick={onConnect}
        disabled={!canConnect}
        loading={isConnecting}
        size="lg"
        className="w-full"
      >
        <Plug className="h-4 w-4" />
        {isConnecting ? "Connecting…" : "Connect Store"}
      </Button>
    </div>
  );
}
