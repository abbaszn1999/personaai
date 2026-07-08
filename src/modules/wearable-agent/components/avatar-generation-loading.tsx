"use client";

import * as React from "react";
import { Sparkles, UserRound } from "lucide-react";
import { AVATAR_GENERATION_STAGES } from "@/modules/wearable-agent/constants";
import { cn } from "@/lib/utils/cn";

interface AvatarGenerationLoadingProps {
  progress: number;
  stageIndex: number;
}

export function AvatarGenerationLoading({ progress, stageIndex }: AvatarGenerationLoadingProps) {
  const stage = AVATAR_GENERATION_STAGES[stageIndex] ?? AVATAR_GENERATION_STAGES.at(-1)!;

  return (
    <div className="flex flex-col items-center gap-8 px-8 py-12 text-center">
      <div className="relative">
        <div className="h-20 w-20 rounded-2xl gradient-wearable flex items-center justify-center shadow-lg">
          <UserRound className="h-10 w-10 text-white" />
        </div>
        <div className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-[var(--color-brand)] flex items-center justify-center animate-pulse-dot">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
      </div>

      <div className="space-y-2 max-w-sm">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Creating your avatar</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          We&apos;re building a personalized mannequin from your face photo and measurements.
        </p>
      </div>

      <div className="w-full max-w-md space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className={cn("font-medium transition-colors", progress > 0 ? "text-[var(--color-brand)]" : "text-[var(--color-text-muted)]")}>
            {stage.label}
          </span>
          <span className="text-[var(--color-text-muted)] tabular-nums">{Math.round(progress)}%</span>
        </div>

        <div className="h-2.5 rounded-full bg-[var(--color-surface-base)] border border-[var(--color-border)] overflow-hidden">
          <div
            className="h-full rounded-full gradient-wearable transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between gap-1 pt-1">
          {AVATAR_GENERATION_STAGES.map((s, i) => (
            <div
              key={s.label}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                i <= stageIndex ? "gradient-wearable" : "bg-[var(--color-border)]"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
