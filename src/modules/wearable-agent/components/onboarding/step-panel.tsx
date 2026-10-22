import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface StepPanelProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  /** Small status on the right of the header (a progress count, a "ready" tick). */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Soft, compact section card for the combined onboarding step ("Let's build your avatar"):
 * a single-row header with a subtle icon, title, optional short hint, and status pill on the
 * right, followed by the section's controls.
 */
export function StepPanel({ icon: Icon, title, description, aside, className, children }: StepPanelProps) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-[var(--radius-xl)] border border-[var(--color-border)]",
        "bg-[var(--color-surface-base)]/65 p-3 @md:gap-3 @md:p-4",
        className
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <h3 className="truncate text-[13px] font-semibold leading-tight text-[var(--color-text-primary)]">
            {title}
          </h3>
          {description && (
            <span className="hidden truncate text-xs text-[var(--color-text-muted)] @md:inline">
              · {description}
            </span>
          )}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}
