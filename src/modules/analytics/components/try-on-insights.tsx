import * as React from "react";
import { Shirt, Camera, Ruler, BarChart3 } from "lucide-react";
import { TRY_ON_INSIGHTS } from "../mocks/analytics-data";

export function TryOnInsights() {
  const d = TRY_ON_INSIGHTS;

  return (
    <div className="card-base p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg gradient-wearable flex items-center justify-center">
          <Shirt className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Virtual Try-On Insights</h3>
          <p className="text-xs text-[var(--color-text-muted)]">Wearable workspace only</p>
        </div>
      </div>

      {/* Avg try-ons per session */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-[var(--color-brand-light)] flex items-center justify-center shrink-0">
          <Camera className="h-4 w-4 text-[var(--color-brand)]" />
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Avg. try-ons per session</p>
          <p className="text-xl font-bold text-[var(--color-text-primary)]">{d.avgTryOnsPerSession}</p>
        </div>
      </div>

      {/* Most tried-on products */}
      <div>
        <div className="flex items-center gap-1.5 mb-2.5">
          <BarChart3 className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Most Tried-On Products</span>
        </div>
        <div className="space-y-2">
          {d.mostTriedOnProducts.map((p, i) => {
            const max = d.mostTriedOnProducts[0].tryOns;
            const pct = (p.tryOns / max) * 100;
            return (
              <div key={p.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--color-text-secondary)]">
                    <span className="text-[var(--color-text-muted)] mr-1.5">{i + 1}.</span>
                    {p.name}
                  </span>
                  <span className="font-semibold text-[var(--color-text-primary)]">{p.tryOns}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--color-surface-base)]">
                  <div
                    className="h-full rounded-full gradient-wearable transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top recommended sizes */}
      <div>
        <div className="flex items-center gap-1.5 mb-2.5">
          <Ruler className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Top Recommended Sizes</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.topRecommendedSizes.map((s) => (
            <div
              key={s.size}
              className="flex flex-col items-center gap-0.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2 min-w-[52px]"
            >
              <span className="text-sm font-bold text-[var(--color-text-primary)]">{s.size}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{s.percentage}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
