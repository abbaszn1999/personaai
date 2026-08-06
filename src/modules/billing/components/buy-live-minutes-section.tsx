"use client";

import * as React from "react";
import { Clock3 } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Button } from "@/components/ui/button";
import { useBilling } from "../hooks/use-billing";
import { LIVE_TRYON_PRICE_PER_MINUTE_CENTS } from "../constants";

export function BuyLiveMinutesSection() {
  const { summary, purchaseLiveMinutes, pendingAction, error } = useBilling();
  const isBuying = pendingAction === "live-minutes";
  const [minutes, setMinutes] = React.useState(10);
  const [purchased, setPurchased] = React.useState(false);
  const pricePerMinuteCents =
    summary?.liveTryOn.pricePerMinuteCents ?? LIVE_TRYON_PRICE_PER_MINUTE_CENTS;
  const total = (minutes * pricePerMinuteCents) / 100;

  async function buy() {
    setPurchased(false);
    const ok = await purchaseLiveMinutes(minutes);
    if (ok) setPurchased(true);
  }

  return (
    <SettingsSection
      title="Additional Live Try-On Minutes"
      description="Choose exactly how many extra realtime camera minutes you need"
      icon={<Clock3 className="h-4 w-4" />}
      accent="wearable"
    >
      <div className="max-w-xl space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">Minutes to add</span>
            <input
              type="number"
              min={1}
              max={10_000}
              step={1}
              value={minutes}
              onChange={(event) => {
                setPurchased(false);
                const next = Number.parseInt(event.target.value, 10);
                setMinutes(Number.isFinite(next) ? Math.min(10_000, Math.max(1, next)) : 1);
              }}
              className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
            />
          </label>
          <Button onClick={buy} loading={isBuying} disabled={pendingAction !== null || minutes < 1}>
            {purchased ? "Minutes Added" : `Add ${minutes} min — $${total.toFixed(2)}`}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] bg-[var(--color-surface-base)] px-4 py-3 text-xs">
          <span className="text-[var(--color-text-muted)]">
            ${(pricePerMinuteCents / 100).toFixed(2)} per minute
          </span>
          <span className="font-semibold text-[var(--color-text-primary)]">
            Current purchased balance: {Math.floor((summary?.liveTryOn.purchasedSecondsBalance ?? 0) / 60)} min
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          Secure checkout is handled by Stripe. Minutes are added only after payment is confirmed.
        </p>
        {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
      </div>
    </SettingsSection>
  );
}
