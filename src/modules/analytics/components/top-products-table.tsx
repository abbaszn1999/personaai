import * as React from "react";
import { Package } from "lucide-react";
import type { WorkspaceAnalyticsPayload } from "../types";

interface TopProductsTableProps {
  payload: WorkspaceAnalyticsPayload | null;
}

/** Ranked purely by real cart_events rows Persona itself logged — no catalog join, no
 *  "recommended vs converted" gap (that needed per-recommendation tracking we don't have). */
export function TopProductsTable({ payload }: TopProductsTableProps) {
  const products = payload?.topProducts ?? [];
  const currency = payload?.kpis.currency ?? "USD";

  return (
    <div className="card-base p-5 flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Top Products Added to Cart via Persona</h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Ranked by real Persona-driven cart adds
        </p>
      </div>

      {products.length === 0 ? (
        <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">
          No cart adds yet in this range
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left text-xs font-medium text-[var(--color-text-muted)] pb-2 w-8">#</th>
                <th className="text-left text-xs font-medium text-[var(--color-text-muted)] pb-2">Product</th>
                <th className="text-right text-xs font-medium text-[var(--color-text-muted)] pb-2">Added to Cart</th>
                <th className="text-right text-xs font-medium text-[var(--color-text-muted)] pb-2">Cart Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {products.map((p, i) => (
                <tr key={p.productId} className="hover:bg-[var(--color-surface-base)] transition-colors">
                  <td className="py-3 pr-2">
                    <span className="text-xs font-bold text-[var(--color-text-muted)]">{i + 1}</span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-base)] shrink-0">
                        <Package className="h-4 w-4 text-[var(--color-text-muted)]" />
                      </div>
                      <span className="font-medium text-[var(--color-text-primary)] text-xs">{p.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right text-xs font-semibold text-[var(--color-text-primary)]">
                    {p.addCount.toLocaleString()}
                  </td>
                  <td className="py-3 text-right text-xs text-[var(--color-text-secondary)]">
                    {currency === "USD" ? "$" : `${currency} `}{p.addValue.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
