import { findNode, normalizePath } from "@/lib/catalog/path-config/lookup";
import type { PersonaPathConfig } from "@/lib/catalog/path-config/types";
import type { SearchSpec } from "../shared/acs-translator";
import { validateSearchIntent } from "../shared/validate-intent";
import type { LastSearch } from "../types";
import type { PersonaDecision } from "./schema";

export interface PlannedSearch {
  spec: SearchSpec;
  query: string;
  path: string;
  /** The further leaves the shopper named with `path`, in the config's spelling. */
  alsoPaths: string[];
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

const constraintKey = (key: string) => key.trim().toLowerCase();

/**
 * A refinement as the full search it stands for. The model writes only what the shopper changed
 * and sets `refine`; everything else on LAST SEARCH is carried here, in code, so a brand or a price
 * cannot quietly fall away when the shopper only asked for another colour. `drop` names what the
 * shopper removed. A different garment is a new search, so nothing is carried across paths.
 */
export function mergeRefinement(decision: PersonaDecision, last: LastSearch | null): PersonaDecision {
  if (!decision.refine || !last || (decision.action !== "filter" && decision.action !== "cosine")) return decision;
  const path = decision.path.trim() || last.path;
  if (normalizePath(path) !== normalizePath(last.path)) return decision;

  const dropped = new Set(decision.drop.map(constraintKey));
  const keep = (name: string) => !dropped.has(name);
  const named = new Set(decision.attributes.map((attribute) => constraintKey(attribute.key)));
  const namedExcluded = new Set(decision.exclude_attributes.map((attribute) => constraintKey(attribute.key)));
  // A new price bound replaces the old window whole: a lower ceiling against the old floor could
  // leave a window nothing fits.
  const keepPrice = keep("price") && decision.price_min === null && decision.price_max === null;

  return {
    ...decision,
    path,
    also_paths: decision.also_paths.length > 0 ? decision.also_paths : keep("paths") ? last.alsoPaths ?? [] : [],
    brands: decision.brands.length > 0 ? decision.brands : keep("brands") ? last.brands : [],
    exclude_brands:
      decision.exclude_brands.length > 0 || !keep("exclusions") ? decision.exclude_brands : last.excludeBrands ?? [],
    price_min: keepPrice ? last.priceMin : decision.price_min,
    price_max: keepPrice ? last.priceMax : decision.price_max,
    attributes: [
      ...decision.attributes,
      ...last.attributes.filter((attribute) => !named.has(constraintKey(attribute.key)) && keep(constraintKey(attribute.key))),
    ],
    exclude_attributes: [
      ...decision.exclude_attributes,
      ...(keep("exclusions") ? last.excludeAttributes ?? [] : []).filter(
        (attribute) => !namedExcluded.has(constraintKey(attribute.key)) && keep(constraintKey(attribute.key))
      ),
    ],
    sizes: decision.sizes.length > 0 ? decision.sizes : keep("sizes") ? last.sizes : [],
    query:
      decision.action === "cosine" && !decision.query && keep("query") && last.action === "cosine" ? last.query : decision.query,
  };
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

  for (const path of [decision.path, ...decision.also_paths]) {
    const outside = departmentProblem(config, path, department);
    if (outside) return { kind: "invalid", problems: [outside] };
  }

  const result = validateSearchIntent(config, decision);
  if (!result.ok) return { kind: "invalid", problems: result.problems };
  const alsoPaths = [
    ...new Set(
      decision.also_paths
        .map((path) => findNode(config, path)?.path)
        .filter((path): path is string => Boolean(path) && path !== result.node.path)
    ),
  ];
  return {
    kind: "search",
    search: {
      spec: result.spec,
      path: result.node.path,
      alsoPaths,
      query: decision.action === "cosine" ? decision.query : "",
    },
  };
}
