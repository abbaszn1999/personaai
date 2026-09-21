"use client";

import * as React from "react";
import { Baby, User, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  /** Only a profile added after the very first one needs its own name — see WelcomeStep's old
   *  doc comment (this field replaces that now-removed screen; asking "who's this for" and
   *  "what should we call it" on the same first screen removes a whole tap for every shopper). */
  showNameField?: boolean;
  name?: string;
  onNameChange?: (name: string) => void;
}

export function AudienceStep({
  value,
  onSelect,
  showNameField = false,
  name = "",
  onNameChange,
}: AudienceStepProps) {
  // Local echo so the field can be freely cleared and retyped — see WelcomeStep's original
  // reasoning: the parent ignores a blank value rather than storing it, so mirroring its prop
  // straight into the input would snap the last saved name right back on backspace.
  const [draft, setDraft] = React.useState(name);
  const nameComplete = !showNameField || draft.trim() !== "";

  return (
    <div className="flex flex-col gap-5">
      {showNameField && (
        <div className="mx-auto w-full max-w-[220px] text-left animate-fade-in">
          <Input
            inputSize="touch"
            label="Whose profile is this?"
            placeholder="e.g. Alex, Mom, Sara"
            maxLength={40}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onNameChange?.(e.target.value);
            }}
            autoFocus
          />
        </div>
      )}
      <div className="text-center">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Who&apos;s trying this on?</h2>
        <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
          This helps us tailor the questions that follow.
        </p>
      </div>
      <div
        className={cn(
          "grid grid-cols-2 gap-3 sm:grid-cols-3 transition-opacity",
          !nameComplete && "pointer-events-none opacity-40"
        )}
      >
        {AUDIENCE_OPTIONS.map(({ id, label, icon: Icon }, i) => (
          <button
            key={id}
            type="button"
            disabled={!nameComplete}
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
      {!nameComplete && (
        <p className="text-center text-xs text-[var(--color-text-muted)]">
          Add a name for this profile to continue
        </p>
      )}
    </div>
  );
}
