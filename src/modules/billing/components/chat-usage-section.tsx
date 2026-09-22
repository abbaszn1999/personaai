"use client";

import { Coins, Gauge, MessageCircle } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { MetricCard } from "@/components/ui/metric-card";
import { useBilling } from "../hooks/use-billing";

export function ChatUsageSection() {
  const { summary, loading: usageLoading } = useBilling();
  const sessions = summary?.sessions;
  const includedRemaining = sessions?.includedRemaining ?? 0;
  const unitsBalance = sessions?.unitsBalance ?? 0;

  return (
    <SettingsSection
      title="Conversational Chat"
      description="Chat and catalog search for this cycle, in session units. One search is one unit. Conversation adds up until it completes a unit."
      icon={<MessageCircle className="h-4 w-4" />}
      accent="violet"
    >
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Used This Cycle"
            value={usageLoading ? "—" : (sessions?.usedThisCycle ?? 0).toLocaleString()}
            sub={`Of ${(sessions?.includedAllowance ?? 0).toLocaleString()} included this cycle`}
            icon={<MessageCircle className="h-4 w-4" />}
            accent="violet"
          />
          <MetricCard
            label="Included Remaining"
            value={usageLoading ? "—" : includedRemaining.toLocaleString()}
            sub="Resets at the end of the cycle"
            icon={<Gauge className="h-4 w-4" />}
            accent="violet"
          />
          <MetricCard
            label="Purchased Balance"
            value={usageLoading ? "—" : unitsBalance.toLocaleString()}
            sub="Used after the included allowance"
            icon={<Coins className="h-4 w-4" />}
            accent="ember"
          />
        </div>
      </div>
    </SettingsSection>
  );
}
