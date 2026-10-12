import { ATTRIBUTE_CONSTRAINTS, NULLABLE_NUMBER, STRING_ARRAY } from "../shared/schema";
import type { AttributeConstraint } from "../types";

export interface BundleSlotIntent {
  slot: string;
  path: string;
  price_max: number | null;
  query: string;
  attributes: AttributeConstraint[];
}

const SLOT_INTENT = {
  type: "object",
  properties: {
    slot: { type: "string" },
    path: { type: "string" },
    price_max: NULLABLE_NUMBER,
    query: { type: "string" },
    attributes: ATTRIBUTE_CONSTRAINTS,
  },
  required: ["slot", "path", "price_max", "query", "attributes"],
} as const;

export interface PlannedLook {
  theme: string;
  slots: BundleSlotIntent[];
}

export interface PlanResponse {
  reasoning: string;
  looks: PlannedLook[];
}

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    reasoning: { type: "string" },
    looks: {
      type: "array",
      items: {
        type: "object",
        properties: { theme: { type: "string" }, slots: { type: "array", items: SLOT_INTENT } },
        required: ["theme", "slots"],
      },
    },
  },
  required: ["reasoning", "looks"],
} as const;

export interface ComposeResponse {
  /** `look` is the 1-based number of the planned look the pieces came from. */
  looks: Array<{ look: number; item_ids: string[]; reason: string }>;
  reply: string;
}

export const COMPOSE_SCHEMA = {
  type: "object",
  properties: {
    looks: {
      type: "array",
      items: {
        type: "object",
        properties: { look: { type: "integer" }, item_ids: STRING_ARRAY, reason: { type: "string" } },
        required: ["look", "item_ids", "reason"],
      },
    },
    reply: { type: "string" },
  },
  required: ["looks", "reply"],
} as const;

export const FOLLOW_UP_INTENTS = ["answer", "swap", "rerun", "drop_slot", "add_slot", "detach"] as const;
export type FollowUpIntent = (typeof FOLLOW_UP_INTENTS)[number];

export interface FollowUpResponse {
  reasoning: string;
  intent: FollowUpIntent;
  reply: string;
  /** Everything the shopper has asked of the look so far that still holds, in their language. */
  brief: string;
  /** The language every reply is written in. */
  language: string;
  slots: BundleSlotIntent[];
  drop_slots: string[];
  budget: number | null;
}

export const FOLLOW_UP_SCHEMA = {
  type: "object",
  properties: {
    reasoning: { type: "string" },
    intent: { type: "string", enum: [...FOLLOW_UP_INTENTS] },
    reply: { type: "string" },
    brief: { type: "string" },
    language: { type: "string" },
    slots: { type: "array", items: SLOT_INTENT },
    drop_slots: STRING_ARRAY,
    budget: NULLABLE_NUMBER,
  },
  required: ["reasoning", "intent", "reply", "brief", "language", "slots", "drop_slots", "budget"],
} as const;

export const ANCHOR_INTENTS = ["rerun", "answer", "detach"] as const;
export type AnchorIntent = (typeof ANCHOR_INTENTS)[number];

export interface AnchorResponse {
  reasoning: string;
  intent: AnchorIntent;
  reply: string;
  /** Everything the shopper has asked of the looks so far that still holds, in their language. */
  brief: string;
  /** The language every reply is written in. */
  language: string;
  /** The total the shopper just named; 0 for "no limit", null when they named none. */
  budget: number | null;
  /** They asked for pieces other than the ones already shown ("other looks", "something else"). */
  new_pieces: boolean;
}

export const ANCHOR_SCHEMA = {
  type: "object",
  properties: {
    reasoning: { type: "string" },
    intent: { type: "string", enum: [...ANCHOR_INTENTS] },
    reply: { type: "string" },
    brief: { type: "string" },
    language: { type: "string" },
    budget: NULLABLE_NUMBER,
    new_pieces: { type: "boolean" },
  },
  required: ["reasoning", "intent", "reply", "brief", "language", "budget", "new_pieces"],
} as const;
