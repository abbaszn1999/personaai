"use client";

import * as React from "react";
import { useTryOnAgent, type EmbedRuntimeConfig } from "../hooks/use-try-on-agent";
import { ProfileSetupGate } from "./profile-setup-gate";
import { AvatarGenerationLoading } from "./avatar-generation-loading";
import { AvatarVariationPicker } from "./avatar-variation-picker";
import { PreviewViewportShell } from "./preview-viewport-shell";
import { TryOnAgentChat } from "./try-on-agent-chat";
import type { PreviewViewportMode } from "./preview-viewport-toggle";
import { WearableThemeProvider, type WearableTheme } from "../theme-context";
import { WearableBrandingProvider, type WearableBranding } from "../branding-context";
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

export function TryOnLayout({ viewportMode = "desktop", embed, theme = "dark", branding, workspaceId }: TryOnLayoutProps) {
  const agent = useTryOnAgent(embed, branding?.welcomeMessage, workspaceId);

  return (
    <WearableThemeProvider theme={theme}>
      <WearableBrandingProvider branding={branding}>
        <div
          className={cn("relative h-full min-h-0 overflow-hidden", theme === "dark" && "dark")}
          style={branding?.borderRadius ? { borderRadius: branding.borderRadius } : undefined}
        >
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
              {agent.onboardingPhase === "profile" && (
                <ProfileSetupGate
                  profile={agent.profile}
                  profileComplete={agent.profileComplete}
                  error={agent.avatarGenerationError}
                  onUpdate={agent.updateProfile}
                  onContinue={agent.startAvatarGeneration}
                />
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
