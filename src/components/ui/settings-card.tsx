import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface SettingsCardProps {
  id?: string;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Muted note on the left of the footer bar. */
  footer?: React.ReactNode;
  /** Button (or buttons) on the right of the footer bar. */
  action?: React.ReactNode;
  tone?: "default" | "danger";
  className?: string;
}

/** One setting per card: heading, controls, then a footer bar with a hint and the action that
 *  applies it. Pages stack these in a single column. */
export function SettingsCard({
  id,
  title,
  description,
  children,
  footer,
  action,
  tone = "default",
  className,
}: SettingsCardProps) {
  const danger = tone === "danger";
  return (
    <section
      id={id}
      className={cn(
        "card-base overflow-hidden scroll-mt-6",
        danger && "border-[color-mix(in_srgb,var(--color-error-solid)_45%,transparent)]",
        className
      )}
    >
      <div className="space-y-5 p-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
          {description && <p className="text-sm text-[var(--color-text-muted)]">{description}</p>}
        </div>
        {children}
      </div>
      {(footer || action) && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 border-t px-6 py-3",
            danger
              ? "border-[color-mix(in_srgb,var(--color-error-solid)_35%,transparent)] bg-[var(--color-error-light)]"
              : "border-[var(--color-border)] bg-[var(--color-surface-base)]"
          )}
        >
          <div className="min-w-0 text-xs text-[var(--color-text-muted)]">{footer}</div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
    </section>
  );
}

/** A labelled line inside a card: text on the left, control or status on the right. */
export function SettingsRow({
  icon,
  title,
  description,
  children,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
      {icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)]">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{title}</p>
        {description && <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

export function StatusBadge({ tone, children }: { tone: "success" | "warning" | "neutral" | "danger"; children: React.ReactNode }) {
  const tones = {
    success: "bg-[var(--color-success-light)] text-[var(--color-success)]",
    warning: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
    danger: "bg-[var(--color-error-light)] text-[var(--color-error)]",
    neutral: "bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]",
  } as const;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[var(--radius-md)] bg-[var(--color-error-light)] px-3 py-2 text-sm text-[var(--color-error)]">
      {children}
    </p>
  );
}
