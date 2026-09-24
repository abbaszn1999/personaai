import type { WorkspaceAnalyticsPayload } from "../types";
import { Hint, StatCard, formatMoney } from "./stat-card";

interface KpiRowProps {
  payload: WorkspaceAnalyticsPayload | null;
  loading: boolean;
}

function Trend({ value, unit = "%" }: { value: number; unit?: "%" | " pts" }) {
  const rounded = Math.round(value * 10) / 10;
  const tone = rounded > 0 ? "text-[var(--color-success)]" : rounded < 0 ? "text-[var(--color-error)]" : "text-[var(--color-text-muted)]";
  const word = unit === "%" ? (rounded > 0 ? "Up " : rounded < 0 ? "Down " : "Flat ") : rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return (
    <span className="text-xs text-[var(--color-text-muted)]">
      <span className={tone}>
        {word}
        {Math.abs(unit === "%" ? Math.round(rounded) : rounded)}
        {unit}
      </span>{" "}
      vs previous period
    </span>
  );
}

/** Widget engagement: what shoppers did inside Persona before any order. Cart values stay in the
 *  store currency because they come straight from the cart. */
export function KpiRow({ payload, loading }: KpiRowProps) {
  if (!payload) {
    if (!loading) return null;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="card-base h-28 animate-pulse" />
        ))}
      </div>
    );
  }
  const kpis = payload.kpis;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <StatCard label="Widget sessions" value={kpis.sessions.toLocaleString()} detail={<Trend value={kpis.trends.sessions} />} />
      <StatCard label="Items added to cart" value={kpis.cartItemsAdded.toLocaleString()} detail={<Trend value={kpis.trends.cartItemsAdded} />} />
      <StatCard
        label="Cart value added"
        value={formatMoney(kpis.cartValueAdded, kpis.currency)}
        detail={
          kpis.cartItemsAdded > 0 ? (
            <Hint>{formatMoney(kpis.avgCartItemValue, kpis.currency)} per item added</Hint>
          ) : (
            <Trend value={kpis.trends.cartValueAdded} />
          )
        }
      />
      <StatCard label="Add-to-cart rate" value={`${kpis.addToCartRate}%`} detail={<Trend value={kpis.trends.addToCartRate} unit=" pts" />} />
    </div>
  );
}
