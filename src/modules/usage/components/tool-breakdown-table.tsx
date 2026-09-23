"use client";

import { formatUsdFromNanos, type ToolBreakdownLine, type UsageTool } from "@/lib/billing/usage-report";
import { TOOL_META } from "../constants";

function changeLabel(value: number | null): string {
  if (value === null) return "New";
  const rounded = Math.round(value);
  if (rounded === 0) return "Flat";
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function unitLabel(tool: UsageTool, units: number): string {
  if (tool === "live") {
    const minutes = units / 60;
    return `${minutes.toLocaleString(undefined, { maximumFractionDigits: 1 })} min`;
  }
  return units.toLocaleString();
}

export function ToolBreakdownTable({ lines }: { lines: ToolBreakdownLine[] }) {
  const visible = lines.filter(
    (line) => line.quantity > 0 || line.units > 0 || line.costNanos > 0 || (line.changePercent !== null && line.changePercent !== 0)
  );
  return (
    <div className="card-base overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Spend by tool</h3>
      </div>
      {visible.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">No tool usage in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-5 py-3 font-medium">Tool</th>
                <th className="px-3 py-3 font-medium">Quantity</th>
                <th className="px-3 py-3 font-medium">Units</th>
                <th className="px-3 py-3 font-medium">Cost</th>
                <th className="px-3 py-3 font-medium">Share</th>
                <th className="px-5 py-3 font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((line) => {
                const meta = TOOL_META[line.tool];
                return (
                  <tr key={line.tool} className="border-t border-[var(--color-border)]">
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2 font-medium text-[var(--color-text-primary)]">
                        <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[var(--color-text-secondary)]">
                      {line.quantity.toLocaleString()} {meta.quantity}
                    </td>
                    <td className="px-3 py-3 text-[var(--color-text-secondary)]">{unitLabel(line.tool, line.units)}</td>
                    <td className="px-3 py-3 font-semibold text-[var(--color-text-primary)]">{formatUsdFromNanos(line.costNanos)}</td>
                    <td className="px-3 py-3 text-[var(--color-text-secondary)]">{Math.round(line.share * 100)}%</td>
                    <td className="px-5 py-3 text-[var(--color-text-secondary)]">{changeLabel(line.changePercent)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
