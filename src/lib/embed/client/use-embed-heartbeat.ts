"use client";

import * as React from "react";
import { getOrCreateEmbedSessionId } from "./embed-storage";

const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Pings `/api/embed/heartbeat` every ~15s while an embedded widget is mounted, powering the
 * merchant-facing live session count on the analytics page (see countLiveSessions in
 * src/lib/db/live-sessions.ts). Deliberately fire-and-forget: a failed/slow ping just means
 * this session ages out of the "live" window a little early, never something the shopper
 * should see or that should block anything else in the widget.
 */
export function useEmbedHeartbeat(apiBase: string, embedToken: string): void {
  React.useEffect(() => {
    const sessionId = getOrCreateEmbedSessionId(embedToken);

    function ping() {
      void fetch(`${apiBase}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedToken, sessionId }),
      }).catch(() => {
        // Non-fatal — the count on the dashboard just misses a beat.
      });
    }

    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [apiBase, embedToken]);
}
