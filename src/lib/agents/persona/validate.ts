import type { PersonaPathConfig } from "@/lib/catalog/path-config/types";
import type { SearchSpec } from "../shared/acs-translator";
import { validateSearchIntent } from "../shared/validate-intent";
import type { PersonaDecision } from "./schema";

export interface PlannedSearch {
  spec: SearchSpec;
  query: string;
  path: string;
}

export type DecisionPlan =
  | { kind: "reply" }
  | { kind: "search"; search: PlannedSearch }
  | { kind: "invalid"; problems: string[] };

/** Below this the model's own read of the message is too unsure to search on. */
export const MIN_SEARCH_CONFIDENCE = 0.5;

/** A search the model itself doubts goes back to it once, like an invalid one. */
export function gateOnConfidence(plan: DecisionPlan, confidence: number): DecisionPlan {
  if (plan.kind === "reply" || plan.kind === "invalid" || confidence >= MIN_SEARCH_CONFIDENCE) return plan;
  return {
    kind: "invalid",
    problems: [
      `your confidence was ${confidence}: if the message is ambiguous, return action "ask" with one short question and quick options; otherwise decide again with the search you are sure of`,
    ],
  };
}

/**
 * Turns a decision into the search code can run, or into the list of problems the model must fix.
 * Nothing the model wrote reaches ACS without passing through here.
 */
export function planDecision(config: PersonaPathConfig, decision: PersonaDecision): DecisionPlan {
  if (decision.action === "answer" || decision.action === "ask") return { kind: "reply" };

  const result = validateSearchIntent(config, decision);
  if (!result.ok) return { kind: "invalid", problems: result.problems };
  return {
    kind: "search",
    search: {
      spec: result.spec,
      path: result.node.path,
      query: decision.action === "cosine" ? decision.query : "",
    },
  };
}
