"use client";

import { ImageIcon, Gauge, Coins, Crown } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { useBilling } from "../hooks/use-billing";
import { MONTHLY_INCLUDED_RENDERS } from "../constants";

export function UsageSummaryCards() {
  const { activeTier, rendersUsed, rendersRemaining, overageCredits } = useBilling();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        label="Images Created"
        value={rendersUsed.toLocaleString()}
        sub={`API calls this cycle, of ${MONTHLY_INCLUDED_RENDERS.toLocaleString()} included`}
        icon={<ImageIcon className="h-4 w-4" />}
        accent="unwearable"
      />
      <MetricCard
        label="Plan Renders Remaining"
        value={rendersRemaining.toLocaleString()}
        sub="Resets next billing cycle"
        icon={<Gauge className="h-4 w-4" />}
        accent="wearable"
      />
      <MetricCard
        label="Remaining Credit"
        value={overageCredits.toLocaleString()}
        sub={overageCredits > 0 ? "Overage credits available" : "No top-up credit purchased"}
        icon={<Coins className="h-4 w-4" />}
        accent="success"
      />
      <MetricCard
        label="Current Plan"
        value={activeTier.name.replace(" Tier", "").replace(" Platform", "").replace(" Performance", "")}
        sub={activeTier.priceLabel + activeTier.priceSub}
        icon={<Crown className="h-4 w-4" />}
        accent="brand"
      />
    </div>
  );
}
