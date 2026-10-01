import type { PersonaPathConfig } from "@/lib/catalog/path-config/types";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import type { SearchSpec } from "../shared/acs-translator";
import { validateSearchIntent } from "../shared/validate-intent";
import type { BundleSlotIntent, PlannedLook } from "./schema";
import { isOutfitLeaf, outfitPaths, pathBelongsToSlot, type SlotInPlay } from "./slots";

export interface SlotSearch {
  slot: string;
  path: string;
  query: string;
  spec: SearchSpec;
}

export interface PlanLimits {
  /** Money left for the slots being searched; null when there is no budget. */
  remaining: number | null;
  /** No-budget ceilings per slot, from the anchor's tier. */
  fallbackCeilings: Map<string, number | null>;
  excludeIds: string[];
  /** Hard per-slot ceilings no intent may exceed — "cheaper shoes" caps footwear below the
   *  current pair. */
  caps?: Map<string, number>;
}

export type SlotPlan =
  | { ok: true; searches: SlotSearch[]; skipped: string[] }
  | { ok: false; problems: string[] };

export const MAX_DIRECTIONS = 5;

/** One planned look: a theme and one search per slot, written to go together. */
export interface LookDirection {
  theme: string;
  searches: SlotSearch[];
  skipped: string[];
}

export type DirectionPlan = { ok: true; directions: LookDirection[] } | { ok: false; problems: string[] };

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
      const ceiling = limits.fallbackCeilings.get(slot.slot) ?? null;
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
    searches.push({ slot: slot.slot, path: result.node.path, query: intent.query.trim(), spec });
  }

  if (limits.remaining !== null) {
    const total = searches.reduce((sum, search) => sum + (search.spec.priceMax ?? 0), 0);
    if (total > limits.remaining) {
      problems.push(`the slot ceilings add up to ${total}, above the ${limits.remaining} left in the budget`);
    }
  }

  if (problems.length > 0) return { ok: false, problems };
  if (searches.length === 0) return { ok: false, problems: ["no slot left to search"] };
  return { ok: true, searches, skipped };
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
    if (plan.ok) directions.push({ theme: (look.theme ?? "").trim(), searches: plan.searches, skipped: plan.skipped });
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
