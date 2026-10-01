import { ATTRIBUTE_CONSTRAINTS, NULLABLE_NUMBER, STRING_ARRAY } from "../shared/schema";
import type { AttributeConstraint } from "../types";

export const PERSONA_ACTIONS = ["answer", "ask", "filter", "cosine"] as const;
export type PersonaAction = (typeof PERSONA_ACTIONS)[number];

export interface PersonaDecision {
  reasoning: string;
  action: PersonaAction;
  reply: string;
  path: string;
  brands: string[];
  price_min: number | null;
  price_max: number | null;
  attributes: AttributeConstraint[];
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
    reply: { type: "string" },
    path: { type: "string" },
    brands: STRING_ARRAY,
    price_min: NULLABLE_NUMBER,
    price_max: NULLABLE_NUMBER,
    attributes: ATTRIBUTE_CONSTRAINTS,
    sizes: STRING_ARRAY,
    query: { type: "string" },
    exclude_ids: STRING_ARRAY,
    quick_options: STRING_ARRAY,
    confidence: { type: "number" },
  },
  required: [
    "reasoning",
    "action",
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

/** Missing arrays and strings become empty ones, so downstream code never branches on shape. */
export function normalizeDecision(raw: Partial<PersonaDecision>): PersonaDecision {
  const action = PERSONA_ACTIONS.includes(raw.action as PersonaAction) ? (raw.action as PersonaAction) : "answer";
  return {
    reasoning: raw.reasoning ?? "",
    action,
    reply: (raw.reply ?? "").trim(),
    path: raw.path ?? "",
    brands: Array.isArray(raw.brands) ? raw.brands : [],
    price_min: typeof raw.price_min === "number" ? raw.price_min : null,
    price_max: typeof raw.price_max === "number" ? raw.price_max : null,
    attributes: Array.isArray(raw.attributes) ? raw.attributes : [],
    sizes: Array.isArray(raw.sizes) ? raw.sizes.filter((size): size is string => typeof size === "string") : [],
    query: (raw.query ?? "").trim(),
    exclude_ids: Array.isArray(raw.exclude_ids) ? raw.exclude_ids : [],
    quick_options: Array.isArray(raw.quick_options) ? raw.quick_options : [],
    confidence: typeof raw.confidence === "number" ? raw.confidence : 1,
  };
}
