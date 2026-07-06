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
import type { DateRange } from "../mocks/analytics-data";
import { SALES_CHART_DATA } from "../mocks/analytics-data";

interface SalesChartProps {
  range: DateRange;
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
            {p.name === "revenue" ? `$${p.value.toLocaleString()}` : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

const TICK_STYLE = { fontSize: 11, fill: "var(--color-text-muted)" };

export function SalesChart({ range }: SalesChartProps) {
  const data = SALES_CHART_DATA[range];

  // Show every Nth label to avoid crowding
  const labelInterval = range === "7d" ? 0 : range === "30d" ? 4 : 9;

  return (
    <div className="card-base p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Sales Over Time</h3>
        <span className="text-xs text-[var(--color-text-muted)]">Tool-attributed revenue &amp; orders</span>
      </div>
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
            yAxisId="revenue"
            tick={TICK_STYLE}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            width={44}
          />
          <YAxis
            yAxisId="orders"
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
            yAxisId="revenue"
            type="monotone"
            dataKey="revenue"
            stroke="#f76d01"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#f76d01" }}
          />
          <Line
            yAxisId="orders"
            type="monotone"
            dataKey="orders"
            stroke="#6b358d"
            strokeWidth={2}
            dot={false}
            strokeDasharray="4 3"
            activeDot={{ r: 4, fill: "#6b358d" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
