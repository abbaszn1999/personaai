import * as React from "react";
import { Shirt, BotMessageSquare, TrendingUp, Users, DollarSign, Image as ImageIcon, MessageSquare } from "lucide-react";
import { WORKSPACE_ANALYTICS } from "../mocks/analytics-data";
import { cn } from "@/lib/utils/cn";

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function formatRevenue(v: number) {
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;
}

export function WorkspaceBreakdown() {
  const entries = Object.values(WORKSPACE_ANALYTICS);

  return (
    <div className="card-base p-5 flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Workspace Breakdown</h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Performance per agent workspace</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {entries.map((ws) => {
          const isWearable = ws.mode === "wearable";
          return (
            <div
              key={ws.name}
              className="rounded-[var(--radius-xl)] border border-[var(--color-border)] p-4 space-y-3"
            >
              {/* Header */}
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center",
                    isWearable ? "gradient-wearable" : "gradient-unwearable"
                  )}
                >
                  {isWearable
                    ? <Shirt className="h-4 w-4 text-white" />
                    : <BotMessageSquare className="h-4 w-4 text-white" />
                  }
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{ws.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {isWearable ? "Virtual Try-On" : "Shopping Assistant"}
                  </p>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2">
                <Stat icon={<Users className="h-3.5 w-3.5" />} label="Sessions" value={ws.sessions.toLocaleString()} />
                <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} label="Conversions" value={ws.conversions.toLocaleString()} />
                <Stat icon={<DollarSign className="h-3.5 w-3.5" />} label="Revenue" value={formatRevenue(ws.revenue)} />
                <Stat
                  icon={isWearable
                    ? <ImageIcon className="h-3.5 w-3.5" />
                    : <MessageSquare className="h-3.5 w-3.5" />
                  }
                  label={isWearable ? "Try-Ons" : "Messages"}
                  value={(isWearable ? ws.tryOns : ws.chatMessages)?.toLocaleString() ?? "—"}
                />
              </div>

              {/* Conversion rate bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[var(--color-text-muted)]">Conversion rate</span>
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {((ws.conversions / ws.sessions) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--color-surface-base)]">
                  <div
                    className={cn("h-full rounded-full", isWearable ? "gradient-wearable" : "gradient-unwearable")}
                    style={{ width: `${((ws.conversions / ws.sessions) * 100).toFixed(1)}%` }}
                  />
                </div>
              </div>

              {/* Avg session */}
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Avg. session: {formatDuration(ws.avgSessionDurationSeconds)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-base)] px-2.5 py-2">
      <div className="flex items-center gap-1 text-[var(--color-text-muted)] mb-0.5">
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <p className="text-sm font-bold text-[var(--color-text-primary)]">{value}</p>
    </div>
  );
}
