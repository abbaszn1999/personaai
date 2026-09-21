"use client";

import { MessageCircle } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { MetricCard } from "@/components/ui/metric-card";
import { useBilling } from "../hooks/use-billing";

export function ChatUsageSection() {
  const { summary, loading: usageLoading } = useBilling();

  return (
    <SettingsSection
      title="Conversational Chat"
      description="Chat volume for this billing cycle"
      icon={<MessageCircle className="h-4 w-4" />}
      accent="wearable"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MetricCard
          label="Messages Sent This Cycle"
          value={usageLoading ? "—" : (summary?.chatMessagesThisCycle ?? 0).toLocaleString()}
          icon={<MessageCircle className="h-4 w-4" />}
          accent="wearable"
        />
      </div>
    </SettingsSection>
  );
}
