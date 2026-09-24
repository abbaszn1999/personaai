import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { OrderTrackingStatus } from "../types";

const COPY: Partial<Record<OrderTrackingStatus, { title: string; body: string }>> = {
  missing: {
    title: "Order tracking is off",
    body: "Persona could not register order webhooks, so sales stay at zero. On the Store page, choose Turn on order tracking again.",
  },
  unknown: {
    title: "Order tracking hasn't been checked",
    body: "Open Store and choose Turn on order tracking. This notice stays until that succeeds.",
  },
  not_connected: {
    title: "No store connected",
    body: "Connect your store so Persona can count the orders it drives.",
  },
};

export function OrderTrackingBanner({ status }: { status: OrderTrackingStatus }) {
  const copy = COPY[status];
  if (!copy) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-warning,#f59e0b)]/40 bg-[var(--color-warning,#f59e0b)]/10 px-4 py-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--color-warning,#f59e0b)]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{copy.title}</p>
        <p className="text-xs text-[var(--color-text-secondary)]">{copy.body}</p>
      </div>
      <Link
        href="/store"
        className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 text-xs font-semibold text-[var(--color-text-primary)]"
      >
        Open Store
      </Link>
    </div>
  );
}
