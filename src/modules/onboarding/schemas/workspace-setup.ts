import type { WorkspaceMode } from "@/modules/workspaces/types";

export interface WorkspaceSetupForm {
  name: string;
  mode: WorkspaceMode | null;
  selectedCategoryIds: string[];
}

export const SETUP_STEPS = [
  { id: "name",       label: "Name",       description: "Name your workspace" },
  { id: "mode",       label: "Mode",       description: "Choose product type" },
  { id: "categories", label: "Categories", description: "Select product categories" },
  { id: "review",     label: "Review",     description: "Confirm your workspace" },
] as const;

export type SetupStepId = (typeof SETUP_STEPS)[number]["id"];
