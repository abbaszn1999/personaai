import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Autommerce brand logo.
 *
 * Variants:
 *  - "mark"  : the triangular "A" symbol only
 *  - "full"  : symbol + "Autommerce" wordmark (company)
 *  - "tool"  : symbol + "AutoShopping" with "by Autommerce" caption (the product)
 */
type LogoVariant = "mark" | "full" | "tool";

interface LogoProps {
  variant?: LogoVariant;
  className?: string;
  markClassName?: string;
  /** Height of the mark in px. Wordmark scales relative to it. */
  size?: number;
  /** Use light wordmark text (for dark backgrounds). */
  inverted?: boolean;
}

export function Logo({
  variant = "full",
  className,
  markClassName,
  size = 32,
  inverted = false,
}: LogoProps) {
  if (variant === "mark") {
    return <LogoMark size={size} className={cn(markClassName, className)} />;
  }

  const textColor = inverted ? "text-white" : "text-[var(--color-text-primary)]";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} className={markClassName} />
      {variant === "full" ? (
        <span
          className={cn("font-display font-extrabold leading-none tracking-tight", textColor)}
          style={{ fontSize: size * 0.6 }}
        >
          Autommerce
        </span>
      ) : (
        <div className="flex flex-col leading-none">
          <span
            className={cn("font-display font-extrabold tracking-tight", textColor)}
            style={{ fontSize: size * 0.56 }}
          >
            AutoShopping
          </span>
          <span
            className={cn(
              "font-medium tracking-wide mt-0.5",
              inverted ? "text-white/60" : "text-[var(--color-text-muted)]"
            )}
            style={{ fontSize: size * 0.26 }}
          >
            by Autommerce
          </span>
        </div>
      )}
    </div>
  );
}

/* ── The triangular "A" symbol ───────────────────────────────────────────── */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = React.useId();
  const orange = `orange-${id}`;
  const purple = `purple-${id}`;
  const red = `red-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Autommerce"
    >
      <defs>
        <linearGradient id={orange} x1="60" y1="14" x2="60" y2="70" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8A2B" />
          <stop offset="0.55" stopColor="#F76D01" />
          <stop offset="1" stopColor="#DC3708" />
        </linearGradient>
        <linearGradient id={purple} x1="22" y1="60" x2="98" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9A6BB0" />
          <stop offset="0.5" stopColor="#6B358D" />
          <stop offset="1" stopColor="#400095" />
        </linearGradient>
        <linearGradient id={red} x1="60" y1="62" x2="60" y2="86" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C40000" />
          <stop offset="1" stopColor="#79081D" />
        </linearGradient>
      </defs>

      {/* Orange peaks (the "A" / mountain) */}
      <path
        d="M63 16 L75 20 L60.5 64 L47 60 Z"
        fill={`url(#${orange})`}
        strokeLinejoin="round"
      />
      <path
        d="M44 38 L53.5 41 L46 64 L35.5 61 Z"
        fill={`url(#${orange})`}
        strokeLinejoin="round"
      />

      {/* Purple arc cradling the peaks */}
      <path
        d="M22 56 Q60 96 98 56"
        stroke={`url(#${purple})`}
        strokeWidth="14"
        strokeLinecap="round"
        fill="none"
      />

      {/* Red feet */}
      <path d="M25 66 L40 64 L37 82 L22 82 Z" fill={`url(#${red})`} strokeLinejoin="round" />
      <path d="M80 64 L95 66 L98 82 L83 82 Z" fill={`url(#${red})`} strokeLinejoin="round" />
    </svg>
  );
}
