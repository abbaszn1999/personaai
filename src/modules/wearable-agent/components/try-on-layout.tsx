"use client";

import * as React from "react";
import { useTryOnAgent } from "../hooks/use-try-on-agent";
import { ProfileSetupGate } from "./profile-setup-gate";
import { TryOnAgentChat } from "./try-on-agent-chat";

export function TryOnLayout() {
  const agent = useTryOnAgent();

  if (!agent.profileSubmitted) {
    return (
      <ProfileSetupGate
        profile={agent.profile}
        profileComplete={agent.profileComplete}
        onUpdate={agent.updateProfile}
        onSubmit={agent.submitProfile}
      />
    );
  }

  return <TryOnAgentChat agent={agent} />;
}
