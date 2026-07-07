"use client";

import { AlertTriangle, Coins } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { CreditBundleCard } from "./credit-bundle-card";
import { useBilling } from "../hooks/use-billing";
import { CREDIT_BUNDLES } from "../constants";

export function CreditBundlesSection() {
  const { isOverCap, lastPurchasedBundleId, purchaseBundle } = useBilling();

  return (
    <SettingsSection
      title="On-Demand Overage Bundles"
      description="Load extra credits any time you pass your monthly render allocation"
      icon={<Coins className="h-4 w-4" />}
      accent="unwearable"
    >
      {isOverCap && (
        <div className="flex items-center gap-2.5 rounded-[var(--radius-lg)] bg-[var(--color-warning-light)] px-4 py-3 mb-4">
          <AlertTriangle className="h-4 w-4 text-[var(--color-warning)] shrink-0" />
          <p className="text-sm text-[var(--color-warning)]">
            You&apos;ve used your full monthly allocation — top up credits below to keep generating renders.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {CREDIT_BUNDLES.map((bundle) => (
          <CreditBundleCard
            key={bundle.id}
            bundle={bundle}
            justPurchased={lastPurchasedBundleId === bundle.id}
            onBuy={() => purchaseBundle(bundle.id)}
          />
        ))}
      </div>
    </SettingsSection>
  );
}
