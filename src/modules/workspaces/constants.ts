import type { WorkspaceMode, WorkspaceStatus } from "./types";

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
