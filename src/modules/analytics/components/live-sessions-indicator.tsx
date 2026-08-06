"use client";

import * as React from "react";
import { Eye } from "lucide-react";

const POLL_INTERVAL_MS = 5_000;

interface LiveSessionsIndicatorProps {
  workspaceId: string;
}

/** Glanceable "how many shoppers are on the widget right now" count for the analytics page
 *  header — polls the authenticated live-count endpoint, which is itself backed by shopper
 *  heartbeats (see src/lib/db/live-sessions.ts). No click interaction, just a live number. */
export function LiveSessionsIndicator({ workspaceId }: LiveSessionsIndicatorProps) {
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/live-sessions`);
        if (!active || !res.ok) return;
        const data: { count?: number } = await res.json().catch(() => ({}));
        if (active && typeof data.count === "number") setCount(data.count);
      } catch {
        // Non-fatal — keep showing the last known count until the next tick succeeds.
      }
    }

    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [workspaceId]);

  return (
    <div
      className="flex items-center gap-1.5 panel-glass rounded-[var(--radius-full)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)]"
      title="Shoppers currently viewing this widget"
    >
      <Eye className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--color-success)] opacity-75 animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
      </span>
      <span>{count ?? "–"}</span>
      <span className="text-[var(--color-text-muted)] font-normal">live</span>
    </div>
  );
}
