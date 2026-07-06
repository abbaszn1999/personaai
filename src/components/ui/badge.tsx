import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 whitespace-nowrap",
  {
    variants: {
      variant: {
        default:    "bg-[var(--color-brand-light)] text-[var(--color-brand)]",
        success:    "bg-[var(--color-success-light)] text-[var(--color-success)]",
        warning:    "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
        error:      "bg-[var(--color-error-light)] text-[var(--color-error)]",
        info:       "bg-[var(--color-info-light)] text-[var(--color-info)]",
        neutral:    "bg-[var(--color-surface-base)] text-[var(--color-text-secondary)] border border-[var(--color-border)]",
        wearable:   "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
        unwearable: "bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
