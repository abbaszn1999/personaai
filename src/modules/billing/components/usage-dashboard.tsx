"use client";

import { ImageIcon } from "lucide-react";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { SettingsSection } from "@/components/ui/settings-section";
import { UsageSummaryCards } from "./usage-summary-cards";
import { UsageChart } from "./usage-chart";
import { ChatUsageSection } from "./chat-usage-section";

export function UsageDashboard() {
  return (
    <>
      <DashboardPageHeader
        title="Usage"
        description="Track image generation usage and remaining credit on your account"
      />
      <div className="p-6 space-y-6">
        <SettingsSection
          title="Image Generation"
          description="Managed natively by Autommerce — metered against your plan and credits"
          icon={<ImageIcon className="h-4 w-4" />}
          accent="unwearable"
        >
          <div className="space-y-6">
            <UsageSummaryCards />
            <UsageChart />
          </div>
        </SettingsSection>

        <ChatUsageSection />
      </div>
    </>
  );
}
