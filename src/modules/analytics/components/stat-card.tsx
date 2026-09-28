import type { ReactNode } from "react";
import { changePercent } from "@/lib/billing/usage-report";

export function formatUsdCents(cents: number, options: { compact?: boolean } = {}): string {
  const dollars = cents / 100;
  if (options.compact && Math.abs(dollars) >= 10_000) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(dollars);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Math.abs(dollars) >= 1000 ? 0 : 2,
    maximumFractionDigits: Math.abs(dollars) >= 1000 ? 0 : 2,
  }).format(dollars);
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

/** Percent change against the previous window, matching the Usage page wording. */
export function Delta({ current, previous }: { current: number; previous: number }) {
  const value = changePercent(current, previous);
  if (value === null) return <span className="text-xs text-[var(--color-text-muted)]">No prior period</span>;
  const rounded = Math.round(value);
  const word = rounded > 0 ? "Up" : rounded < 0 ? "Down" : "Flat";
  const tone = rounded > 0 ? "text-[var(--color-success)]" : rounded < 0 ? "text-[var(--color-error)]" : "text-[var(--color-text-muted)]";
  return (
    <span className="text-xs text-[var(--color-text-muted)]">
      <span className={tone}>
        {word} {Math.abs(rounded)}%
      </span>{" "}
      vs previous period
    </span>
  );
}

/** A rate against a rate, shown as percentage points. */
export function PointDelta({ current, previous }: { current: number; previous: number }) {
  const diff = Math.round((current - previous) * 10) / 10;
  if (previous === 0 && current === 0) return <span className="text-xs text-[var(--color-text-muted)]">No prior period</span>;
  const tone = diff > 0 ? "text-[var(--color-success)]" : diff < 0 ? "text-[var(--color-error)]" : "text-[var(--color-text-muted)]";
  return (
    <span className="text-xs text-[var(--color-text-muted)]">
      <span className={tone}>
        {diff > 0 ? "+" : diff < 0 ? "−" : ""}
        {Math.abs(diff)} pts
      </span>{" "}
      vs previous period
    </span>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <span className="text-xs text-[var(--color-text-muted)]">{children}</span>;
}

export function StatCard({ label, value, detail, emphasis }: { label: string; value: string; detail: ReactNode; emphasis?: boolean }) {
  return (
    <div className={emphasis ? "card-base p-5 flex flex-col gap-2 ring-1 ring-[var(--color-brand)]/30" : "card-base p-5 flex flex-col gap-2"}>
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <span className="text-2xl font-display font-extrabold text-[var(--color-text-primary)] tracking-tight">{value}</span>
      <div>{detail}</div>
    </div>
  );
}

export function StatRowSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card-base h-28 animate-pulse" />
      ))}
    </div>
  );
}

export function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
      {description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{description}</p>}
    </div>
  );
}
