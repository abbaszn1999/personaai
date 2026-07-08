import type { WorkspaceMode } from "@/modules/workspaces/types";

export interface WorkspaceSetupForm {
  name: string;
  mode: WorkspaceMode | null;
}

export const SETUP_STEPS = [
  { id: "name",   label: "Name",   description: "Name your project" },
  { id: "mode",   label: "Mode",   description: "Choose product type" },
  { id: "review", label: "Review", description: "Confirm your project" },
] as const;

export type SetupStepId = (typeof SETUP_STEPS)[number]["id"];
