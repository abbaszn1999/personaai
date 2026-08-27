import type { DirectPersonaSkill } from "../../skill";
import { runCosineMode } from "./run";

export { buildQueryStatement, fallbackStatement, type BuildStatementInput } from "./build-statement";
export { runCosineMode };

export const cosineSkill: DirectPersonaSkill = {
  mode: "cosine",
  run: runCosineMode,
};
