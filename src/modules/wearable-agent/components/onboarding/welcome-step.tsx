"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { useWearableBranding } from "../../branding-context";

/** First-run screen — deliberately not a splash that blocks interaction: it's a real, small,
 *  already-interactive screen with one clear action, matching the rest of the onboarding's
 *  "one question per screen" pattern. */
export function WelcomeStep() {
  const branding = useWearableBranding();

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
    </div>
  );
}
