"use client";

import * as React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { LiveTryOnUsagePoint } from "../types";

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--radius-lg)] panel-glass shadow-lg px-3 py-2.5 text-xs backdrop-blur-md">
      <p className="font-semibold text-[var(--color-text-primary)] mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: "#f76d01" }} />
        <span className="text-[var(--color-text-secondary)]">Live seconds:</span>
        <span className="font-semibold text-[var(--color-text-primary)]">{payload[0].value}s</span>
      </div>
    </div>
  );
}

const TICK_STYLE = { fontSize: 11, fill: "var(--color-text-muted)" };

export function LiveTryOnUsageChart() {
  const [data, setData] = React.useState<LiveTryOnUsagePoint[]>([]);

  React.useEffect(() => {
    let active = true;
    void fetch("/api/account/usage-history?metric=live_tryon&range=30d", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load live try-on usage");
        return response.json();
      })
      .then((payload) => {
        if (!active) return;
        setData(
          (payload.points ?? []).map((point: { date: string; value: number }) => ({
            date: new Date(`${point.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            seconds: point.value,
          }))
        );
      })
      .catch(() => {
        if (active) setData([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const totalSeconds = data.reduce((sum, point) => sum + point.seconds, 0);
  return (
    <div className="card-base p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Live Try-On Seconds — Last 30 Days</h3>
        <span className="text-xs text-[var(--color-text-muted)]">
          {totalSeconds.toLocaleString()}s of realtime camera preview
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={TICK_STYLE}
            tickLine={false}
            axisLine={false}
            interval={4}
          />
          <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} width={36} />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="seconds"
            stroke="#f76d01"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#f76d01" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
