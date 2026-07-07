"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { USAGE_HISTORY } from "../mocks/usage-history";

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
  return (
    <div className="card-base p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Images Created — Last 30 Days</h3>
        <span className="text-xs text-[var(--color-text-muted)]">2K high-fidelity generations</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={USAGE_HISTORY} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
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
