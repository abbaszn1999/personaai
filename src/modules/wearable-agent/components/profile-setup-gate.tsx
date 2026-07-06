"use client";

import * as React from "react";
import { Shirt, ArrowRight, User } from "lucide-react";
import { BodyProfileForm } from "./body-profile-form";
import type { TryOnProfile } from "@/modules/wearable-agent/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface ProfileSetupGateProps {
  profile: TryOnProfile;
  profileComplete: boolean;
  onUpdate: (patch: Partial<TryOnProfile>) => void;
  onSubmit: () => void;
}

export function ProfileSetupGate({
  profile,
  profileComplete,
  onUpdate,
  onSubmit,
}: ProfileSetupGateProps) {
  return (
    <div className="max-w-lg mx-auto flex flex-col gap-6 py-4">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl gradient-wearable flex items-center justify-center shadow-lg">
            <Shirt className="h-8 w-8 text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-[var(--color-success)] border-2 border-white flex items-center justify-center">
            <User className="h-3 w-3 text-white" />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Set up your style profile</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-1.5 max-w-sm">
            Share your measurements so the AI can recommend the perfect fit and generate personalized try-on previews.
          </p>
        </div>

        {/* Steps preview */}
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
          {["Body details", "Chat with agent", "Generate try-on"].map((step, i) => (
            <React.Fragment key={step}>
              <div className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full",
                i === 0 ? "bg-[var(--color-brand-light)] text-[var(--color-brand)] font-semibold" : ""
              )}>
                <span className={cn(
                  "h-4 w-4 rounded-full text-[10px] flex items-center justify-center font-bold",
                  i === 0 ? "bg-[var(--color-brand)] text-white" : "bg-[var(--color-border)] text-[var(--color-text-muted)]"
                )}>
                  {i + 1}
                </span>
                {step}
              </div>
              {i < 2 && <ArrowRight className="h-3 w-3 shrink-0" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Form card */}
      <div className="card-elevated p-6">
        <BodyProfileForm profile={profile} onChange={onUpdate} />
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-2">
        <Button
          size="lg"
          onClick={onSubmit}
          disabled={!profileComplete}
          className={cn(profileComplete ? "gradient-wearable text-white border-0" : "")}
        >
          <Shirt className="h-4 w-4" />
          Start with Style Agent
          <ArrowRight className="h-4 w-4" />
        </Button>
        <button
          onClick={onSubmit}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors underline-offset-2 hover:underline"
        >
          Skip for now — continue without profile
        </button>
      </div>
    </div>
  );
}
