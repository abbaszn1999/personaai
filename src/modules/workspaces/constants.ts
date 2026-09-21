import type { WorkspaceMode, WorkspaceStatus, WorkspaceBranding } from "./types";

export const WORKSPACE_MODE_LABELS: Record<WorkspaceMode, string> = {
  wearable: "Wearable",
  unwearable: "Unwearable",
};

export const WORKSPACE_MODE_DESCRIPTIONS: Record<WorkspaceMode, string> = {
  wearable: "Virtual try-on for clothing, shoes, and accessories",
  unwearable: "AI shopping assistant for electronics, home, and appliances",
};

export const WORKSPACE_STATUS_LABELS: Record<WorkspaceStatus, string> = {
  active: "Active",
  draft: "Draft",
  paused: "Paused",
};

// Every project is a wearable (virtual try-on) agent now, so there's only one default
// branding shape — the unwearable floating-launcher default has been retired.
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
