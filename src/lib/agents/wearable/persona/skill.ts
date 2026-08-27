import type { RetrievalContext, RetrievalMode } from "@/lib/retrieval/types";
import type { ModeOutcome } from "./modes/mode-outcome";

/**
 * What every mode declares about itself in TypeScript.
 *
 * Deliberately almost empty. A mode's instructions live in `skills/<mode>.md` and are read
 * through `registry.skillDoc`, not carried on this object, so that editing a description or a
 * prompt never means touching code. What's left here is the identity the registry keys on, and
 * `DirectPersonaSkill` adds the runner for the modes that have a uniform one.
 */
export interface PersonaSkill {
  mode: RetrievalMode;
}

/**
 * The modes that are exactly one retrieval call in and one candidate set out.
 *
 * `ask_info` and `bundle` are excluded because neither fits that shape: ask returns a question
 * instead of candidates, and bundle is a multi-turn state machine whose entry point needs the
 * store connection to hydrate live prices mid-flow. The engine dispatches both before it reaches
 * the runner lookup, so excluding them here is what lets that lookup be total rather than a map
 * with holes in it.
 */
export type DirectRetrievalMode = Exclude<RetrievalMode, "ask_info" | "bundle">;

export interface DirectPersonaSkill extends PersonaSkill {
  mode: DirectRetrievalMode;
  run: (context: RetrievalContext) => Promise<ModeOutcome>;
}
