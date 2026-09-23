"use client";

import * as React from "react";
import { SettingsCard, SettingsRow } from "@/components/ui/settings-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { useBilling } from "../hooks/use-billing";
import type { BillingSummary } from "../types";

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function SpendCapSection() {
  const { summary } = useBilling();
  if (!summary) return <div className="card-base h-56 animate-pulse" />;
  return <SpendCapForm key={`${summary.overageCapCents}:${summary.usageAlerts}`} summary={summary} />;
}

function SpendCapForm({ summary }: { summary: BillingSummary }) {
  const { saveSpendCap, pendingAction } = useBilling();
  const [dollars, setDollars] = React.useState(
    summary.overageCapCents == null ? "" : (summary.overageCapCents / 100).toString()
  );
  const [alerts, setAlerts] = React.useState(summary.usageAlerts);

  const parsed = dollars.trim() === "" ? null : Number(dollars);
  const capCents = parsed == null ? null : Math.round(parsed * 100);
  const valid = capCents == null || (Number.isFinite(capCents) && capCents >= 0 && capCents <= 10_000_000);
  const dirty = capCents !== summary.overageCapCents || alerts !== summary.usageAlerts;

  return (
    <SettingsCard
      title="Spend limit & alerts"
      description="One limit for extra spend across sessions, live minutes, and garments. Leave it empty for no limit."
      footer={`Extra spend this cycle: ${usd(summary.overageCents)}. Each wallet can run 5% past its included amount before new usage stops.`}
      action={
        <Button
          size="sm"
          onClick={() => void saveSpendCap(capCents, alerts)}
          loading={pendingAction === "spend-cap"}
          disabled={pendingAction !== null || !valid || !dirty}
        >
          Save
        </Button>
      }
    >
      <div className="divide-y divide-[var(--color-border)]">
        <SettingsRow title="Limit per billing cycle" description="New usage stops once extra spend reaches this amount.">
          <label
            className={cn(
              "flex h-9 items-center rounded-[var(--radius-md)] border bg-[var(--color-surface-card)] focus-within:border-[var(--color-brand)]",
              valid ? "border-[var(--color-border)]" : "border-[var(--color-error)]"
            )}
          >
            <span className="pl-3 text-sm text-[var(--color-text-muted)]">$</span>
            <input
              type="number"
              aria-label="Spend limit per billing cycle in dollars"
              min={0}
              step={1}
              placeholder="No limit"
              value={dollars}
              onChange={(event) => setDollars(event.target.value)}
              className="h-full w-32 bg-transparent px-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
            />
          </label>
        </SettingsRow>
        <SettingsRow title="Usage alerts" description="Email me when a wallet reaches 80% and 100% of its included amount.">
          <button
            type="button"
            role="switch"
            aria-checked={alerts}
            aria-label="Usage alerts"
            onClick={() => setAlerts((value) => !value)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors",
              alerts ? "bg-[var(--color-brand)]" : "bg-[var(--color-border-strong)]"
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                alerts ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </SettingsRow>
      </div>
    </SettingsCard>
  );
}
