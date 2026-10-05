"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Shirt, Sparkles, UserRound } from "lucide-react";
import { AVATAR_GENERATION_STAGES, AVATAR_STYLE_LABELS } from "@/modules/wearable-agent/constants";
import { cn } from "@/lib/utils/cn";

interface AvatarGenerationLoadingProps {
  progress: number;
  stageIndex: number;
  /** The shopper's own face photo, shown inside the animated ring. */
  photoUrl?: string | null;
  /** How many of the avatar styles have finished so far. */
  arrived?: number;
}

/** The last stage ("Almost ready…") is a state, not a step the shopper waits through. */
const STEPS = AVATAR_GENERATION_STAGES.slice(0, -1);

/**
 * Waiting screen while the avatars are rendered. It shows the shopper's own photo inside a
 * slowly turning ring, the live percentage, the steps with a done/active/upcoming state, and one
 * tile per style that ticks as soon as that style finishes — so a wait of a minute or more
 * reads as visible progress rather than a bar creeping along. Single column on a phone; the
 * steps and styles sit side by side once the card is wide enough.
 */
export function AvatarGenerationLoading({ progress, stageIndex, photoUrl, arrived = 0 }: AvatarGenerationLoadingProps) {
  const stage = AVATAR_GENERATION_STAGES[stageIndex] ?? AVATAR_GENERATION_STAGES.at(-1)!;
  const percent = Math.round(Math.min(100, Math.max(0, progress)));

  return (
    <div
      className="flex flex-col items-center gap-5 px-5 py-6 text-center @lg:gap-8 @lg:px-10 @lg:py-12"
      role="status"
      aria-live="polite"
      aria-label={`Creating your avatar, ${percent}% — ${stage.label}`}
    >
      {/* Hero: photo in a turning ring */}
      <div className="relative h-28 w-28 shrink-0 @lg:h-44 @lg:w-44">
        <div aria-hidden className="absolute -inset-3 animate-pulse-dot rounded-full gradient-violet opacity-30 blur-2xl" />
        <div
          aria-hidden
          className="absolute inset-0 animate-spin-slow rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, var(--color-violet-from) 200deg, var(--color-violet-to) 330deg, transparent 360deg)",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))",
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))",
          }}
        />
        <div className="absolute inset-[7px] overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)] shadow-inner">
          {photoUrl ? (
            <Image src={photoUrl} alt="" fill sizes="176px" className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center gradient-violet">
              <UserRound className="h-14 w-14 text-white" />
            </div>
          )}
          {/* A soft light sweep over the photo while it is being worked on. */}
          <div
            aria-hidden
            className="skeleton absolute inset-0 !rounded-none opacity-25 mix-blend-overlay"
          />
        </div>
        <div className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full gradient-violet shadow-lg ring-4 ring-[var(--color-surface-card)]">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
      </div>

      {/* Title, percentage, bar */}
      <div className="w-full max-w-md space-y-4">
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)] @lg:text-2xl">Creating your avatar</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Building a personalized mannequin from your photo and measurements. Please keep this window open.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 text-left">
            <span className="min-w-0 truncate text-sm font-medium text-[var(--color-brand)]">{stage.label}</span>
            <span className="text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">
              {percent}
              <span className="text-sm font-semibold text-[var(--color-text-muted)]">%</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full gradient-violet transition-[width] duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Steps + styles */}
      <div className="grid w-full max-w-xl gap-4 text-left @lg:grid-cols-2">
        <ol className="space-y-1 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3">
          {STEPS.map((step, index) => {
            const done = index < stageIndex;
            const active = index === stageIndex;
            return (
              <li
                key={step.label}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors",
                  active && "bg-[var(--color-surface-card)] shadow-sm",
                )}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors",
                    done && "border-transparent gradient-violet text-white",
                    active && "border-[var(--color-brand)] text-[var(--color-brand)]",
                    !done && !active && "border-[var(--color-border)] text-[var(--color-text-muted)]",
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : active ? (
                    <span className="h-2 w-2 animate-pulse-dot rounded-full bg-[var(--color-brand)]" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1",
                    done && "text-[var(--color-text-secondary)]",
                    active && "font-medium text-[var(--color-text-primary)]",
                    !done && !active && "text-[var(--color-text-muted)]",
                  )}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="space-y-2 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Your {AVATAR_STYLE_LABELS.length} styles
          </p>
          <div className="grid grid-cols-3 gap-2">
            {AVATAR_STYLE_LABELS.map((label, index) => {
              const ready = index < arrived;
              return (
                <div
                  key={label}
                  className={cn(
                    "relative flex aspect-[5/6] flex-col @lg:aspect-[3/4] items-center justify-center gap-1.5 overflow-hidden rounded-lg border px-1 text-center transition-all duration-500",
                    ready
                      ? "border-[var(--color-violet-from)] bg-[var(--color-surface-card)] shadow-sm"
                      : "border-dashed border-[var(--color-border-strong,var(--color-border))]",
                  )}
                >
                  {!ready && <div aria-hidden className="skeleton absolute inset-0 !rounded-none opacity-60" />}
                  <span
                    className={cn(
                      "relative flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                      ready ? "gradient-violet text-white" : "bg-[var(--color-surface-card)] text-[var(--color-text-muted)]",
                    )}
                  >
                    {ready ? <Check className="h-4 w-4" /> : <Shirt className="h-4 w-4" />}
                  </span>
                  <span
                    className={cn(
                      "relative text-[11px] font-medium leading-tight",
                      ready ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]",
                    )}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
