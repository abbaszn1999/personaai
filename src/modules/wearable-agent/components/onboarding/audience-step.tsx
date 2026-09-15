"use client";

import * as React from "react";
import { Baby, User, Users } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { TryOnAudience } from "@/modules/wearable-agent/types";

interface AudienceOption {
  id: TryOnAudience;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const AUDIENCE_OPTIONS: AudienceOption[] = [
  { id: "woman", label: "Woman", icon: User },
  { id: "man", label: "Man", icon: User },
  { id: "unisex", label: "Unisex", icon: Users },
  { id: "kids-boy", label: "Kids · Boy", icon: Baby },
  { id: "kids-girl", label: "Kids · Girl", icon: Baby },
  { id: "kids-unisex", label: "Kids · Unisex", icon: Baby },
];

interface AudienceStepProps {
  value: TryOnAudience | null;
  /** Selecting a card advances immediately (Typeform-style, one question per screen) — this
   *  step never has its own footer button. */
  onSelect: (audience: TryOnAudience) => void;
}

export function AudienceStep({ value, onSelect }: AudienceStepProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Who&apos;s trying this on?</h2>
        <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
          This helps us tailor the questions that follow.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {AUDIENCE_OPTIONS.map(({ id, label, icon: Icon }, i) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            style={{ animationDelay: `${i * 0.05}s` }}
            className={cn(
              "animate-scale-in flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-[var(--radius-xl)] border-2 p-4 text-center transition-colors",
              value === id
                ? "border-[var(--color-wearable-from)] bg-[var(--color-accent-light)]/40"
                : "border-[var(--color-border)] hover:border-[var(--color-wearable-from)] hover:bg-[var(--color-accent-light)]/20"
            )}
          >
            <Icon className="h-6 w-6 text-[var(--color-text-secondary)]" />
            <span className="text-sm font-medium text-[var(--color-text-primary)]">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
