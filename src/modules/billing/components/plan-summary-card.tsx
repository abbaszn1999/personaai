"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SettingsCard, StatusBadge } from "@/components/ui/settings-card";
import { Button } from "@/components/ui/button";
import { useBilling } from "../hooks/use-billing";
import type { BillingSummary } from "../types";

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function status(billing: BillingSummary["billing"] | undefined): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (!billing) return { label: "Loading", tone: "neutral" };
  switch (billing.entitlementStatus) {
    case "legacy_test":
      return { label: "Legacy access", tone: "neutral" };
    case "trialing":
      return { label: "Trial", tone: "success" };
    case "active":
      return billing.cancelAtPeriodEnd ? { label: "Cancelling", tone: "warning" } : { label: "Active", tone: "success" };
    case "past_due_grace":
      return { label: "Payment overdue", tone: "warning" };
    case "past_due":
      return { label: "Past due", tone: "danger" };
    default:
      return { label: "No subscription", tone: "danger" };
  }
}

function Allowance({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-4 py-3">
      <p className="text-lg font-display font-extrabold text-[var(--color-text-primary)]">{value}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}

export function PlanSummaryCard() {
  const { activeTier, summary, loading, pendingAction, openBillingPortal } = useBilling();
  const billing = summary?.billing;
  const badge = status(billing);
  const periodEnd = formatDate(billing?.currentPeriodEnd ?? summary?.cycleEnd);
  const periodLine = !periodEnd
    ? null
    : billing?.cancelAtPeriodEnd
      ? `Access until ${periodEnd}`
      : activeTier.id === "trial"
        ? `Trial ends ${periodEnd}`
        : `Renews ${periodEnd}`;

  return (
    <SettingsCard
      title="Plan"
      description="What you pay and what each cycle includes."
      footer="Invoices, payment method, and cancellation are managed in Stripe."
      action={
        <>
          <Link href="/usage">
            <Button variant="secondary" size="sm">
              View usage
            </Button>
          </Link>
          {billing?.hasStripeCustomer && (
            <Button
              size="sm"
              loading={pendingAction === "portal"}
              disabled={pendingAction !== null}
              onClick={() => void openBillingPortal()}
            >
              Manage billing
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-display font-extrabold text-[var(--color-text-primary)]">{activeTier.name}</p>
            {!loading && <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
          </div>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {activeTier.priceLabel}
            <span className="text-[var(--color-text-muted)]">{activeTier.priceSub}</span>
          </p>
        </div>
        {periodLine && <p className="text-sm text-[var(--color-text-muted)]">{periodLine}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Allowance value={activeTier.monthlySessionUnits.toLocaleString()} label="Session units per cycle" />
        <Allowance value={(activeTier.monthlyLiveTryOnSeconds / 60).toLocaleString()} label="Live try-on minutes" />
        <Allowance value={activeTier.monthlyGarmentUnits.toLocaleString()} label="Garment units" />
      </div>
    </SettingsCard>
  );
}
