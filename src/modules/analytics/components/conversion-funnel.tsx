import type { WorkspaceAnalyticsPayload } from "../types";

const STEP_HINTS = [
  "Shoppers who opened Persona",
  "Tried on, previewed live, asked the assistant, or added to cart",
  "Added a product from the widget",
  "Bought through an attributed order",
];

function pct(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "0%";
}

/** Session funnel from widget open to attributed order, with the share kept at each step. */
export function ConversionFunnel({ payload }: { payload: WorkspaceAnalyticsPayload | null }) {
  const steps = payload?.funnel ?? [];
  const top = steps[0]?.value ?? 0;
  const last = steps[steps.length - 1]?.value ?? 0;

  return (
    <div className="card-base p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Shopper funnel</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Sessions at each step, from open to order</p>
        </div>
        {top > 0 && (
          <div className="text-right">
            <p className="text-lg font-bold text-[var(--color-text-primary)]">{pct(last, top)}</p>
            <p className="text-[10px] text-[var(--color-text-muted)]">Open to order</p>
          </div>
        )}
      </div>

      {top === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">No sessions yet in this range.</p>
      ) : (
        <ol className="space-y-3">
          {steps.map((step, index) => {
            const previous = index > 0 ? steps[index - 1].value : null;
            const width = Math.max(2, Math.min(100, (step.value / top) * 100));
            return (
              <li key={step.label} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-[var(--color-text-primary)]">{step.label}</span>
                    <span className="ml-2 text-[var(--color-text-muted)]">{STEP_HINTS[index]}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="font-bold text-[var(--color-text-primary)]">{step.value.toLocaleString()}</span>
                    <span className="ml-2 text-[var(--color-text-muted)]">{pct(step.value, top)}</span>
                  </div>
                </div>
                <div className="h-6 w-full rounded-[var(--radius-md)] bg-[var(--color-surface-base)] overflow-hidden">
                  <div className="h-full rounded-[var(--radius-md)] gradient-brand transition-all duration-500" style={{ width: `${width}%` }} />
                </div>
                {previous !== null && previous > 0 && (
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    {pct(Math.min(step.value, previous), previous)} of the previous step
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
