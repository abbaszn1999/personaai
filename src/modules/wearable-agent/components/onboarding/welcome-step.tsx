"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useWearableBranding } from "../../branding-context";

interface WelcomeStepProps {
  /** Only the very first profile on a device skips this — it's obviously "me", asking would
   *  just be friction. Every profile added after that shares the switcher with others, so it
   *  needs its own name instead of inheriting the generic "Profile N" → "Me" auto-label,
   *  which left every adult profile on a shared device indistinguishably called "Me". */
  showNameField?: boolean;
  name?: string;
  onNameChange?: (name: string) => void;
}

/** First-run screen — deliberately not a splash that blocks interaction: it's a real, small,
 *  already-interactive screen with one clear action, matching the rest of the onboarding's
 *  "one question per screen" pattern. */
export function WelcomeStep({ showNameField = false, name = "", onNameChange }: WelcomeStepProps) {
  const branding = useWearableBranding();
  // Local echo so the field can be freely cleared and retyped: the parent (`renameProfile`)
  // ignores a blank value rather than storing it, so mirroring its prop straight into the
  // input would snap the last saved name right back the moment a shopper backspaces it out.
  const [draft, setDraft] = React.useState(name);

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="animate-scale-in">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl gradient-wearable shadow-lg animate-float">
          <Sparkles className="h-9 w-9 text-white" />
        </div>
      </div>
      <div className="animate-fade-in" style={{ animationDelay: "0.08s" }}>
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Meet {branding.agentName}</h2>
        <p className="mt-2 max-w-xs text-sm text-[var(--color-text-muted)]">
          Answer a few quick questions and we&apos;ll build your personal avatar to try on anything in the
          store.
        </p>
      </div>
      {showNameField && (
        <div className="w-full max-w-[220px] animate-fade-in text-left" style={{ animationDelay: "0.14s" }}>
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
          />
        </div>
      )}
    </div>
  );
}
