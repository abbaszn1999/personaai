"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { useTryOnAgent, type EmbedRuntimeConfig, type ShopperProfileBridge } from "../hooks/use-try-on-agent";
import { useShopperAuth } from "../hooks/use-shopper-auth";
import { EmbedShopperSessionContext } from "../hooks/embed-shopper-session";
import { ShopperSignIn } from "./onboarding/shopper-sign-in";
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
   *  for its public `/api/embed/*` counterpart, and requires a shopper sign-in before the
   *  fitting-room UI mounts. */
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
const ONBOARDING_STEPS = ["welcome", "audience", "measurements"] as const;

function isOnboardingStep(phase: OnboardingPhase): boolean {
  return (ONBOARDING_STEPS as readonly OnboardingPhase[]).includes(phase);
}

export function TryOnLayout({ viewportMode = "desktop", embed, theme = "dark", branding, workspaceId }: TryOnLayoutProps) {
  return (
    <WearableThemeProvider theme={theme}>
      <WearableBrandingProvider branding={branding}>
        <div
          className={cn("relative h-full min-h-0 overflow-hidden", theme === "dark" && "dark")}
          style={branding?.borderRadius ? { borderRadius: branding.borderRadius } : undefined}
        >
          {embed ? (
            <EmbeddedTryOn
              viewportMode={viewportMode}
              embed={embed}
              branding={branding}
              workspaceId={workspaceId}
            />
          ) : (
            <TryOnExperience viewportMode={viewportMode} branding={branding} workspaceId={workspaceId} />
          )}
        </div>
      </WearableBrandingProvider>
    </WearableThemeProvider>
  );
}

function EmbeddedTryOn({
  viewportMode,
  embed,
  branding,
  workspaceId,
}: {
  viewportMode: PreviewViewportMode;
  embed: EmbedRuntimeConfig;
  branding?: TryOnLayoutProps["branding"];
  workspaceId?: string;
}) {
  const shopper = useShopperAuth(embed);

  if (shopper.status === "loading") {
    return (
      <PreviewViewportShell mode={viewportMode} layout="card" frameless>
        <div className="flex min-h-[320px] items-center justify-center py-16">
          <div className="h-8 w-8 rounded-full border-2 border-[var(--color-brand)] border-t-transparent animate-spin" />
        </div>
      </PreviewViewportShell>
    );
  }

  if (shopper.status === "signed-out") {
    return (
      <PreviewViewportShell mode={viewportMode} layout="card" frameless>
        <ShopperSignIn error={shopper.error} onRequestCode={shopper.requestCode} onVerifyCode={shopper.verifyCode} />
      </PreviewViewportShell>
    );
  }

  return (
    <EmbedShopperSessionContext.Provider
      value={{ email: shopper.account?.email ?? "", signOut: () => void shopper.signOut() }}
    >
      <TryOnExperience
        viewportMode={viewportMode}
        embed={embed}
        branding={branding}
        workspaceId={workspaceId}
        shopper={{
          profiles: shopper.profiles,
          createProfile: shopper.createProfile,
          updateProfile: shopper.updateProfile,
        }}
      />
    </EmbedShopperSessionContext.Provider>
  );
}

function TryOnExperience({
  viewportMode,
  embed,
  branding,
  workspaceId,
  shopper,
}: {
  viewportMode: PreviewViewportMode;
  embed?: EmbedRuntimeConfig;
  branding?: TryOnLayoutProps["branding"];
  workspaceId?: string;
  shopper?: ShopperProfileBridge;
}) {
  const agent = useTryOnAgent(embed, branding?.welcomeMessage, workspaceId, shopper);
  const shopperSession = React.useContext(EmbedShopperSessionContext);

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
      // Measurements + photo now share one screen — one fewer tap between "who's this for"
      // and avatar generation actually kicking off.
      case "measurements":
        return (
          <div className="flex flex-col gap-6">
            <MeasurementsStep profile={agent.profile} onChange={agent.updateProfile} />
            <div className="h-px bg-[var(--color-border)]" />
            <PhotoStep profile={agent.profile} error={agent.avatarGenerationError} onChange={agent.updateProfile} />
          </div>
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
              onClick={agent.startAvatarGeneration}
              disabled={!agent.profileComplete}
              className={cn(agent.profileComplete ? "gradient-wearable text-white border-0" : "")}
            >
              Create my avatar
              <ArrowRight className="h-4 w-4" />
            </Button>
            {!agent.profileComplete && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {agent.measurementsComplete ? "Add a photo to continue" : "Fill in all fields and add a photo to continue"}
              </p>
            )}
          </>
        );
      default:
        return null;
    }
  }

  return (
    <>
          {embed && !agent.profileSubmitted && (
            <ProfileSwitcher
              className="absolute left-3 top-3"
              profiles={agent.profiles}
              activeProfileId={agent.activeProfileId}
              maxProfiles={agent.maxProfiles}
              onSwitch={agent.switchProfile}
              onAdd={agent.addProfile}
              onRename={agent.renameProfile}
              accountEmail={shopperSession?.email}
              onSignOut={shopperSession?.signOut}
            />
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
                  partialNote={agent.avatarPartialNote}
                  onSelect={agent.selectAvatar}
                  onUploadCustom={agent.uploadCustomAvatar}
                  onConfirm={agent.confirmAvatar}
                />
              )}
            </PreviewViewportShell>
          )}
    </>
  );
}
