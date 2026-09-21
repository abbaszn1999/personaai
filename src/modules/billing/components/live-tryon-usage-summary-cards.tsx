"use client";

import { Radio, Gauge, Coins } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { useBilling } from "../hooks/use-billing";

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function LiveTryOnUsageSummaryCards() {
  const { summary, loading, activeTier } = useBilling();
  const live = summary?.liveTryOn;
  const includedRemaining = live?.includedRemainingSeconds ?? 0;
  const purchasedBalance = live?.purchasedSecondsBalance ?? 0;
  const totalRemaining = includedRemaining + purchasedBalance;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MetricCard
          label="Total Live Try-On Time Remaining"
          value={loading ? "—" : formatSeconds(totalRemaining)}
          sub="Available to use right now"
          icon={<Gauge className="h-4 w-4" />}
          accent="violet"
        />
        <MetricCard
          label="Used This Cycle"
          value={loading ? "—" : formatSeconds(live?.usedThisCycleSeconds ?? 0)}
          sub={`Of ${formatSeconds(live?.includedAllowanceSeconds ?? activeTier.monthlyLiveTryOnSeconds)} included this cycle`}
          icon={<Radio className="h-4 w-4" />}
          accent="ember"
        />
      </div>
      {!loading && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <Coins className="h-3.5 w-3.5" />
          Breakdown: {formatSeconds(includedRemaining)} left from your plan (resets next cycle)
          {purchasedBalance > 0 ? ` + ${formatSeconds(purchasedBalance)} purchased minutes (never expire)` : ""}
        </p>
      )}
    </div>
  );
}
