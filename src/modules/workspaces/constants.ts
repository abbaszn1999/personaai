import type { WorkspaceBranding } from "./types";

export function defaultBranding(): WorkspaceBranding {
  return {
    agentName: "Maya",
    welcomeMessage: "Hi! How can I help you today?",
    logoUrl: null,
    primaryColor: "#f76d01",
    fontFamily: "Inter",
    borderRadius: "12px",
    position: "bottom-right",
    displayMode: "fullpage",
    theme: "dark",
    liveTryOnEnabled: true,
  };
}

/** Shopper-facing Live camera try-on. Missing/undefined counts as on so rows saved before
 *  this field existed keep today's button. Explicit `false` is the merchant kill switch. */
export function isLiveTryOnEnabled(branding?: Pick<WorkspaceBranding, "liveTryOnEnabled"> | null): boolean {
  return branding?.liveTryOnEnabled !== false;
}
