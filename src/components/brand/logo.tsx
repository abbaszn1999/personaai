import { cn } from "@/lib/utils/cn";

/**
 * Autommerce brand logo.
 *
 * Variants:
 *  - "mark"  : the triangular "A" symbol only
 *  - "full"  : symbol + "Autommerce" wordmark (company)
 *  - "tool"  : symbol + "Persona AI" with "by Autommerce" caption (the product)
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
            Persona AI
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

/** Official mark. White on dark surfaces, full color on light. Both sit in the
 *  box and CSS picks one from `html[data-theme]` so the first paint matches. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Autommerce"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/autommerce-white.png"
        alt=""
        className="theme-icon-for-dark h-full w-full object-contain"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/autommerce-natural.png"
        alt=""
        className="theme-icon-for-light h-full w-full object-contain"
      />
    </span>
  );
}
