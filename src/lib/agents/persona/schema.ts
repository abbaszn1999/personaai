import { ATTRIBUTE_CONSTRAINTS, NULLABLE_NUMBER, STRING_ARRAY } from "../shared/schema";
import type { AttributeConstraint } from "../types";

export const PERSONA_ACTIONS = ["answer", "ask", "filter", "cosine"] as const;
export type PersonaAction = (typeof PERSONA_ACTIONS)[number];

export interface PersonaDecision {
  reasoning: string;
  action: PersonaAction;
  /** True when the message changes the search on screen rather than starting a new one: code then
   *  carries every LAST SEARCH constraint the decision leaves empty, unless `drop` names it. */
  refine: boolean;
  /** On a refinement, the constraints the shopper removed: `brands`, `price`, `sizes`, `query`,
   *  `exclusions` or an attribute key such as `color`. */
  drop: string[];
  reply: string;
  path: string;
  also_paths: string[];
  brands: string[];
  exclude_brands: string[];
  price_min: number | null;
  price_max: number | null;
  attributes: AttributeConstraint[];
  exclude_attributes: AttributeConstraint[];
  sizes: string[];
  query: string;
  exclude_ids: string[];
  quick_options: string[];
  confidence: number;
}

/** Field order is the order the model writes them: reasoning before it commits to an action. */
export const PERSONA_SCHEMA = {
  type: "object",
  properties: {
    reasoning: { type: "string" },
    action: { type: "string", enum: [...PERSONA_ACTIONS] },
    refine: { type: "boolean" },
    drop: STRING_ARRAY,
    reply: { type: "string" },
    path: { type: "string" },
    also_paths: STRING_ARRAY,
    brands: STRING_ARRAY,
    exclude_brands: STRING_ARRAY,
    price_min: NULLABLE_NUMBER,
    price_max: NULLABLE_NUMBER,
    attributes: ATTRIBUTE_CONSTRAINTS,
    exclude_attributes: ATTRIBUTE_CONSTRAINTS,
    sizes: STRING_ARRAY,
    query: { type: "string" },
    exclude_ids: STRING_ARRAY,
    quick_options: STRING_ARRAY,
    confidence: { type: "number" },
  },
  required: [
    "reasoning",
    "action",
    "refine",
    "reply",
    "path",
    "brands",
    "price_min",
    "price_max",
    "attributes",
    "sizes",
    "query",
    "exclude_ids",
    "quick_options",
    "confidence",
  ],
} as const;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function constraints(value: unknown): AttributeConstraint[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is AttributeConstraint => Boolean(entry) && typeof entry.key === "string")
        .map((entry) => ({ key: entry.key, values: strings(entry.values) }))
    : [];
}

/** Missing arrays and strings become empty ones, so downstream code never branches on shape. */
export function normalizeDecision(raw: Partial<PersonaDecision>): PersonaDecision {
  const action = PERSONA_ACTIONS.includes(raw.action as PersonaAction) ? (raw.action as PersonaAction) : "answer";
  return {
    reasoning: raw.reasoning ?? "",
    action,
    refine: raw.refine === true,
    drop: strings(raw.drop),
    reply: (raw.reply ?? "").trim(),
    path: raw.path ?? "",
    also_paths: strings(raw.also_paths),
    brands: Array.isArray(raw.brands) ? raw.brands : [],
    exclude_brands: strings(raw.exclude_brands),
    price_min: typeof raw.price_min === "number" ? raw.price_min : null,
    price_max: typeof raw.price_max === "number" ? raw.price_max : null,
    attributes: Array.isArray(raw.attributes) ? raw.attributes : [],
    exclude_attributes: constraints(raw.exclude_attributes),
    sizes: strings(raw.sizes),
    query: (raw.query ?? "").trim(),
    exclude_ids: Array.isArray(raw.exclude_ids) ? raw.exclude_ids : [],
    quick_options: Array.isArray(raw.quick_options) ? raw.quick_options : [],
    confidence: typeof raw.confidence === "number" ? raw.confidence : 1,
  };
}
