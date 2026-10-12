import type { CatalogCandidate, HardRule } from "@/lib/retrieval/types";
import { unisexDepartmentFor } from "@/lib/catalog/path-config/lookup";
import { isValidBundle } from "../shared/hard-rules";
import { departmentsOf } from "../shared/product-record";

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

/** The one slot an outfit is complete without: compose may leave it out when every candidate
 *  breaks the look's occasion or season (a hooded zip jacket for a wedding). */
export const OPTIONAL_SLOTS: ReadonlySet<string> = new Set(["outerwear"]);

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
    const listed = departmentsOf(item);
    if (listed.length > 0 && !listed.some((department) => departments.has(department))) return reject(`${id} is ${listed.join("/")}`);
    used.add(id);
    picks.push({ slot: slot.slot, item });
  }

  const required = slots.filter((slot) => slot.candidates.length > 0 && !OPTIONAL_SLOTS.has(slot.slot));
  const unfilled = required.filter((slot) => !picks.some((pick) => pick.slot === slot.slot));
  if (picks.length === 0 || unfilled.length > 0) {
    return reject(`${picks.length} of ${slots.filter((slot) => slot.candidates.length > 0).length} slots filled (missing ${unfilled.map((slot) => slot.slot).join(", ") || "all"})`);
  }
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

/** Candidates per slot the fallback weighs; ranks below this are rarely the better outfit. */
const NAIVE_DEPTH = 8;

/**
 * The best-ranked combination that passes every check — ACS's top pick in each slot when it fits,
 * otherwise the combination whose ranks add up lowest, cheapest pieces as the last resort. Used
 * only when the compose call produced nothing that verifies.
 */
export function naiveLook(slots: SlotCandidates[], rules: LookRules): ComposedLook | null {
  const filled = slots.filter((slot) => slot.candidates.length > 0);
  if (filled.length === 0) return null;
  const pools = filled.map((slot) => slot.candidates.slice(0, NAIVE_DEPTH).map((item, rank) => ({ item, rank })));
  const combinations: Array<{ ids: string[]; rank: number }> = [{ ids: [], rank: 0 }];
  for (const pool of pools) {
    const next: Array<{ ids: string[]; rank: number }> = [];
    for (const partial of combinations) {
      for (const entry of pool) next.push({ ids: [...partial.ids, entry.item.externalId], rank: partial.rank + entry.rank });
    }
    combinations.splice(0, combinations.length, ...next);
  }
  combinations.sort((a, b) => a.rank - b.rank);
  for (const combination of combinations) {
    const look = verifyLook({ item_ids: combination.ids, reason: "" }, slots, rules);
    if (look) return look;
  }
  const cheapest = {
    item_ids: filled.map(
      (slot) => [...slot.candidates].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0].externalId
    ),
    reason: "",
  };
  return verifyLook(cheapest, slots, rules);
}
