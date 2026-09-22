"use client";

import { ImageIcon, Radio, Gauge } from "lucide-react";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { SettingsSection } from "@/components/ui/settings-section";
import { EmptyState } from "@/components/ui/empty-state";
import { UsageSummaryCards } from "./usage-summary-cards";
import { UsageChart } from "./usage-chart";
import { LiveTryOnUsageSummaryCards } from "./live-tryon-usage-summary-cards";
import { LiveTryOnUsageChart } from "./live-tryon-usage-chart";
import { ChatUsageSection } from "./chat-usage-section";
import { useWorkspaceStore } from "@/modules/workspaces/store";
import { BillingProvider } from "../hooks/use-billing";

export function UsageDashboard() {
  const activeWorkspace = useWorkspaceStore((s) => s.workspace);

  if (!activeWorkspace) {
    return (
      <>
        <DashboardPageHeader title="Usage" description="Track account usage against your plan" />
        <div className="p-6">
          <EmptyState
            icon={<Gauge className="h-6 w-6" />}
            title="No project yet"
            description="Create a project to start tracking real usage."
          />
        </div>
      </>
    );
  }

  return (
    <BillingProvider workspaceId={activeWorkspace.id}>
      <UsageDashboardContent />
    </BillingProvider>
  );
}

function UsageDashboardContent() {
  return (
    <>
      <DashboardPageHeader
        title="Usage"
        description="Track image generation, live try-on, and session usage against your plan"
      />
      <div className="p-6 space-y-6">
        <SettingsSection
          title="Image Generation"
          description="Managed natively by Autommerce — metered against your plan and credits"
          icon={<ImageIcon className="h-4 w-4" />}
          accent="ember"
        >
          <div className="space-y-6">
            <UsageSummaryCards />
            <UsageChart />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Live Camera Try-On"
          description="Realtime video preview (Decart) — metered in seconds against your plan and credits"
          icon={<Radio className="h-4 w-4" />}
          accent="violet"
        >
          <div className="space-y-6">
            <LiveTryOnUsageSummaryCards />
            <LiveTryOnUsageChart />
          </div>
        </SettingsSection>

        <ChatUsageSection />
      </div>
    </>
  );
}
