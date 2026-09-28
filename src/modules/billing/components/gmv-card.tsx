"use client";

import * as React from "react";
import { SettingsCard } from "@/components/ui/settings-card";

interface GmvOrder {
  orderName: string;
  productName: string;
  amountOriginal: number;
  currency: string;
  amountUsdCents: number;
  matchMethod: "line_tag" | "device_match";
  status: "billed" | "pending" | "trial";
  occurredAt: string;
}

interface GmvSummary {
  cycleGmvUsdCents: number;
  refundsUsdCents: number;
  openGmvUsdCents: number;
  expectedCommissionUsdCents: number;
  commissionDeferred: boolean;
  lastBilledCommissionUsdCents: number | null;
  orders: GmvOrder[];
}

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function original(amount: number, currency: string): string {
  try {
    return amount.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

const STATUS_LABEL = {
  billed: "Billed",
  pending: "Pending",
  trial: "Not billed on Trial",
} as const;

const MATCH_LABEL = {
  line_tag: "Line tag",
  device_match: "Device match",
} as const;

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-4 py-3">
      <p className="text-lg font-display font-extrabold text-[var(--color-text-primary)]">{value}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}

export function GmvCard() {
  const [summary, setSummary] = React.useState<GmvSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void fetch("/api/billing/gmv")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as GmvSummary & { error?: string };
        if (!res.ok) throw new Error(data.error || "Couldn't load Persona GMV.");
        if (!cancelled) setSummary(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load Persona GMV.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nextInvoice = !summary
    ? "—"
    : summary.expectedCommissionUsdCents > 0
      ? usd(summary.expectedCommissionUsdCents)
      : summary.commissionDeferred && summary.openGmvUsdCents > 0
        ? "Carries forward"
        : usd(0);

  return (
    <SettingsCard
      title="Persona GMV"
      description="Paid orders attributed to Persona. The 3% commission is added to the Main plan's renewal invoice."
    >
      {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure value={summary ? usd(summary.cycleGmvUsdCents) : "—"} label="GMV this cycle" />
        <Figure value={summary ? usd(summary.refundsUsdCents) : "—"} label="Refunds this cycle" />
        <Figure value={nextInvoice} label="Commission on the next invoice" />
        <Figure
          value={summary?.lastBilledCommissionUsdCents === null || !summary ? "—" : usd(summary.lastBilledCommissionUsdCents)}
          label="Last commission billed"
        />
      </div>
      {summary && summary.orders.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)]">No attributed orders yet.</p>
      )}
      {summary && summary.orders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
              <tr>
                <th className="py-2 pr-3 font-medium">Order</th>
                <th className="py-2 pr-3 font-medium">Product</th>
                <th className="py-2 pr-3 font-medium">Value</th>
                <th className="py-2 pr-3 font-medium">Attribution</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.orders.map((order) => (
                <tr key={`${order.orderName}-${order.productName}-${order.occurredAt}`} className="border-t border-[var(--color-border)]">
                  <td className="py-2 pr-3 font-medium text-[var(--color-text-primary)]">{order.orderName}</td>
                  <td className="py-2 pr-3 text-[var(--color-text-secondary)]">{order.productName}</td>
                  <td className="py-2 pr-3 text-[var(--color-text-secondary)]">
                    {original(order.amountOriginal, order.currency)}
                    <span className="text-[var(--color-text-muted)]"> · {usd(order.amountUsdCents)}</span>
                  </td>
                  <td className="py-2 pr-3 text-[var(--color-text-secondary)]">{MATCH_LABEL[order.matchMethod]}</td>
                  <td className="py-2 text-[var(--color-text-secondary)]">{STATUS_LABEL[order.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingsCard>
  );
}
