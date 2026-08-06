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

export function defaultBrandingForMode(mode: WorkspaceMode): WorkspaceBranding {
  return {
    agentName: "Maya",
    welcomeMessage: "Hi! How can I help you today?",
    logoUrl: null,
    primaryColor: "#f76d01",
    fontFamily: "Inter",
    borderRadius: "12px",
    position: "bottom-right",
    // wearable is always full-page; unwearable defaults to floating
    displayMode: mode === "wearable" ? "fullpage" : "floating",
    theme: "dark",
  };
}
