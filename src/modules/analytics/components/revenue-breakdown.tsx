import type { WorkspaceAnalyticsPayload } from "../types";
import { formatUsdCents } from "./stat-card";

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className={strong ? "text-sm font-semibold text-[var(--color-text-primary)]" : "text-sm text-[var(--color-text-secondary)]"}>{label}</p>
        {hint && <p className="text-[11px] text-[var(--color-text-muted)]">{hint}</p>}
      </div>
      <span className={strong ? "text-sm font-bold text-[var(--color-text-primary)]" : "text-sm font-semibold text-[var(--color-text-primary)]"}>
        {value}
      </span>
    </div>
  );
}

/** Gross to net, what the 3% applies to, and how each sale was matched. */
export function RevenueBreakdown({ payload }: { payload: WorkspaceAnalyticsPayload | null }) {
  const sales = payload?.sales;
  if (!sales) return <div className="card-base h-72 animate-pulse" />;

  const tagged = sales.byMethod.line_tag;
  const device = sales.byMethod.device_match;
  const matchedOrders = tagged.orders + device.orders;
  const taggedShare = matchedOrders > 0 ? Math.round((tagged.orders / matchedOrders) * 100) : 0;

  return (
    <div className="card-base p-5 flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Sales breakdown</h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">USD, converted at each order&apos;s daily rate</p>
      </div>

      <div className="divide-y divide-[var(--color-border)]">
        <Row label="Gross sales" value={formatUsdCents(sales.grossUsdCents)} />
        <Row
          label="Refunds"
          value={sales.refundsUsdCents > 0 ? `−${formatUsdCents(sales.refundsUsdCents)}` : formatUsdCents(0)}
          hint={sales.grossUsdCents > 0 ? `${sales.refundRate}% of gross` : undefined}
        />
        <Row label="Net Persona sales" value={formatUsdCents(sales.netUsdCents)} strong />
        <Row
          label="3% commission"
          value={formatUsdCents(sales.commissionUsdCents)}
          hint={`On ${formatUsdCents(Math.max(0, sales.billableNetUsdCents))} of Main plan sales`}
        />
        {sales.unbilledNetUsdCents !== 0 && (
          <Row label="Trial sales" value={formatUsdCents(sales.unbilledNetUsdCents)} hint="No commission on the Trial plan" />
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--color-text-secondary)]">How orders were matched</span>
          <span className="text-[var(--color-text-muted)]">{matchedOrders.toLocaleString()} orders</span>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-base)]">
          {matchedOrders > 0 && (
            <>
              <div className="gradient-brand" style={{ width: `${taggedShare}%` }} />
              <div className="gradient-violet" style={{ width: `${100 - taggedShare}%` }} />
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-base)] px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
              <span className="h-2 w-2 rounded-full gradient-brand" /> Tagged cart line
            </p>
            <p className="mt-0.5 font-semibold text-[var(--color-text-primary)]">
              {tagged.orders.toLocaleString()} · {formatUsdCents(tagged.netUsdCents)}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-base)] px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
              <span className="h-2 w-2 rounded-full gradient-violet" /> Same device, 7 days
            </p>
            <p className="mt-0.5 font-semibold text-[var(--color-text-primary)]">
              {device.orders.toLocaleString()} · {formatUsdCents(device.netUsdCents)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
