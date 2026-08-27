import type { PersonaSkill } from "../../skill";

export {
  assembleBundles,
  buildCandidatePools,
  detectBundleScope,
  poolProducts,
  remainingCategories,
} from "./run";
export type { BundleCandidatePool } from "../../../stylist";

export const bundleSkill: PersonaSkill = {
  mode: "bundle",
};
