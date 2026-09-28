import type { WorkspaceBranding } from "./types";

export function defaultBranding(): WorkspaceBranding {
  return {
    agentName: "Maya",
    welcomeMessage: "Hi! How can I help you today?",
    logoUrl: null,
    primaryColor: "#f76d01",
    fontFamily: "Inter",
    borderRadius: "16px",
    position: "bottom-right",
    displayMode: "fullpage",
    theme: "dark",
    liveTryOnEnabled: true,
    studioBackdropId: "backdrop-1",
    statusText: "Online — personalised for your profile",
    inputPlaceholder: "Ask about clothes, style, sizing…",
    quickReplies: null,
    signInMessage: "Save your profiles and pick up where you left off on any device.",
    launcherLabel: "Chat with us",
  };
}

/** Shopper-facing Live camera try-on. Missing/undefined counts as on so rows saved before
 *  this field existed keep today's button. Explicit `false` is the merchant kill switch. */
export function isLiveTryOnEnabled(branding?: Pick<WorkspaceBranding, "liveTryOnEnabled"> | null): boolean {
  return branding?.liveTryOnEnabled !== false;
}
