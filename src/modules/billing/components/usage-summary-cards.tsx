"use client";

import { ImageIcon, Gauge, Coins, Crown } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { useBilling } from "../hooks/use-billing";

export function UsageSummaryCards() {
  const { activeTier, summary, loading } = useBilling();
  const images = summary?.images;
  const includedRemaining = images?.includedRemaining ?? 0;
  const creditsBalance = images?.creditsBalance ?? 0;
  const totalRemaining = includedRemaining + creditsBalance;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Total Images Remaining"
          value={loading ? "—" : totalRemaining.toLocaleString()}
          sub="Available to use right now"
          icon={<Gauge className="h-4 w-4" />}
          accent="violet"
        />
        <MetricCard
          label="Used This Cycle"
          value={loading ? "—" : (images?.usedThisCycle ?? 0).toLocaleString()}
          sub={`Of ${(images?.includedAllowance ?? activeTier.monthlyGarmentUnits).toLocaleString()} included this cycle`}
          icon={<ImageIcon className="h-4 w-4" />}
          accent="ember"
        />
        <MetricCard
          label="Current Plan"
          value={activeTier.name.replace(" Tier", "").replace(" Platform", "").replace(" Performance", "")}
          sub={activeTier.priceLabel + activeTier.priceSub}
          icon={<Crown className="h-4 w-4" />}
          accent="brand"
        />
      </div>
      {!loading && summary && (
        <div className="space-y-1 text-xs text-[var(--color-text-muted)]">
          <p className="flex items-center gap-1.5">
            <Coins className="h-3.5 w-3.5" />
            Garments: {includedRemaining.toLocaleString()} included left
            {creditsBalance > 0 ? ` + ${creditsBalance.toLocaleString()} purchased` : ""}.{" "}
            {summary.images.dailyBurn.toLocaleString()} units/day, projected{" "}
            {Math.round(summary.images.projectedCycleTotal).toLocaleString()} this cycle.
          </p>
          <p>
            Sessions: {summary.sessions.includedRemaining.toLocaleString()} included left
            {summary.sessions.unitsBalance > 0 ? ` + ${summary.sessions.unitsBalance.toLocaleString()} purchased` : ""}.{" "}
            {summary.sessions.dailyBurn.toLocaleString()} units/day, projected{" "}
            {Math.round(summary.sessions.projectedCycleTotal).toLocaleString()} this cycle.
          </p>
          <p>
            Live: {Math.floor(summary.liveTryOn.includedRemainingSeconds / 60)} included minutes left
            {summary.liveTryOn.purchasedSecondsBalance > 0
              ? ` + ${Math.floor(summary.liveTryOn.purchasedSecondsBalance / 60)} purchased`
              : ""}
            . {summary.liveTryOn.dailyBurn.toLocaleString()} min/day, projected{" "}
            {Math.round(summary.liveTryOn.projectedCycleTotal).toLocaleString()} this cycle.
          </p>
        </div>
      )}
    </div>
  );
}
