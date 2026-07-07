"use client";

import Link from "next/link";
import { CreditCard, Crown, ImageIcon, ArrowRight } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Button } from "@/components/ui/button";
import { PlansSection } from "@/modules/billing/components/plans-section";
import { CreditBundlesSection } from "@/modules/billing/components/credit-bundles-section";
import { useBilling } from "@/modules/billing/hooks/use-billing";
import { MONTHLY_INCLUDED_RENDERS } from "@/modules/billing/constants";

export function BillingSettings() {
  const { activeTier, rendersUsed } = useBilling();

  return (
    <div className="space-y-6">
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
                {activeTier.name} — Active
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {activeTier.priceLabel}{activeTier.priceSub}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <ImageIcon className="h-3.5 w-3.5" />
              {rendersUsed.toLocaleString()} / {MONTHLY_INCLUDED_RENDERS.toLocaleString()} images this cycle
            </div>
            <Link href="/usage">
              <Button variant="secondary" size="sm">
                View Usage
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </SettingsSection>

      <PlansSection />
      <CreditBundlesSection />
    </div>
  );
}
