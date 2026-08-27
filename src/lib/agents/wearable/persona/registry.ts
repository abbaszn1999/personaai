import { RETRIEVAL_MODES, type RetrievalMode } from "@/lib/retrieval/types";
import { loadSkill, type SkillDoc } from "../load-skill";
import { askSkill } from "./modes/ask";
import { attributeVariantSkill } from "./modes/attribute-variant";
import { bundleSkill } from "./modes/bundle";
import { cosineSkill } from "./modes/cosine";
import { filterSkill } from "./modes/filter";
import type { DirectPersonaSkill, DirectRetrievalMode, PersonaSkill } from "./skill";

/**
 * The engine's dispatch table for the modes that are a single retrieval call.
 *
 * This is what replaced a ternary chain in `engine.ts`: adding a mode is now a folder under
 * `modes/` plus an entry here, with no edit to the engine at all. Typed as a total record over
 * `DirectRetrievalMode`, so a new mode cannot be added to the enum and then silently fall
 * through to cosine the way the chain's `else` branch used to let it.
 */
export const DIRECT_SKILLS: Record<DirectRetrievalMode, DirectPersonaSkill> = {
  filter: filterSkill,
  cosine: cosineSkill,
  attribute_variant: attributeVariantSkill,
};

/**
 * Every skill the persona agent can route to, including the two the engine dispatches itself.
 *
 * Keyed by mode and total over `RetrievalMode`, so adding a mode to the enum without adding its
 * implementation is a compile error rather than a router that offers a mode nothing implements.
 */
export const PERSONA_SKILLS: Record<RetrievalMode, PersonaSkill> = {
  ...DIRECT_SKILLS,
  ask_info: askSkill,
  bundle: bundleSkill,
};

/**
 * Which markdown file carries each mode's instructions.
 *
 * Spelled out rather than derived from the mode name because two of them don't match: the
 * `ask_info` mode is described by `ask.md`, and the enum is snake_case while the files are
 * kebab-case like the rest of the repo. `skills.test.ts` checks every entry resolves.
 */
const SKILL_FILES: Record<RetrievalMode, string> = {
  ask_info: "ask",
  filter: "filter",
  cosine: "cosine",
  bundle: "bundle",
  attribute_variant: "attribute-variant",
};

/** The markdown behind one mode: its router description, and its prompt where it has one. */
export function skillDoc(mode: RetrievalMode): SkillDoc {
  return loadSkill(`persona/skills/${SKILL_FILES[mode]}.md`);
}

/**
 * The mode list the router chooses from, in enum order.
 *
 * Assembled from each skill's own `description` rather than written out in the router's prompt,
 * so a skill's description lives with the skill. The router still owns how the modes relate to
 * each other — the filter/cosine asymmetry, what to do on ambiguity — because that is a
 * property of the choice, not of any one mode.
 */
export function describeSkillsForRouter(): string {
  return RETRIEVAL_MODES.map((mode) => `- ${skillDoc(mode).description}`).join("\n");
}

export type { DirectPersonaSkill, DirectRetrievalMode, PersonaSkill };
