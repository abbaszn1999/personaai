import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary:
          "gradient-brand text-white shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-glow)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]",
        accent:
          "gradient-accent text-white shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]",
        secondary:
          "bg-[var(--color-surface-card)] text-[var(--color-text-primary)] border border-[var(--color-border)] shadow-sm hover:bg-[var(--color-surface-base)] hover:border-[var(--color-border-strong)] active:scale-[0.98]",
        ghost:
          "text-[var(--color-text-secondary)] hover:bg-[var(--color-brand-light)] hover:text-[var(--color-brand-strong)]",
        danger:
          "bg-[var(--color-error)] text-white shadow-sm hover:opacity-90 active:scale-[0.98]",
        outline:
          "border border-[var(--color-brand)] text-[var(--color-brand-strong)] hover:bg-[var(--color-brand-light)] active:scale-[0.98]",
      },
      size: {
        sm:  "h-8  px-3   text-xs  rounded-[var(--radius-md)]",
        md:  "h-9  px-4   text-sm  rounded-[var(--radius-md)]",
        lg:  "h-10 px-5   text-sm  rounded-[var(--radius-lg)]",
        xl:  "h-11 px-6   text-base rounded-[var(--radius-lg)]",
        icon:"h-9  w-9           rounded-[var(--radius-md)]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin-slow" />
      )}
      {children}
    </button>
  )
);

Button.displayName = "Button";
