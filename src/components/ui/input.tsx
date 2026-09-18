import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  /** "default" (36px/14px, dashboard forms) or "touch" (48px/16px). Touch avoids two mobile
   *  papercuts: iOS Safari auto-zooms on focus below 16px, and 36px misses the 44-48px minimum
   *  tap target. Opt-in only — the dashboard's own forms keep their current density. */
  inputSize?: "default" | "touch";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, icon, id, inputSize = "default", ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[var(--color-text-secondary)]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
              {icon}
            </span>
          )}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              "w-full px-3 bg-[var(--color-surface-card)] border border-[var(--color-border)] rounded-[var(--radius-md)]",
              inputSize === "touch" ? "h-12 text-base" : "h-9 text-sm",
              "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
              "transition-colors focus:outline-none focus:border-[var(--color-brand)] focus:ring-1 focus:ring-[var(--color-brand)]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              error && "border-[var(--color-error)] focus:ring-[var(--color-error)]",
              icon && "pl-9",
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
        {hint && !error && <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
