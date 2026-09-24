import type { WorkspaceAnalyticsPayload } from "../types";
import { Delta, Hint, PointDelta, StatCard, StatRowSkeleton, formatUsdCents } from "./stat-card";

interface RevenueKpiRowProps {
  payload: WorkspaceAnalyticsPayload | null;
  loading: boolean;
}

/** Sales Persona drove, in USD after refunds, and what they returned against what was paid. */
export function RevenueKpiRow({ payload, loading }: RevenueKpiRowProps) {
  if (!payload) {
    return loading ? <StatRowSkeleton count={5} /> : null;
  }
  const sales = payload.sales;
  const previous = sales.previous;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      <StatCard
        emphasis
        label="Persona sales"
        value={formatUsdCents(sales.netUsdCents, { compact: true })}
        detail={<Delta current={sales.netUsdCents} previous={previous.netUsdCents} />}
      />
      <StatCard
        label="Orders"
        value={sales.orders.toLocaleString()}
        detail={<Delta current={sales.orders} previous={previous.orders} />}
      />
      <StatCard
        label="Order conversion"
        value={`${sales.conversionRate}%`}
        detail={<PointDelta current={sales.conversionRate} previous={previous.conversionRate} />}
      />
      <StatCard
        label="Avg. order value"
        value={sales.orders > 0 ? formatUsdCents(sales.avgOrderUsdCents) : "—"}
        detail={
          sales.orders > 0 && previous.orders > 0 ? (
            <Delta current={sales.avgOrderUsdCents} previous={previous.avgOrderUsdCents} />
          ) : (
            <Hint>Persona sales before refunds, per order</Hint>
          )
        }
      />
      <StatCard
        label="Return on Persona"
        value={sales.roi === null ? "—" : `${sales.roi.toLocaleString()}x`}
        detail={
          <Hint>
            {sales.spendUsdCents === null
              ? "Payments could not be loaded"
              : sales.spendUsdCents === 0
                ? "No payments to Persona in this range"
                : `Sales for ${formatUsdCents(sales.spendUsdCents)} paid to Persona`}
          </Hint>
        }
      />
    </div>
  );
}
