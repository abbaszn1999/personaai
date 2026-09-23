"use client";

import Link from "next/link";
import type { BillingSummary } from "@/modules/billing/types";

function Meter({
  label,
  usedLabel,
  allowanceLabel,
  ratio,
  projection,
  href,
}: {
  label: string;
  usedLabel: string;
  allowanceLabel: string;
  ratio: number;
  projection: string;
  href: string;
}) {
  const width = Math.max(0, Math.min(100, ratio * 100));
  const tone = ratio >= 1 ? "bg-[var(--color-error-solid)]" : ratio >= 0.8 ? "bg-amber-500" : "gradient-brand";
  return (
    <div className="card-base p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">{label}</span>
        <Link href={href} className="text-xs font-semibold text-[var(--color-brand-strong)] hover:underline">
          Top up
        </Link>
      </div>
      <div>
        <div className="text-lg font-display font-extrabold text-[var(--color-text-primary)]">{usedLabel}</div>
        <div className="text-xs text-[var(--color-text-muted)]">{allowanceLabel}</div>
      </div>
      <div className="h-2 rounded-full bg-[var(--color-surface-base)] overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">{projection}</p>
    </div>
  );
}

export function WalletMeters({ summary, loading }: { summary: BillingSummary | null; loading: boolean }) {
  if (loading && !summary) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="card-base h-36 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!summary) return null;
  const billingHref = "/settings?section=billing";
  const sessionRatio = summary.sessions.includedAllowance > 0 ? summary.sessions.usedThisCycle / summary.sessions.includedAllowance : 0;
  const garmentRatio = summary.images.includedAllowance > 0 ? summary.images.usedThisCycle / summary.images.includedAllowance : 0;
  const liveUsed = summary.liveTryOn.usedThisCycleSeconds / 60;
  const liveAllowance = summary.liveTryOn.includedAllowanceSeconds / 60;
  const liveRatio = liveAllowance > 0 ? liveUsed / liveAllowance : 0;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Current billing cycle</p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Meter
          label="Sessions"
          usedLabel={`${summary.sessions.usedThisCycle.toLocaleString()} used`}
          allowanceLabel={`of ${summary.sessions.includedAllowance.toLocaleString()} included${summary.sessions.unitsBalance > 0 ? ` · ${summary.sessions.unitsBalance.toLocaleString()} purchased` : ""}`}
          ratio={sessionRatio}
          projection={`Projected ${Math.round(summary.sessions.projectedCycleTotal).toLocaleString()} units`}
          href={billingHref}
        />
        <Meter
          label="Live minutes"
          usedLabel={`${liveUsed.toLocaleString(undefined, { maximumFractionDigits: 1 })} min used`}
          allowanceLabel={`of ${liveAllowance.toLocaleString()} included${summary.liveTryOn.purchasedSecondsBalance > 0 ? ` · ${Math.floor(summary.liveTryOn.purchasedSecondsBalance / 60).toLocaleString()} purchased` : ""}`}
          ratio={liveRatio}
          projection={`Projected ${Math.round(summary.liveTryOn.projectedCycleTotal).toLocaleString()} min`}
          href={billingHref}
        />
        <Meter
          label="Garments"
          usedLabel={`${summary.images.usedThisCycle.toLocaleString()} used`}
          allowanceLabel={`of ${summary.images.includedAllowance.toLocaleString()} included${summary.images.creditsBalance > 0 ? ` · ${summary.images.creditsBalance.toLocaleString()} purchased` : ""}`}
          ratio={garmentRatio}
          projection={`Projected ${Math.round(summary.images.projectedCycleTotal).toLocaleString()} units`}
          href={billingHref}
        />
      </div>
    </div>
  );
}

export function AccountStrip({ summary }: { summary: BillingSummary | null }) {
  if (!summary) return null;
  const cap = summary.overageCapCents;
  const overage = (summary.overageCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const capLabel = cap === null ? "No spend cap" : `Spend cap ${(cap / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}`;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-4 py-3 text-xs text-[var(--color-text-secondary)]">
      <span>{capLabel}</span>
      <span>Overage this cycle {overage}</span>
      <span>Usage alerts {summary.usageAlerts ? "on" : "off"}</span>
      <Link href="/settings?section=billing" className="font-semibold text-[var(--color-brand-strong)] hover:underline">
        Manage billing
      </Link>
    </div>
  );
}
