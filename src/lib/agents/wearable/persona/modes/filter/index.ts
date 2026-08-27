import type { DirectPersonaSkill } from "../../skill";
import { runFilterMode } from "./run";

export {
  applyHardRules,
  buildFilter,
  isEmptyFilter,
  validateFilter,
  type BuildFilterInput,
  type FilterValidationResult,
} from "./build-filter";
export { runFilterMode };

export const filterSkill: DirectPersonaSkill = {
  mode: "filter",
  run: runFilterMode,
};
