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
import type { UsagePoint } from "../types";

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
        <span className="text-[var(--color-text-secondary)]">Images created:</span>
        <span className="font-semibold text-[var(--color-text-primary)]">{payload[0].value}</span>
      </div>
    </div>
  );
}

const TICK_STYLE = { fontSize: 11, fill: "var(--color-text-muted)" };

export function UsageChart() {
  const [data, setData] = React.useState<UsagePoint[]>([]);

  React.useEffect(() => {
    let active = true;
    void fetch("/api/account/usage-history?metric=images&range=30d", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load image usage");
        return response.json();
      })
      .then((payload) => {
        if (!active) return;
        setData(
          (payload.points ?? []).map((point: { date: string; value: number }) => ({
            date: new Date(`${point.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            renders: point.value,
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

  const total = data.reduce((sum, point) => sum + point.renders, 0);
  return (
    <div className="card-base p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Images Created — Last 30 Days</h3>
        <span className="text-xs text-[var(--color-text-muted)]">{total.toLocaleString()} real generations</span>
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
            dataKey="renders"
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
