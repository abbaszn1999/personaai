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
    slots: { type: "array", items: SLOT_INTENT },
    drop_slots: STRING_ARRAY,
    budget: NULLABLE_NUMBER,
  },
  required: ["reasoning", "intent", "reply", "slots", "drop_slots", "budget"],
} as const;
