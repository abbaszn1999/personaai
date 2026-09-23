"use client";

import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/ui/settings-card";
import { PlanSummaryCard } from "@/modules/billing/components/plan-summary-card";
import { PlansSection } from "@/modules/billing/components/plans-section";
import { SpendCapSection } from "@/modules/billing/components/spend-cap-section";
import { WalletTopUpSection } from "@/modules/billing/components/wallet-top-up-section";
import { BillingProvider, useBilling } from "@/modules/billing/hooks/use-billing";
import { useWorkspaceStore } from "@/modules/workspaces/store";

export function BillingPage() {
  const router = useRouter();
  const workspace = useWorkspaceStore((state) => state.workspace);

  return (
    <>
      <DashboardPageHeader title="Billing" description="Your plan, extra balance, and spend limit" />
      {workspace ? (
        <BillingProvider workspaceId={workspace.id}>
          <BillingContent />
        </BillingProvider>
      ) : (
        <div className="p-6">
          <EmptyState
            icon={<CreditCard className="h-6 w-6" />}
            title="No project yet"
            description="Create your project to choose a plan."
            action={{ label: "Create project", onClick: () => router.push("/setup") }}
          />
        </div>
      )}
    </>
  );
}

function BillingContent() {
  const { checkoutNotice, error, pendingAction } = useBilling();
  return (
    <div className="p-6 space-y-6">
      {checkoutNotice && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] px-4 py-3 text-sm text-[var(--color-text-primary)]">
          {checkoutNotice}
        </div>
      )}
      {error && pendingAction === null && <FormError>{error}</FormError>}
      <PlanSummaryCard />
      <PlansSection />
      <WalletTopUpSection />
      <SpendCapSection />
    </div>
  );
}
