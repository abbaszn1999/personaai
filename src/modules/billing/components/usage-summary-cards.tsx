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
          sub={`Of ${(images?.includedAllowance ?? activeTier.monthlyRenders).toLocaleString()} included this cycle`}
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
      {!loading && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <Coins className="h-3.5 w-3.5" />
          Breakdown: {includedRemaining.toLocaleString()} left from your plan (resets next cycle)
          {creditsBalance > 0 ? ` + ${creditsBalance.toLocaleString()} purchased credits (never expire)` : ""}
        </p>
      )}
    </div>
  );
}
