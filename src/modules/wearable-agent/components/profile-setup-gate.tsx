"use client";

import * as React from "react";
import { ArrowRight, Shirt, User } from "lucide-react";
import { BodyProfileForm } from "./body-profile-form";
import type { TryOnProfile } from "@/modules/wearable-agent/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface ProfileSetupGateProps {
  profile: TryOnProfile;
  profileComplete: boolean;
  onUpdate: (patch: Partial<TryOnProfile>) => void;
  onContinue: () => void;
}

export function ProfileSetupGate({
  profile,
  profileComplete,
  onUpdate,
  onContinue,
}: ProfileSetupGateProps) {
  return (
    <div className="flex flex-col gap-6 px-6 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl gradient-wearable flex items-center justify-center shadow-lg">
            <Shirt className="h-8 w-8 text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-[var(--color-success)] border-2 border-[var(--color-surface-card)] flex items-center justify-center">
            <User className="h-3 w-3 text-white" />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Set up your style profile</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-1.5 max-w-md">
            Add your face photo and measurements so we can build your personalized try-on avatar.
          </p>
        </div>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)]/50 p-6">
        <BodyProfileForm profile={profile} onChange={onUpdate} />
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button
          size="lg"
          onClick={onContinue}
          disabled={!profileComplete}
          className={cn(profileComplete ? "gradient-wearable text-white border-0" : "")}
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
        {!profileComplete && (
          <p className="text-xs text-[var(--color-text-muted)]">
            Fill in all fields to continue
          </p>
        )}
      </div>
    </div>
  );
}
