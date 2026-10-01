import type { CatalogCandidate, HardRule } from "@/lib/retrieval/types";
import { unisexDepartmentFor } from "@/lib/catalog/path-config/lookup";
import { isValidBundle } from "../shared/hard-rules";
import { departmentOf } from "../shared/product-record";

export interface SlotCandidates {
  slot: string;
  ceiling: number | null;
  candidates: CatalogCandidate[];
}

export interface ComposedLook {
  /** One chosen item per searched slot, in slot order. */
  picks: Array<{ slot: string; item: CatalogCandidate }>;
  reason: string;
}

export interface LookRules {
  /** Pieces already in the look (the anchor, plus kept pieces on a swap). */
  fixed: CatalogCandidate[];
  budget: number | null;
  department: string;
  /** The merchant's own rules (never pair, price spread, excluded items). */
  hardRules: HardRule[];
}

function allowedDepartments(department: string): Set<string> {
  const twin = unisexDepartmentFor(department);
  return new Set(twin ? [department, twin] : [department]);
}

export function lookTotal(items: readonly CatalogCandidate[]): number {
  return Math.round(items.reduce((sum, item) => sum + (item.price ?? 0), 0) * 100) / 100;
}

/**
 * The checks every look passes before a shopper sees it: ids the model was actually given, one
 * piece per slot, nothing twice, in stock, inside its slot's ceiling, the anchor's department,
 * and a total inside the budget. A look failing any check is dropped, never repaired; `onReject`
 * receives the reason, for logs.
 */
export function verifyLook(
  look: { item_ids: string[]; reason: string },
  slots: SlotCandidates[],
  rules: LookRules,
  onReject?: (reason: string) => void
): ComposedLook | null {
  const reject = (reason: string) => {
    onReject?.(reason);
    return null;
  };
  const departments = allowedDepartments(rules.department);
  const fixedIds = new Set(rules.fixed.map((item) => item.externalId));
  const picks: ComposedLook["picks"] = [];
  const used = new Set<string>();

  for (const id of look.item_ids) {
    if (fixedIds.has(id) || used.has(id)) continue;
    const slot = slots.find((entry) => entry.candidates.some((candidate) => candidate.externalId === id));
    if (!slot) return reject(`unknown id ${id}`);
    if (picks.some((pick) => pick.slot === slot.slot)) return reject(`two pieces for ${slot.slot}`);
    const item = slot.candidates.find((candidate) => candidate.externalId === id)!;
    if (!item.inStock || item.price === null) return reject(`${id} unavailable`);
    if (slot.ceiling !== null && item.price > slot.ceiling) return reject(`${slot.slot} ${item.price} over ceiling ${slot.ceiling}`);
    const department = departmentOf(item);
    if (department && !departments.has(department)) return reject(`${id} is ${department}`);
    used.add(id);
    picks.push({ slot: slot.slot, item });
  }

  const expected = slots.filter((slot) => slot.candidates.length > 0).length;
  if (picks.length === 0 || picks.length < expected) return reject(`${picks.length} of ${expected} slots filled`);
  const pieces = [...rules.fixed, ...picks.map((pick) => pick.item)];
  if (rules.budget !== null && lookTotal(pieces) > rules.budget) return reject(`total ${lookTotal(pieces)} over budget ${rules.budget}`);
  if (!isValidBundle(pieces, rules.hardRules)) return reject("breaks a merchant rule");

  picks.sort((a, b) => slots.findIndex((slot) => slot.slot === a.slot) - slots.findIndex((slot) => slot.slot === b.slot));
  return { picks, reason: look.reason.trim() };
}

/** Drops looks that repeat another look's exact pieces. */
export function distinctLooks<T extends ComposedLook>(looks: T[]): T[] {
  const seen = new Set<string>();
  return looks.filter((look) => {
    const key = look.picks.map((pick) => pick.item.externalId).sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function roundBudget(value: number): number {
  const step = value < 100 ? 5 : value < 500 ? 10 : 50;
  return Math.ceil(value / step) * step;
}

/**
 * One-tap totals for the budget card, asked before any look is built: from just above the
 * cheapest complete outfit (anchor + every slot's cheapest piece) up past a typical one (anchor +
 * each slot at the anchor's own price tier).
 */
export function budgetSuggestions(anchorPrice: number, slots: Array<{ floor: number | null; typical: number | null }>): number[] {
  if (slots.length === 0) return [];
  const cheapest = anchorPrice + slots.reduce((sum, slot) => sum + (slot.floor ?? 0), 0);
  const typical = anchorPrice + slots.reduce((sum, slot) => sum + Math.max(slot.typical ?? 0, slot.floor ?? 0), 0);
  const suggestions: number[] = [];
  for (const raw of [cheapest * 1.2, (cheapest + typical) / 2, typical, typical * 1.5]) {
    const amount = roundBudget(raw);
    if (amount > anchorPrice && !suggestions.includes(amount)) suggestions.push(amount);
  }
  return suggestions.sort((a, b) => a - b).slice(0, 4);
}

/**
 * The top-ranked candidate of each slot, cheapest-first when the budget would otherwise break —
 * used only when the compose call produced nothing that verifies.
 */
export function naiveLook(slots: SlotCandidates[], rules: LookRules): ComposedLook | null {
  const filled = slots.filter((slot) => slot.candidates.length > 0);
  if (filled.length === 0) return null;
  const first = { item_ids: filled.map((slot) => slot.candidates[0].externalId), reason: "" };
  const ranked = verifyLook(first, slots, rules);
  if (ranked) return ranked;
  const cheapest = {
    item_ids: filled.map(
      (slot) => [...slot.candidates].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0].externalId
    ),
    reason: "",
  };
  return verifyLook(cheapest, slots, rules);
}
