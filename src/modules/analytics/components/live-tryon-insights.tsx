import * as React from "react";
import { Radio, Clock3, BarChart3, Repeat2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { WorkspaceAnalyticsPayload } from "../types";

interface LiveTryOnInsightsProps {
  payload: WorkspaceAnalyticsPayload | null;
}

function formatSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/** Dedicated container for the Decart realtime camera try-on feature — kept separate from
 *  TryOnInsights (static Photo mode) since it's a different feature with its own session and
 *  duration semantics (see realtime-tryon-events.ts). Every stat here is logged the moment a
 *  shopper switches (or ends) a live preview — see use-realtime-tryon.ts. Falls back to an
 *  honest empty state when no shopper has started a live session yet in this range. */
export function LiveTryOnInsights({ payload }: LiveTryOnInsightsProps) {
  const d = payload?.liveTryOnInsights;

  return (
    <div className="card-base p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg gradient-wearable flex items-center justify-center">
          <Radio className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Live Camera Try-On Insights</h3>
          <p className="text-xs text-[var(--color-text-muted)]">Wearable workspace only</p>
        </div>
      </div>

      {!d ? (
        <EmptyState
          icon={<Radio className="h-6 w-6" />}
          title="No live try-ons yet"
          description="Once a shopper starts a live camera try-on session, session and product insights will show up here."
          className="py-10"
        />
      ) : (
        <>
          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3">
              <p className="text-[10px] text-[var(--color-text-muted)]">Live sessions</p>
              <p className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">{d.totalSessions}</p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3">
              <p className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                <Clock3 className="h-3 w-3" /> Total generated time
              </p>
              <p className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">{formatSeconds(d.totalSeconds)}</p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3">
              <p className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                <Repeat2 className="h-3 w-3" /> Avg. previews / session
              </p>
              <p className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">{d.avgPreviewsPerSession}</p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3">
              <p className="text-[10px] text-[var(--color-text-muted)]">Avg. session length</p>
              <p className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">{formatSeconds(d.avgSessionDurationSeconds)}</p>
            </div>
          </div>

          {/* Most previewed products */}
          {d.mostPreviewedProducts.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <BarChart3 className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Most Previewed Live</span>
              </div>
              <div className="space-y-2">
                {d.mostPreviewedProducts.map((p, i) => {
                  const max = d.mostPreviewedProducts[0].previews;
                  const pct = (p.previews / max) * 100;
                  return (
                    <div key={p.productId} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="min-w-0 truncate text-[var(--color-text-secondary)]">
                          <span className="mr-1.5 text-[var(--color-text-muted)]">{i + 1}.</span>
                          {p.name}
                        </span>
                        <span className="ml-3 font-semibold text-[var(--color-text-primary)]">{p.previews}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--color-surface-base)]">
                        <div
                          className="h-full rounded-full gradient-wearable transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
