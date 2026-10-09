import { findNode } from "@/lib/catalog/path-config/lookup";
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

/**
 * The departments a profile may shop. Every search is fit-filtered on this profile's own body, so
 * a garment for someone else would be sized on the wrong person. A gendered profile also wears its
 * unisex twin; a unisex profile wears either gendered department of its own age group.
 */
const SHOPPER_DEPARTMENTS: Record<string, readonly string[]> = {
  women: ["women", "unisex"],
  men: ["men", "unisex"],
  unisex: ["unisex", "women", "men"],
  "kids-girls": ["kids-girls", "kids-unisex"],
  "kids-boys": ["kids-boys", "kids-unisex"],
  "kids-unisex": ["kids-unisex", "kids-girls", "kids-boys"],
};

/** Null when the profile's department is unknown, which places no restriction. */
export function shopperDepartments(department: string | null): readonly string[] | null {
  return department ? SHOPPER_DEPARTMENTS[department] ?? [department] : null;
}

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

function departmentProblem(config: PersonaPathConfig, path: string, department: string | null): string | null {
  const allowed = shopperDepartments(department);
  const node = findNode(config, path);
  if (!allowed || !node || allowed.includes(node.department)) return null;
  return (
    `path "${node.path}" is in the ${node.department} department, but this profile is ${department} ` +
    `(it can shop: ${allowed.join(", ")}). Every result is sized on this profile's own body, so shopping for ` +
    `someone else is not possible here: return action "answer", say so kindly in the shopper's language, and tell ` +
    `them to add a profile for that person with "Add profile" in the profile menu`
  );
}

/**
 * Turns a decision into the search code can run, or into the list of problems the model must fix.
 * Nothing the model wrote reaches ACS without passing through here.
 */
export function planDecision(
  config: PersonaPathConfig,
  decision: PersonaDecision,
  department: string | null = null
): DecisionPlan {
  if (decision.action === "answer" || decision.action === "ask") return { kind: "reply" };

  const outside = departmentProblem(config, decision.path, department);
  if (outside) return { kind: "invalid", problems: [outside] };

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
