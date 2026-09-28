"use client";

import * as React from "react";
import { WEARABLE_QUICK_REPLIES, type WearableQuickReply } from "./mocks/responses";

export interface WearableBranding {
  agentName: string;
  logoUrl: string | null;
  /** When false, the Image/Live camera switch is hidden. Default on. */
  liveTryOnEnabled: boolean;
  /** Built-in studio plate id chosen by the merchant. */
  studioBackdropId: string;
  statusText: string;
  inputPlaceholder: string;
  /** Resolved chips; empty means the merchant turned them off. */
  quickReplies: WearableQuickReply[];
  signInMessage: string;
  launcherLabel: string;
}

export interface WearableBrandingInput extends Partial<Omit<WearableBranding, "quickReplies">> {
  /** `null`/missing uses the built-in suggestions; an empty array hides them. */
  quickReplies?: string[] | null;
}

const DEFAULT_BRANDING: WearableBranding = {
  agentName: "Style Assistant",
  logoUrl: null,
  liveTryOnEnabled: true,
  studioBackdropId: "backdrop-1",
  statusText: "Online — personalised for your profile",
  inputPlaceholder: "Ask about clothes, style, sizing…",
  quickReplies: WEARABLE_QUICK_REPLIES,
  signInMessage: "Save your profiles and pick up where you left off on any device.",
  launcherLabel: "Chat with us",
};

export function resolveWearableBranding(branding?: WearableBrandingInput): WearableBranding {
  return {
    agentName: branding?.agentName || DEFAULT_BRANDING.agentName,
    logoUrl: branding?.logoUrl ?? DEFAULT_BRANDING.logoUrl,
    liveTryOnEnabled: branding?.liveTryOnEnabled !== false,
    studioBackdropId: branding?.studioBackdropId || DEFAULT_BRANDING.studioBackdropId,
    statusText: branding?.statusText?.trim() || DEFAULT_BRANDING.statusText,
    inputPlaceholder: branding?.inputPlaceholder?.trim() || DEFAULT_BRANDING.inputPlaceholder,
    quickReplies: Array.isArray(branding?.quickReplies)
      ? branding.quickReplies.map((label) => ({ label, query: label }))
      : DEFAULT_BRANDING.quickReplies,
    signInMessage: branding?.signInMessage?.trim() || DEFAULT_BRANDING.signInMessage,
    launcherLabel: branding?.launcherLabel?.trim() || DEFAULT_BRANDING.launcherLabel,
  };
}

const WearableBrandingContext = React.createContext<WearableBranding>(DEFAULT_BRANDING);

export function WearableBrandingProvider({
  branding,
  children,
}: {
  branding?: WearableBrandingInput;
  children: React.ReactNode;
}) {
  const value = resolveWearableBranding(branding);
  return <WearableBrandingContext.Provider value={value}>{children}</WearableBrandingContext.Provider>;
}

export function useWearableBranding(): WearableBranding {
  return React.useContext(WearableBrandingContext);
}
