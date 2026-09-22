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
  Legend,
} from "recharts";
import type { WorkspaceAnalyticsPayload } from "../types";

interface SalesChartProps {
  payload: WorkspaceAnalyticsPayload | null;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--radius-lg)] panel-glass shadow-lg px-3 py-2.5 text-xs backdrop-blur-md">
      <p className="font-semibold text-[var(--color-text-primary)] mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-[var(--color-text-secondary)] capitalize">{p.name}:</span>
          <span className="font-semibold text-[var(--color-text-primary)]">
            {p.name === "cartValue" ? `$${p.value.toLocaleString()}` : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

const TICK_STYLE = { fontSize: 11, fill: "var(--color-text-muted)" };

/** "Persona Activity Over Time" — two real series (sessions Persona opened/day, cart value
 *  Persona added/day), both traced back to live_sessions + cart_events. No
 *  store-wide revenue/order series — see src/lib/db/analytics.ts. */
export function SalesChart({ payload }: SalesChartProps) {
  const data = payload?.activityByDay ?? [];
  const days = data.length;

  // Show every Nth label to avoid crowding
  const labelInterval = days <= 7 ? 0 : days <= 30 ? 4 : 9;

  return (
    <div className="card-base p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Persona Activity Over Time</h3>
        <span className="text-xs text-[var(--color-text-muted)]">Sessions opened &amp; cart value added via Persona</span>
      </div>
      {data.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-xs text-[var(--color-text-muted)]">
          No activity yet in this range
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={TICK_STYLE}
              tickLine={false}
              axisLine={false}
              interval={labelInterval}
            />
            <YAxis
              yAxisId="cartValue"
              tick={TICK_STYLE}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              width={44}
            />
            <YAxis
              yAxisId="sessions"
              orientation="right"
              tick={TICK_STYLE}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, color: "var(--color-text-muted)", paddingTop: 12 }}
              formatter={(v) => <span style={{ color: "var(--color-text-secondary)" }}>{v}</span>}
            />
            <Line
              yAxisId="cartValue"
              type="monotone"
              dataKey="cartValue"
              stroke="#f76d01"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#f76d01" }}
            />
            <Line
              yAxisId="sessions"
              type="monotone"
              dataKey="sessions"
              stroke="#6b358d"
              strokeWidth={2}
              dot={false}
              strokeDasharray="4 3"
              activeDot={{ r: 4, fill: "#6b358d" }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
