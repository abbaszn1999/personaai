import * as React from "react";
import { Users, Clock, UserPlus, Repeat2 } from "lucide-react";
import type { WorkspaceAnalyticsPayload } from "../types";

interface ShopperStatsProps {
  payload: WorkspaceAnalyticsPayload | null;
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

/** Sessions opened in range vs ones carried over from before it, plus avg session duration,
 *  derived entirely from live_sessions heartbeats for this workspace's own widget. */
export function ShopperStats({ payload }: ShopperStatsProps) {
  const d = payload?.shopperStats;
  const total = (d?.newSessions ?? 0) + (d?.returningSessions ?? 0);
  const newPct = d && total > 0 ? Math.round((d.newSessions / total) * 100) : 0;
  const retPct = total > 0 ? 100 - newPct : 0;

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

      {total === 0 ? (
        <div className="py-6 text-center text-xs text-[var(--color-text-muted)]">
          No sessions yet in this range
        </div>
      ) : (
        <>
          {/* New vs continuing pill chart */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-muted)]">New vs continuing</span>
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
                  New — {(d?.newSessions ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-brand-light)] border border-[var(--color-brand)]" />
                <span className="text-xs text-[var(--color-text-secondary)]">
                  Continued from earlier — {(d?.returningSessions ?? 0).toLocaleString()}
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
                {formatDuration(d?.avgSessionDurationSeconds ?? 0)}
              </p>
            </div>
          </div>

          {/* Quick breakdown */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-base)] px-2.5 py-2 flex items-center gap-2">
              <UserPlus className="h-3.5 w-3.5 text-[var(--color-brand)]" />
              <div>
                <p className="text-[10px] text-[var(--color-text-muted)]">New</p>
                <p className="text-sm font-bold text-[var(--color-text-primary)]">{(d?.newSessions ?? 0).toLocaleString()}</p>
              </div>
            </div>
            <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-base)] px-2.5 py-2 flex items-center gap-2">
              <Repeat2 className="h-3.5 w-3.5 text-[var(--color-brand)]" />
              <div>
                <p className="text-[10px] text-[var(--color-text-muted)]">Continued</p>
                <p className="text-sm font-bold text-[var(--color-text-primary)]">{(d?.returningSessions ?? 0).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
