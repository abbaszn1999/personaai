"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { useTryOnAgent, type EmbedRuntimeConfig } from "../hooks/use-try-on-agent";
import { OnboardingShell } from "./onboarding/onboarding-shell";
import { WelcomeStep } from "./onboarding/welcome-step";
import { AudienceStep } from "./onboarding/audience-step";
import { MeasurementsStep } from "./onboarding/measurements-step";
import { PhotoStep } from "./onboarding/photo-step";
import { AvatarGenerationLoading } from "./avatar-generation-loading";
import { AvatarVariationPicker } from "./avatar-variation-picker";
import { PreviewViewportShell } from "./preview-viewport-shell";
import { TryOnAgentChat } from "./try-on-agent-chat";
import { ProfileSwitcher } from "./profile-switcher";
import type { PreviewViewportMode } from "./preview-viewport-toggle";
import type { OnboardingPhase } from "@/modules/wearable-agent/types";
import { WearableThemeProvider, type WearableTheme } from "../theme-context";
import { WearableBrandingProvider, type WearableBranding } from "../branding-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface TryOnLayoutProps {
  viewportMode?: PreviewViewportMode;
  /** Set only by the public `/embed/[token]` page and widget.js — swaps every backend call
   *  for its public, no-login `/api/embed/*` counterpart. */
  embed?: EmbedRuntimeConfig;
  /** "dark" (default, matches the dashboard's own studio look) or "light" — set from
   *  workspace branding for the embed page / widget so the whole preview is one consistent
   *  tone instead of a dark avatar panel next to a light chat panel. */
  theme?: WearableTheme;
  /** Workspace branding — agent name / logo shown in the chat header + message avatars,
   *  the first message sent once onboarding finishes, and the corner radius of the whole
   *  widget box. Falls back to the dashboard's own defaults when omitted (internal test
   *  pages that aren't previewing a specific merchant's branding). */
  branding?: Partial<WearableBranding> & { welcomeMessage?: string; borderRadius?: string };
  workspaceId?: string;
}

/** The steps that share OnboardingShell's chrome. Kept as one list so the shell below can be a
 *  single, persistent element: rendering a separate `<OnboardingShell>` per step would make
 *  React unmount and remount it on every transition, resetting the shell's own slide-direction
 *  state so back navigation could never animate backwards. */
const ONBOARDING_STEPS = ["welcome", "audience", "measurements", "photo"] as const;

function isOnboardingStep(phase: OnboardingPhase): boolean {
  return (ONBOARDING_STEPS as readonly OnboardingPhase[]).includes(phase);
}

export function TryOnLayout({ viewportMode = "desktop", embed, theme = "dark", branding, workspaceId }: TryOnLayoutProps) {
  const agent = useTryOnAgent(embed, branding?.welcomeMessage, workspaceId);

  const activeProfileLabel = agent.profiles.find((p) => p.id === agent.activeProfileId)?.label ?? "";
  // The auto-assigned placeholder ("Profile 1", "Profile 2"...) isn't a name the shopper
  // chose — show the field empty so typing doesn't feel like editing existing text.
  const hasCustomLabel =
    activeProfileLabel.trim() !== "" && !/^Profile \d+$/.test(activeProfileLabel.trim());
  const profileNameComplete = agent.profiles.length === 1 || hasCustomLabel;

  function renderStepBody() {
    switch (agent.onboardingPhase) {
      case "welcome":
        return (
          <WelcomeStep
            key={agent.activeProfileId}
            showNameField={agent.profiles.length > 1}
            name={hasCustomLabel ? activeProfileLabel : ""}
            onNameChange={(name) => agent.renameProfile(agent.activeProfileId, name)}
          />
        );
      case "audience":
        return <AudienceStep value={agent.profile.audience} onSelect={agent.selectAudience} />;
      case "measurements":
        return <MeasurementsStep profile={agent.profile} onChange={agent.updateProfile} />;
      case "photo":
        return (
          <PhotoStep profile={agent.profile} error={agent.avatarGenerationError} onChange={agent.updateProfile} />
        );
      default:
        return null;
    }
  }

  function renderStepFooter() {
    switch (agent.onboardingPhase) {
      case "welcome":
        return (
          <>
            <Button
              size="lg"
              onClick={() => agent.goToStep("audience")}
              disabled={!profileNameComplete}
              className={cn(profileNameComplete ? "gradient-wearable text-white border-0" : "")}
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Button>
            {!profileNameComplete && (
              <p className="text-xs text-[var(--color-text-muted)]">Add a name for this profile to continue</p>
            )}
          </>
        );
      // Picking an audience card advances on its own, so this step has no footer at all.
      case "audience":
        return null;
      case "measurements":
        return (
          <>
            <Button
              size="lg"
              onClick={() => agent.goToStep("photo")}
              disabled={!agent.measurementsComplete}
              className={cn(agent.measurementsComplete ? "gradient-wearable text-white border-0" : "")}
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
            {!agent.measurementsComplete && (
              <p className="text-xs text-[var(--color-text-muted)]">Fill in all fields to continue</p>
            )}
          </>
        );
      case "photo":
        return (
          <>
            <Button
              size="lg"
              onClick={agent.startAvatarGeneration}
              disabled={!agent.profileComplete}
              className={cn(agent.profileComplete ? "gradient-wearable text-white border-0" : "")}
            >
              Create my avatar
              <ArrowRight className="h-4 w-4" />
            </Button>
            {!agent.profileComplete && (
              <p className="text-xs text-[var(--color-text-muted)]">Add a photo to continue</p>
            )}
          </>
        );
      default:
        return null;
    }
  }

  return (
    <WearableThemeProvider theme={theme}>
      <WearableBrandingProvider branding={branding}>
        <div
          className={cn("relative h-full min-h-0 overflow-hidden", theme === "dark" && "dark")}
          style={branding?.borderRadius ? { borderRadius: branding.borderRadius } : undefined}
        >
          {embed && !agent.profileSubmitted && (
            <ProfileSwitcher
              className="absolute right-3 top-3"
              profiles={agent.profiles}
              activeProfileId={agent.activeProfileId}
              maxProfiles={agent.maxProfiles}
              onSwitch={agent.switchProfile}
              onAdd={agent.addProfile}
              onRemove={agent.removeProfile}
              onRename={agent.renameProfile}
            />
          )}
          {agent.cartSyncError && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-50 flex justify-center px-4">
              <div className="max-w-[90%] rounded-2xl bg-red-500/95 px-4 py-2.5 text-xs font-medium leading-relaxed text-white shadow-lg backdrop-blur-sm">
                {agent.cartSyncError}
              </div>
            </div>
          )}
          {agent.profileSubmitted ? (
            <PreviewViewportShell mode={viewportMode} layout="full" frameless={!!embed}>
              <TryOnAgentChat agent={agent} viewportMode={viewportMode} embed={embed} workspaceId={workspaceId} />
            </PreviewViewportShell>
          ) : (
            <PreviewViewportShell mode={viewportMode} layout="card" frameless={!!embed}>
              {isOnboardingStep(agent.onboardingPhase) && (
                <OnboardingShell
                  step={agent.onboardingPhase}
                  onBack={agent.goBack}
                  footer={renderStepFooter()}
                >
                  {renderStepBody()}
                </OnboardingShell>
              )}

              {agent.onboardingPhase === "generating" && (
                <AvatarGenerationLoading
                  progress={agent.generationProgress}
                  stageIndex={agent.generationStageIndex}
                />
              )}

              {agent.onboardingPhase === "avatar-selection" && (
                <AvatarVariationPicker
                  variations={agent.avatarVariations}
                  selectedId={agent.selectedAvatarId}
                  customAvatarUrl={agent.customAvatarUrl}
                  onSelect={agent.selectAvatar}
                  onUploadCustom={agent.uploadCustomAvatar}
                  onConfirm={agent.confirmAvatar}
                />
              )}
            </PreviewViewportShell>
          )}
        </div>
      </WearableBrandingProvider>
    </WearableThemeProvider>
  );
}
