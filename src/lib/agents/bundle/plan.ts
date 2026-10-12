import { findNode } from "@/lib/catalog/path-config/lookup";
import type { PathConfigTier, PersonaPathConfig } from "@/lib/catalog/path-config/types";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import type { ResolvedAttribute, SearchSpec } from "../shared/acs-translator";
import { resolvePreferredColours, validateSearchIntent } from "../shared/validate-intent";
import type { BundleSlotIntent, PlannedLook } from "./schema";
import { isOutfitLeaf, outfitPaths, pathBelongsToSlot, type SlotInPlay } from "./slots";

export interface SlotSearch {
  slot: string;
  path: string;
  query: string;
  spec: SearchSpec;
  /** The palette's colours for this slot in the store's spelling — searched first, never required. */
  preferColours?: Extract<ResolvedAttribute, { kind: "text" }> | null;
}

export interface PlanLimits {
  /** Money left for the slots being searched; null when there is no budget. */
  remaining: number | null;
  /** No-budget ceilings per slot, from the anchor's tier on each slot's whole category. */
  fallbackCeilings: Map<string, number | null>;
  /** The anchor's tier on its own path. With no budget, a slot searched on one leaf keeps that
   *  tier on the leaf — a knit is priced against knits, not against every top. */
  anchorTier?: PathConfigTier["label"] | null;
  excludeIds: string[];
  /** Hard per-slot ceilings no intent may exceed — "cheaper shoes" caps footwear below the
   *  current pair. */
  caps?: Map<string, number>;
}

export type SlotPlan =
  | { ok: true; searches: SlotSearch[]; skipped: string[] }
  | { ok: false; problems: string[] };

export const MAX_DIRECTIONS = 5;

/**
 * How far a slot's search may reach above the share of the budget the plan gave it. The shares
 * add up to the budget; the searches overlap so a strong piece just over its share is still seen,
 * and compose (then code) keeps each look's total inside the budget.
 */
export const CEILING_SLACK = 0.3;

/** One planned look: a theme, its palette and one search per slot, written to go together. */
export interface LookDirection {
  theme: string;
  palette: string;
  searches: SlotSearch[];
  skipped: string[];
}

export type DirectionPlan =
  | { ok: true; directions: LookDirection[]; /** How the plan read the anchor, for compose. */ anchorRead?: string | null }
  | { ok: false; problems: string[] };

const round = (value: number) => Math.floor(value);

/**
 * Checks the model's slot intents: each slot is one in play, each path sits under that slot's
 * category, every value exists, and the ceilings fit what is left of the budget.
 */
export function validateSlotPlan(
  config: PersonaPathConfig,
  slots: SlotInPlay[],
  intents: BundleSlotIntent[],
  limits: PlanLimits
): SlotPlan {
  const bySlot = new Map(slots.map((slot) => [slot.slot, slot]));
  const problems: string[] = [];
  const searches: SlotSearch[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const intent of intents) {
    const slot = bySlot.get(intent.slot);
    if (!slot) {
      problems.push(`slot "${intent.slot}" is not in play (slots: ${slots.map((entry) => entry.slot).join(", ")})`);
      continue;
    }
    if (seen.has(slot.slot)) {
      problems.push(`slot "${slot.slot}" appears twice`);
      continue;
    }
    seen.add(slot.slot);
    if (intent.price_max === 0) {
      skipped.push(slot.slot);
      continue;
    }

    let priceMax = intent.price_max;
    const cap = limits.caps?.get(slot.slot);
    if (cap !== undefined) priceMax = priceMax === null ? cap : Math.min(priceMax, cap);
    if (limits.remaining === null) {
      const onPath = limits.anchorTier ? findNode(config, intent.path)?.tiers.find((tier) => tier.label === limits.anchorTier)?.max ?? null : null;
      const ceiling = onPath ?? limits.fallbackCeilings.get(slot.slot) ?? null;
      priceMax = ceiling === null ? priceMax : Math.min(priceMax ?? ceiling, ceiling);
    } else if (priceMax === null) {
      problems.push(`slot "${slot.slot}" needs a price_max inside the budget`);
      continue;
    }

    const result = validateSearchIntent(config, {
      path: intent.path,
      price_max: priceMax,
      attributes: intent.attributes,
      exclude_ids: limits.excludeIds,
    });
    if (!result.ok) {
      problems.push(...result.problems.map((problem) => `${slot.slot}: ${problem}`));
      continue;
    }
    if (!pathBelongsToSlot(result.node, slot)) {
      problems.push(`${slot.slot}: path "${result.node.path}" is not under ${slot.node.path}`);
      continue;
    }
    if (!isOutfitLeaf(result.node.leaf)) {
      problems.push(`${slot.slot}: "${result.node.path}" is not an outfit piece — pick another leaf or the category`);
      continue;
    }
    const narrowed = outfitPaths(config, result.spec.paths);
    const spec = narrowed ? { ...result.spec, paths: narrowed } : result.spec;
    // A colour already required by the intent leaves nothing to prefer.
    const colourRequired = spec.attributes.some((attribute) => attribute.field === "colors" || /colou?r/i.test(attribute.key));
    const preferColours = colourRequired ? null : resolvePreferredColours(config, spec.paths, intent.prefer_colors);
    searches.push({ slot: slot.slot, path: result.node.path, query: intent.query.trim(), spec, ...(preferColours ? { preferColours } : {}) });
  }

  if (limits.remaining !== null) {
    const total = searches.reduce((sum, search) => sum + (search.spec.priceMax ?? 0), 0);
    if (total > limits.remaining) {
      problems.push(`the slot ceilings add up to ${total}, above the ${limits.remaining} left in the budget`);
    }
  }

  if (problems.length > 0) return { ok: false, problems };
  if (searches.length === 0) return { ok: false, problems: ["no slot left to search"] };
  return { ok: true, searches: limits.remaining === null ? searches : widenCeilings(searches, bySlot, limits.remaining, limits.caps), skipped };
}

/** Each share plus the slack, never so high that the other slots' cheapest pieces could not fit
 *  beside it, and never above a hard cap. */
function widenCeilings(
  searches: SlotSearch[],
  bySlot: Map<string, SlotInPlay>,
  remaining: number,
  caps: Map<string, number> | undefined
): SlotSearch[] {
  return searches.map((search) => {
    const share = search.spec.priceMax;
    if (share === null) return search;
    const others = searches.reduce((sum, other) => (other === search ? sum : sum + (bySlot.get(other.slot)?.floor ?? 0)), 0);
    let ceiling = Math.min(round(share * (1 + CEILING_SLACK)), round(remaining - others));
    const cap = caps?.get(search.slot);
    if (cap !== undefined) ceiling = Math.min(ceiling, cap);
    return { ...search, spec: { ...search.spec, priceMax: Math.max(share, ceiling) } };
  });
}

/**
 * Validates every planned look on its own. Valid looks run even when another one is broken;
 * the plan fails only when none survive.
 */
export function validateLookPlan(
  config: PersonaPathConfig,
  slots: SlotInPlay[],
  looks: PlannedLook[],
  limits: PlanLimits,
  max = MAX_DIRECTIONS
): DirectionPlan {
  const directions: LookDirection[] = [];
  const problems: string[] = [];
  looks.slice(0, max).forEach((look, index) => {
    const plan = validateSlotPlan(config, slots, look.slots ?? [], limits);
    if (plan.ok) {
      directions.push({ theme: (look.theme ?? "").trim(), palette: (look.palette ?? "").trim(), searches: plan.searches, skipped: plan.skipped });
    }
    else problems.push(...plan.problems.map((problem) => `look ${index + 1}: ${problem}`));
  });
  if (directions.length > 0) return { ok: true, directions };
  return { ok: false, problems: problems.length > 0 ? problems : ["no look planned"] };
}

/** Words from the anchor that carry across slots — used only when the model's plan failed twice. */
function anchorQuery(anchor: CatalogCandidate, slot: string): string {
  const colour = anchor.attributes?.color?.[0];
  const words = [colour ? `${colour.toLowerCase()} tones` : "", "coordinating", slot === "footwear" ? "shoes" : slot];
  return words.filter(Boolean).join(" ");
}

/**
 * Deterministic allocation when the model could not produce a valid plan: drop outerwear, then
 * the rest, until the floors fit; then share what is left above the floors evenly.
 */
export function fallbackSlotPlan(
  config: PersonaPathConfig,
  slots: SlotInPlay[],
  anchor: CatalogCandidate,
  limits: PlanLimits
): SlotPlan {
  let active = [...slots];
  if (limits.remaining !== null) {
    const floorSum = () => active.reduce((sum, slot) => sum + (slot.floor ?? 0), 0);
    const dropOrder = ["outerwear", "footwear", "top", "bottom"];
    for (const name of dropOrder) {
      if (floorSum() <= limits.remaining) break;
      active = active.filter((slot) => slot.slot !== name);
    }
    if (active.length === 0 || floorSum() > limits.remaining) return { ok: false, problems: ["the budget does not reach any slot's cheapest item"] };
  }

  const extra = limits.remaining === null ? 0 : (limits.remaining - active.reduce((sum, slot) => sum + (slot.floor ?? 0), 0)) / active.length;
  const intents: BundleSlotIntent[] = active.map((slot) => ({
    slot: slot.slot,
    path: slot.node.path,
    price_max: limits.remaining === null ? limits.fallbackCeilings.get(slot.slot) ?? null : round((slot.floor ?? 0) + extra),
    query: anchorQuery(anchor, slot.slot),
    attributes: [],
  }));
  const plan = validateSlotPlan(config, active, intents, limits);
  return plan.ok ? { ...plan, skipped: slots.filter((slot) => !active.includes(slot)).map((slot) => slot.slot) } : plan;
}
