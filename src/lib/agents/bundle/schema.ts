import { ATTRIBUTE_CONSTRAINTS, NULLABLE_NUMBER, STRING_ARRAY } from "../shared/schema";
import type { AttributeConstraint } from "../types";

export interface BundleSlotIntent {
  slot: string;
  path: string;
  price_max: number | null;
  query: string;
  attributes: AttributeConstraint[];
  /** Colour values from the slot's `color(...)` line that suit the look's palette — tried first,
   *  let go when they would leave too little to choose from. */
  prefer_colors?: string[];
}

const SLOT_INTENT = {
  type: "object",
  properties: {
    slot: { type: "string" },
    path: { type: "string" },
    price_max: NULLABLE_NUMBER,
    query: { type: "string" },
    attributes: ATTRIBUTE_CONSTRAINTS,
    prefer_colors: STRING_ARRAY,
  },
  required: ["slot", "path", "price_max", "query", "attributes", "prefer_colors"],
} as const;

/** How a stylist reads the anchor before dressing it. */
export interface AnchorRead {
  colour: string;
  family: string;
  undertone: string;
  formality: number;
  season: string;
  silhouette: string;
  material: string;
  statement: boolean;
}

const ANCHOR_READ = {
  type: "object",
  properties: {
    colour: { type: "string" },
    family: { type: "string" },
    undertone: { type: "string" },
    formality: { type: "integer" },
    season: { type: "string" },
    silhouette: { type: "string" },
    material: { type: "string" },
    statement: { type: "boolean" },
  },
  required: ["colour", "family", "undertone", "formality", "season", "silhouette", "material", "statement"],
} as const;

export interface PlannedLook {
  theme: string;
  /** The look's colour story, e.g. "navy, white, tan accent". */
  palette?: string;
  slots: BundleSlotIntent[];
}

export interface PlanResponse {
  reasoning: string;
  anchor_read?: AnchorRead;
  looks: PlannedLook[];
}

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    reasoning: { type: "string" },
    anchor_read: ANCHOR_READ,
    looks: {
      type: "array",
      items: {
        type: "object",
        properties: { theme: { type: "string" }, palette: { type: "string" }, slots: { type: "array", items: SLOT_INTENT } },
        required: ["theme", "palette", "slots"],
      },
    },
  },
  required: ["reasoning", "anchor_read", "looks"],
} as const;

/** The anchor read as one line for the stages after the plan. */
export function renderAnchorRead(read: AnchorRead | null | undefined): string | null {
  if (!read || !read.colour?.trim()) return null;
  const parts = [
    `colour: ${read.colour.trim()}${read.family?.trim() ? ` (${read.family.trim()}${read.undertone?.trim() ? `, ${read.undertone.trim()}` : ""})` : ""}`,
    Number.isFinite(read.formality) ? `formality ${read.formality}` : null,
    read.season?.trim() ? `season: ${read.season.trim()}` : null,
    read.silhouette?.trim() ? `silhouette: ${read.silhouette.trim()}` : null,
    read.material?.trim() ? `material: ${read.material.trim()}` : null,
    read.statement ? "statement piece — keep everything else quiet" : "not a statement piece",
  ];
  return parts.filter(Boolean).join(" · ");
}

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
