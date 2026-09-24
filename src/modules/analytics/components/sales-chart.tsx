"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils/cn";
import type { WorkspaceAnalyticsPayload } from "../types";
import { formatMoney } from "./stat-card";

type ChartMetric = "salesUsd" | "cartValue" | "sessions";

const METRICS: Array<{ id: ChartMetric; label: string; color: string; description: string }> = [
  { id: "salesUsd", label: "Sales", color: "#f76d01", description: "Attributed sales per day, USD after refunds" },
  { id: "cartValue", label: "Cart value", color: "#a855f7", description: "Value added to cart from the widget per day" },
  { id: "sessions", label: "Sessions", color: "#6b358d", description: "New widget sessions per day" },
];

function formatValue(metric: ChartMetric, value: number, currency: string): string {
  if (metric === "sessions") return value.toLocaleString();
  return formatMoney(value, metric === "salesUsd" ? "USD" : currency);
}

function ChartTooltip({
  active,
  payload,
  label,
  metric,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number; color: string }>;
  label?: string;
  metric: ChartMetric;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const meta = METRICS.find((item) => item.id === metric)!;
  return (
    <div className="min-w-[9rem] rounded-[var(--radius-lg)] border border-white/10 bg-[#0c0910] px-3 py-2.5 text-xs shadow-[0_8px_24px_rgb(0_0_0/0.6)]">
      <p className="font-semibold text-white mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: meta.color }} />
        <span className="flex-1 text-white/85">{meta.label}</span>
        <span className="font-semibold text-white">{formatValue(metric, payload[0].value, currency)}</span>
      </div>
    </div>
  );
}

export function SalesChart({ payload }: { payload: WorkspaceAnalyticsPayload | null }) {
  const [metric, setMetric] = React.useState<ChartMetric>("salesUsd");
  const data = payload?.activityByDay ?? [];
  const currency = payload?.kpis.currency ?? "USD";
  const meta = METRICS.find((item) => item.id === metric)!;
  const hasData = data.some((point) => point[metric] !== 0);

  return (
    <div className="card-base p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Performance over time</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{meta.description}</p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-[var(--color-border)] p-0.5">
          {METRICS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMetric(item.id)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold transition-colors",
                metric === item.id
                  ? "bg-[var(--color-surface-base)] text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {!hasData ? (
        <p className="py-20 text-center text-sm text-[var(--color-text-muted)]">Nothing to show in this range yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              tickLine={false}
              axisLine={false}
              width={60}
              allowDecimals={metric !== "sessions"}
              tickFormatter={(value: number) =>
                metric === "sessions"
                  ? value.toLocaleString()
                  : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)
              }
            />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.06)" }} content={<ChartTooltip metric={metric} currency={currency} />} />
            <Bar dataKey={metric} fill={meta.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
