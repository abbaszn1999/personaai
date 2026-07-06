import * as React from "react";
import { Users, Clock, UserPlus, Repeat2 } from "lucide-react";
import type { DateRange } from "../mocks/analytics-data";
import { SHOPPER_STATS } from "../mocks/analytics-data";

interface ShopperStatsProps {
  range: DateRange;
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export function ShopperStats({ range }: ShopperStatsProps) {
  const d = SHOPPER_STATS[range];
  const total = d.newShoppers + d.returningShoppers;
  const newPct = Math.round((d.newShoppers / total) * 100);
  const retPct = 100 - newPct;

  return (
    <div className="card-base p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg gradient-brand flex items-center justify-center">
          <Users className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Shopper Stats</h3>
          <p className="text-xs text-[var(--color-text-muted)]">Who&apos;s using the widget</p>
        </div>
      </div>

      {/* New vs Returning pill chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--color-text-muted)]">New vs Returning</span>
          <span className="text-[var(--color-text-secondary)] font-medium">{total.toLocaleString()} total</span>
        </div>
        {/* Pill bar */}
        <div className="flex h-5 rounded-full overflow-hidden gap-0.5">
          <div
            className="gradient-brand flex items-center justify-center transition-all duration-500"
            style={{ width: `${newPct}%` }}
          >
            <span className="text-[9px] font-bold text-white">{newPct}%</span>
          </div>
          <div
            className="bg-[var(--color-brand-light)] flex items-center justify-center transition-all duration-500"
            style={{ width: `${retPct}%` }}
          >
            <span className="text-[9px] font-bold text-[var(--color-brand)]">{retPct}%</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full gradient-brand" />
            <span className="text-xs text-[var(--color-text-secondary)]">
              New — {d.newShoppers.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-brand-light)] border border-[var(--color-brand)]" />
            <span className="text-xs text-[var(--color-text-secondary)]">
              Returning — {d.returningShoppers.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Avg session duration */}
      <div className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-base)] px-3 py-2.5">
        <Clock className="h-4 w-4 text-[var(--color-text-muted)] shrink-0" />
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Avg. session duration in widget</p>
          <p className="text-sm font-bold text-[var(--color-text-primary)]">
            {formatDuration(d.avgSessionDurationSeconds)}
          </p>
        </div>
      </div>

      {/* Quick breakdown */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-base)] px-2.5 py-2 flex items-center gap-2">
          <UserPlus className="h-3.5 w-3.5 text-[var(--color-brand)]" />
          <div>
            <p className="text-[10px] text-[var(--color-text-muted)]">New</p>
            <p className="text-sm font-bold text-[var(--color-text-primary)]">{d.newShoppers.toLocaleString()}</p>
          </div>
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-base)] px-2.5 py-2 flex items-center gap-2">
          <Repeat2 className="h-3.5 w-3.5 text-[var(--color-brand)]" />
          <div>
            <p className="text-[10px] text-[var(--color-text-muted)]">Returning</p>
            <p className="text-sm font-bold text-[var(--color-text-primary)]">{d.returningShoppers.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
