"use client";

import * as React from "react";
import { useTryOnAgent } from "../hooks/use-try-on-agent";
import { ProfileSetupGate } from "./profile-setup-gate";
import { AvatarGenerationLoading } from "./avatar-generation-loading";
import { AvatarVariationPicker } from "./avatar-variation-picker";
import { PreviewViewportShell } from "./preview-viewport-shell";
import { TryOnAgentChat } from "./try-on-agent-chat";
import type { PreviewViewportMode } from "./preview-viewport-toggle";

interface TryOnLayoutProps {
  viewportMode?: PreviewViewportMode;
}

export function TryOnLayout({ viewportMode = "desktop" }: TryOnLayoutProps) {
  const agent = useTryOnAgent();

  if (agent.profileSubmitted) {
    return (
      <PreviewViewportShell mode={viewportMode} layout="full">
        <TryOnAgentChat agent={agent} viewportMode={viewportMode} />
      </PreviewViewportShell>
    );
  }

  return (
    <PreviewViewportShell mode={viewportMode} layout="card">
      {agent.onboardingPhase === "profile" && (
        <ProfileSetupGate
          profile={agent.profile}
          profileComplete={agent.profileComplete}
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
  );
}
