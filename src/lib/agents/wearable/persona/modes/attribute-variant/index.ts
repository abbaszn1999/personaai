import type { DirectPersonaSkill } from "../../skill";
import { runVariantMode } from "./run";

export { runVariantMode };

export const attributeVariantSkill: DirectPersonaSkill = {
  mode: "attribute_variant",
  run: runVariantMode,
};
