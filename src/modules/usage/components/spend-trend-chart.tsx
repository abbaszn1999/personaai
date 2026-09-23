"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { USAGE_TOOLS, formatUsdFromNanos, type UsageSeriesPoint, type UsageTool } from "@/lib/billing/usage-report";
import { TOOL_META, formatBucketLabel } from "../constants";

interface SpendTrendChartProps {
  points: UsageSeriesPoint[];
  bucket: "day" | "week";
  view: "usd" | "units";
  tool: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  view,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
  view: "usd" | "units";
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--radius-lg)] panel-glass shadow-lg px-3 py-2.5 text-xs backdrop-blur-md">
      <p className="font-semibold text-[var(--color-text-primary)] mb-1.5">{label}</p>
      {payload
        .filter((entry) => entry.value > 0)
        .map((entry) => {
          const tool = entry.dataKey as UsageTool;
          const meta = TOOL_META[tool];
          const text = view === "usd" ? formatUsdFromNanos(entry.value) : `${entry.value.toLocaleString()} ${meta?.unit ?? ""}`;
          return (
            <div key={entry.dataKey} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: entry.color }} />
              <span className="text-[var(--color-text-secondary)]">{meta?.label ?? entry.dataKey}</span>
              <span className="font-semibold text-[var(--color-text-primary)]">{text}</span>
            </div>
          );
        })}
    </div>
  );
}

export function SpendTrendChart({ points, bucket, view, tool }: SpendTrendChartProps) {
  const tools = tool === "all" ? USAGE_TOOLS : USAGE_TOOLS.filter((item) => item === tool);
  const data = points.map((point) => ({
    ...point,
    label: formatBucketLabel(point.bucket, bucket),
  }));
  const hasSpend = data.some((point) => tools.some((item) => point[item] > 0));

  return (
    <div className="card-base p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {view === "usd" ? "Spend by tool" : "Units by tool"}
        </h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {view === "usd" ? "Stacked at the same prices as the invoice." : "Each tool keeps its own unit."}
        </p>
      </div>
      {!hasSpend ? (
        <p className="py-16 text-center text-sm text-[var(--color-text-muted)]">No usage in this range.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(value: number) => (view === "usd" ? formatUsdFromNanos(value) : value.toLocaleString())}
            />
            <Tooltip content={<ChartTooltip view={view} />} />
            {tools.map((item) => (
              <Bar key={item} dataKey={item} stackId="spend" fill={TOOL_META[item].color} radius={[0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
