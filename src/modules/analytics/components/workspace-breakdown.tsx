import * as React from "react";
import { Shirt, BotMessageSquare, TrendingUp, Users, DollarSign, Image as ImageIcon, MessageSquare } from "lucide-react";
import type { Workspace } from "@/modules/workspaces/types";
import type { WorkspaceAnalyticsPayload } from "../types";
import { cn } from "@/lib/utils/cn";

interface WorkspaceBreakdownProps {
  workspace: Workspace | null;
  payload: WorkspaceAnalyticsPayload | null;
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function formatRevenue(v: number) {
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;
}

/** Currently only ever shows the one workspace this account has — real Persona-attributed
 *  sessions/cart value/items-added from the same summary payload as the rest of the page.
 *  "Messages" for unwearable-mode workspaces has no data source yet (needs per-turn chat
 *  logging), shown as an explicit em dash rather than an invented number. */
export function WorkspaceBreakdown({ workspace, payload }: WorkspaceBreakdownProps) {
  if (!workspace || !payload) {
    return (
      <div className="card-base p-5 flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Project Breakdown</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Performance per agent project</p>
        </div>
        <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">No project data yet</div>
      </div>
    );
  }

  const isWearable = workspace.mode === "wearable";
  const conversions = payload.shopperStats.newSessions + payload.shopperStats.returningSessions > 0
    ? payload.kpis.addToCartRate
    : 0;

  return (
    <div className="card-base p-5 flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Project Breakdown</h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Performance per agent project</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] p-4 space-y-3">
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
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">{workspace.name}</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {isWearable ? "Virtual Try-On" : "Shopping Assistant"}
              </p>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            <Stat icon={<Users className="h-3.5 w-3.5" />} label="Sessions" value={payload.kpis.sessions.toLocaleString()} />
            <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} label="Items Added" value={payload.kpis.cartItemsAdded.toLocaleString()} />
            <Stat icon={<DollarSign className="h-3.5 w-3.5" />} label="Cart Value" value={formatRevenue(payload.kpis.cartValueAdded)} />
            <Stat
              icon={isWearable
                ? <ImageIcon className="h-3.5 w-3.5" />
                : <MessageSquare className="h-3.5 w-3.5" />
              }
              label={isWearable ? "Images Generated" : "Messages"}
              value={isWearable ? payload.imagesGenerated.toLocaleString() : "—"}
            />
          </div>

          {/* Add-to-cart rate bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-[var(--color-text-muted)]">Add-to-cart rate</span>
              <span className="font-semibold text-[var(--color-text-primary)]">
                {conversions.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-surface-base)]">
              <div
                className={cn("h-full rounded-full", isWearable ? "gradient-wearable" : "gradient-unwearable")}
                style={{ width: `${Math.min(100, conversions)}%` }}
              />
            </div>
          </div>

          {/* Avg session */}
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Avg. session: {formatDuration(payload.shopperStats.avgSessionDurationSeconds)}
          </p>
        </div>
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
