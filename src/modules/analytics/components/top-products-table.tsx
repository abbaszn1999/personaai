import * as React from "react";
import Image from "next/image";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { TOP_PRODUCTS } from "../mocks/analytics-data";
import { cn } from "@/lib/utils/cn";

export function TopProductsTable() {
  return (
    <div className="card-base p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Top Products</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Agent recommendations vs actual conversions
          </p>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-base)] rounded-full px-2.5 py-1">
          <AlertCircle className="h-3 w-3" />
          Gap = tuning opportunity
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left text-xs font-medium text-[var(--color-text-muted)] pb-2 w-8">#</th>
              <th className="text-left text-xs font-medium text-[var(--color-text-muted)] pb-2">Product</th>
              <th className="text-right text-xs font-medium text-[var(--color-text-muted)] pb-2">Recommended</th>
              <th className="text-right text-xs font-medium text-[var(--color-text-muted)] pb-2">Converted</th>
              <th className="text-right text-xs font-medium text-[var(--color-text-muted)] pb-2">Rate</th>
              <th className="text-right text-xs font-medium text-[var(--color-text-muted)] pb-2">Gap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {TOP_PRODUCTS.map((p, i) => {
              const gap = p.recommendations - p.conversions;
              const gapHigh = gap > 200;
              return (
                <tr key={p.productId} className="hover:bg-[var(--color-surface-base)] transition-colors">
                  <td className="py-3 pr-2">
                    <span className="text-xs font-bold text-[var(--color-text-muted)]">{i + 1}</span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="relative h-9 w-9 rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-surface-base)] shrink-0">
                        <Image src={p.imageUrl} alt={p.name} fill className="object-cover" unoptimized />
                      </div>
                      <span className="font-medium text-[var(--color-text-primary)] text-xs">{p.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right text-xs text-[var(--color-text-secondary)]">
                    {p.recommendations.toLocaleString()}
                  </td>
                  <td className="py-3 text-right text-xs font-semibold text-[var(--color-text-primary)]">
                    {p.conversions.toLocaleString()}
                  </td>
                  <td className="py-3 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full",
                        p.conversionRate >= 25
                          ? "bg-[var(--color-success-light)] text-[var(--color-success)]"
                          : p.conversionRate >= 15
                          ? "bg-[var(--color-brand-light)] text-[var(--color-brand)]"
                          : "bg-[var(--color-error-light)] text-[var(--color-error)]"
                      )}
                    >
                      {p.conversionRate >= 25
                        ? <TrendingUp className="h-3 w-3" />
                        : <TrendingDown className="h-3 w-3" />
                      }
                      {p.conversionRate}%
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        gapHigh ? "text-[var(--color-warning)]" : "text-[var(--color-text-muted)]"
                      )}
                    >
                      {gapHigh && <span className="mr-1">⚠</span>}
                      {gap.toLocaleString()}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
