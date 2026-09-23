"use client";

import { Button } from "@/components/ui/button";
import { formatUsdFromNanos, shopperCostNanos, shopperKey, shopperLabel, type ShopperUsage } from "@/lib/billing/usage-report";
import { formatWhen } from "../constants";

interface ShoppersTableProps {
  shoppers: ShopperUsage[];
  shopperCount: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onOpen: (sessionId: string) => void;
}

export function ShoppersTable({ shoppers, shopperCount, page, pageSize, onPage, onOpen }: ShoppersTableProps) {
  const pages = Math.max(1, Math.ceil(shopperCount / pageSize));
  return (
    <div className="card-base overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Shoppers</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Highest spend first. Open a row for the breakdown.</p>
        </div>
        <span className="text-xs text-[var(--color-text-muted)]">{shopperCount.toLocaleString()} in this filter</span>
      </div>
      {shoppers.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">No shoppers in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-5 py-3 font-medium">Shopper</th>
                <th className="px-3 py-3 font-medium">Source</th>
                <th className="px-3 py-3 font-medium">Chat</th>
                <th className="px-3 py-3 font-medium">Search</th>
                <th className="px-3 py-3 font-medium">Try-on</th>
                <th className="px-3 py-3 font-medium">Avatar</th>
                <th className="px-3 py-3 font-medium">Live</th>
                <th className="px-3 py-3 font-medium">Cost</th>
                <th className="px-5 py-3 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {shoppers.map((shopper) => (
                <tr
                  key={`${shopperKey(shopper.sessionId)}:${shopper.source ?? "none"}`}
                  className="border-t border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-surface-base)]"
                  onClick={() => onOpen(shopperKey(shopper.sessionId))}
                >
                  <td className="px-5 py-3 font-medium text-[var(--color-text-primary)]">
                    {shopperLabel(shopper.sessionId, shopper.source)}
                  </td>
                  <td className="px-3 py-3 text-[var(--color-text-secondary)]">
                    {shopper.source === "preview" ? "Preview" : shopper.source === "store" ? "Store" : "—"}
                  </td>
                  <td className="px-3 py-3 text-[var(--color-text-secondary)]">{shopper.chatCalls.toLocaleString()}</td>
                  <td className="px-3 py-3 text-[var(--color-text-secondary)]">{shopper.searches.toLocaleString()}</td>
                  <td className="px-3 py-3 text-[var(--color-text-secondary)]">{shopper.tryOnUnits.toLocaleString()}</td>
                  <td className="px-3 py-3 text-[var(--color-text-secondary)]">{shopper.avatarUnits.toLocaleString()}</td>
                  <td className="px-3 py-3 text-[var(--color-text-secondary)]">
                    {(shopper.liveSeconds / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </td>
                  <td className="px-3 py-3 font-semibold text-[var(--color-text-primary)]">
                    {formatUsdFromNanos(shopperCostNanos(shopper))}
                  </td>
                  <td className="px-5 py-3 text-[var(--color-text-secondary)]">{formatWhen(shopper.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {shopperCount > pageSize && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border)]">
          <Button type="button" variant="secondary" size="sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <span className="text-xs text-[var(--color-text-muted)]">
            Page {page + 1} of {pages}
          </span>
          <Button type="button" variant="secondary" size="sm" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
