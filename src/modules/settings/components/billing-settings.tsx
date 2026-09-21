"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Crown, ImageIcon, ArrowRight } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PlansSection } from "@/modules/billing/components/plans-section";
import { CreditBundlesSection } from "@/modules/billing/components/credit-bundles-section";
import { BuyLiveMinutesSection } from "@/modules/billing/components/buy-live-minutes-section";
import { BillingProvider, useBilling } from "@/modules/billing/hooks/use-billing";
import { useWorkspaceStore } from "@/modules/workspaces/store";

export function BillingSettings() {
  const router = useRouter();
  const activeWorkspace = useWorkspaceStore((s) => s.workspace);

  if (!activeWorkspace) {
    return (
      <EmptyState
        icon={<Crown className="h-6 w-6" />}
        title="No project yet"
        description="Create your project to unlock billing plans and credits."
        action={{ label: "Create Project", onClick: () => router.push("/setup") }}
      />
    );
  }

  return (
    <BillingProvider workspaceId={activeWorkspace.id}>
      <BillingSettingsContent />
    </BillingProvider>
  );
}

function BillingSettingsContent() {
  const {
    activeTier,
    summary,
    loading,
    pendingAction,
    checkoutNotice,
    openBillingPortal,
  } = useBilling();
  const billing = summary?.billing;
  const statusLabel =
    billing?.accessMode === "legacy_test"
      ? "Legacy test access"
      : billing?.entitlementStatus === "past_due_grace"
        ? "Payment overdue — grace period"
        : billing?.entitled
          ? billing.cancelAtPeriodEnd
            ? "Cancels at period end"
            : "Active"
          : "Subscription required";

  return (
    <div className="space-y-6">
      {checkoutNotice && (
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] px-5 py-3 text-sm text-[var(--color-text-primary)]">
          {checkoutNotice}
        </div>
      )}
      <SettingsSection
        title="Billing"
        description="Manage your subscription plan and payment details"
        icon={<CreditCard className="h-4 w-4" />}
        accent="brand"
      >
        <div className="flex items-center justify-between rounded-[var(--radius-xl)] bg-[var(--color-brand-light)] border border-[var(--color-brand)]/30 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-[var(--color-brand)]/15 flex items-center justify-center">
              <Crown className="h-5 w-5 text-[var(--color-brand)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                {activeTier.name} — {statusLabel}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {activeTier.priceLabel}{activeTier.priceSub}
                {billing?.currentPeriodEnd
                  ? ` · ${billing.cancelAtPeriodEnd ? "Access until" : "Renews"} ${new Date(billing.currentPeriodEnd).toLocaleDateString()}`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <ImageIcon className="h-3.5 w-3.5" />
              {loading ? "Loading usage…" : `${(summary?.images.usedThisCycle ?? 0).toLocaleString()} / ${(summary?.images.includedAllowance ?? activeTier.monthlyRenders).toLocaleString()} images this cycle`}
            </div>
            <Link href="/usage">
              <Button variant="secondary" size="sm">
                View Usage
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
            {billing?.hasStripeCustomer && (
              <Button
                variant="secondary"
                size="sm"
                loading={pendingAction === "portal"}
                disabled={pendingAction !== null}
                onClick={() => void openBillingPortal()}
              >
                Manage Billing
              </Button>
            )}
          </div>
        </div>
      </SettingsSection>

      <PlansSection />
      <CreditBundlesSection />
      <BuyLiveMinutesSection />
    </div>
  );
}
