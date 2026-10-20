import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface StepPanelProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  /** Small status on the right of the header (a progress count, a "ready" tick). */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * One card of the combined measurements + photo screen: an icon chip, a title with one line of
 * guidance, an optional status on the right, then the content. Both halves of the screen use it so
 * they read as a matched pair, side by side on a wide card and stacked on a phone. The card sits a
 * shade off the surface behind it so the white fields inside stand out without heavy borders.
 */
export function StepPanel({ icon: Icon, title, description, aside, className, children }: StepPanelProps) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-[var(--radius-2xl)] border border-[var(--color-border)]",
        "bg-[var(--color-surface-base)]/70 p-4 @md:p-5",
        className
      )}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-tight text-[var(--color-text-primary)]">{title}</h3>
          <p className="mt-1 text-xs leading-snug text-[var(--color-text-muted)]">{description}</p>
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}
