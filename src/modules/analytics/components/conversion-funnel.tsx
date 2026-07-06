import * as React from "react";
import { ArrowDown } from "lucide-react";
import type { DateRange } from "../mocks/analytics-data";
import { FUNNEL_DATA } from "../mocks/analytics-data";
import { cn } from "@/lib/utils/cn";

interface ConversionFunnelProps {
  range: DateRange;
}

const STEP_COLORS = [
  { bar: "gradient-brand",      text: "text-[var(--color-brand)]" },
  { bar: "gradient-wearable",   text: "text-[var(--color-wearable-from,#6b358d)]" },
  { bar: "gradient-unwearable", text: "text-[var(--color-unwearable-from,#f76d01)]" },
  { bar: "bg-[var(--color-success)]", text: "text-[var(--color-success)]" },
];

export function ConversionFunnel({ range }: ConversionFunnelProps) {
  const steps = FUNNEL_DATA[range];
  const max = steps[0].value;

  return (
    <div className="card-base p-5 flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Conversion Funnel</h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Shopper journey from open to purchase</p>
      </div>

      <div className="space-y-2">
        {steps.map((step, i) => {
          const pct = Math.round((step.value / max) * 100);
          const color = STEP_COLORS[i] ?? STEP_COLORS[0];
          return (
            <React.Fragment key={step.label}>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[var(--color-text-secondary)]">{step.label}</span>
                  <div className="flex items-center gap-2">
                    {step.dropOff > 0 && (
                      <span className="text-[var(--color-error)] text-[10px]">
                        −{step.dropOff}%
                      </span>
                    )}
                    <span className={cn("font-bold", color.text)}>
                      {step.value.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="h-7 w-full rounded-[var(--radius-md)] bg-[var(--color-surface-base)] overflow-hidden">
                  <div
                    className={cn("h-full rounded-[var(--radius-md)] transition-all duration-500", color.bar)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className="flex justify-center">
                  <ArrowDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Overall conversion */}
      <div className="rounded-[var(--radius-lg)] bg-[var(--color-brand-light)] px-3 py-2 flex items-center justify-between">
        <span className="text-xs text-[var(--color-brand)]">Overall conversion rate</span>
        <span className="text-sm font-bold text-[var(--color-brand)]">
          {((steps[steps.length - 1].value / steps[0].value) * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
