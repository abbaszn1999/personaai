export interface WorkspaceSetupForm {
  name: string;
}

export const SETUP_STEPS = [
  { id: "name",   label: "Name",   description: "Name your project" },
  { id: "review", label: "Review", description: "Confirm your project" },
] as const;

export type SetupStepId = (typeof SETUP_STEPS)[number]["id"];
