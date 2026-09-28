import { Package } from "lucide-react";
import type { WorkspaceAnalyticsPayload } from "../types";
import { formatUsdCents } from "./stat-card";

/** Products ranked by attributed net sales, the order-side view of Top products added to cart. */
export function TopSellingProducts({ payload }: { payload: WorkspaceAnalyticsPayload | null }) {
  const products = payload?.sales.topProducts ?? [];
  const total = payload?.sales.netUsdCents ?? 0;

  return (
    <div className="card-base p-5 flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Top sellers via Persona</h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Ranked by attributed sales after refunds</p>
      </div>

      {products.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">No attributed orders in this range yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left text-xs font-medium text-[var(--color-text-muted)] pb-2 w-8">#</th>
                <th className="text-left text-xs font-medium text-[var(--color-text-muted)] pb-2">Product</th>
                <th className="text-right text-xs font-medium text-[var(--color-text-muted)] pb-2">Orders</th>
                <th className="text-right text-xs font-medium text-[var(--color-text-muted)] pb-2">Sales</th>
                <th className="text-right text-xs font-medium text-[var(--color-text-muted)] pb-2">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {products.map((product, index) => (
                <tr key={product.key} className="hover:bg-[var(--color-surface-base)] transition-colors">
                  <td className="py-3 pr-2 text-xs font-bold text-[var(--color-text-muted)]">{index + 1}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-base)] shrink-0">
                        <Package className="h-4 w-4 text-[var(--color-text-muted)]" />
                      </div>
                      <span className="font-medium text-[var(--color-text-primary)] text-xs">{product.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right text-xs font-semibold text-[var(--color-text-primary)]">{product.orders.toLocaleString()}</td>
                  <td className="py-3 text-right text-xs font-semibold text-[var(--color-text-primary)]">{formatUsdCents(product.netUsdCents)}</td>
                  <td className="py-3 text-right text-xs text-[var(--color-text-muted)]">
                    {total > 0 ? `${Math.round((product.netUsdCents / total) * 100)}%` : "—"}
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
