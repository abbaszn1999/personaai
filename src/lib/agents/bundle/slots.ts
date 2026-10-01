import { descendantLeaves, findNode, floorPrice, unisexDepartmentFor } from "@/lib/catalog/path-config/lookup";
import { renderCategory } from "@/lib/catalog/path-config/render";
import type { PathConfigNode, PathConfigTier, PersonaPathConfig } from "@/lib/catalog/path-config/types";

/** Anchor category → the categories that complete it. Full-body excludes top and bottom. */
/** In dressing order: each slot's query is written to match the anchor and the slots before it,
 *  so footwear — chosen for the whole outfit — comes last. */
const SLOTS_FOR: Record<string, string[]> = {
  top: ["bottom", "outerwear", "footwear"],
  bottom: ["top", "outerwear", "footwear"],
  "full-body": ["outerwear", "footwear"],
  outerwear: ["top", "bottom", "footwear"],
  footwear: ["top", "bottom", "outerwear"],
};

/** Leaves that are never part of an outfit: nothing is built around them and no slot fills from
 *  them, even when the slot searches their whole category. */
export const NON_OUTFIT_LEAVES: ReadonlySet<string> = new Set([
  "bra",
  "sock",
  "slipper",
  "sleep-top",
  "sleep-bottom",
  "sleepwear-set",
  "sleepsuit",
  "bathrobe",
  "swim-top",
  "swim-bottom",
  "swim-short",
  "swimsuit",
]);

export function isOutfitLeaf(leaf: string | null): boolean {
  return leaf === null || !NON_OUTFIT_LEAVES.has(leaf);
}

/**
 * The outfit leaves a slot search may return for these paths: a leaf stays as it is, a category
 * or department becomes its outfit leaves. Null when nothing needs narrowing.
 */
export function outfitPaths(config: PersonaPathConfig, paths: readonly string[]): string[] | null {
  let narrowed = false;
  const result: string[] = [];
  for (const path of paths) {
    const node = findNode(config, path);
    if (!node) continue;
    if (node.level === "leaf") {
      if (isOutfitLeaf(node.leaf)) result.push(node.path);
      else narrowed = true;
      continue;
    }
    const leaves = descendantLeaves(config, node);
    const kept = leaves.filter((leaf) => isOutfitLeaf(leaf.leaf));
    if (kept.length === leaves.length) result.push(node.path);
    else {
      narrowed = true;
      result.push(...kept.map((leaf) => leaf.path));
    }
  }
  return narrowed ? result : null;
}

function outfitStock(config: PersonaPathConfig, node: PathConfigNode): { inStock: number; floor: number | null } {
  const leaves = descendantLeaves(config, node).filter((leaf) => isOutfitLeaf(leaf.leaf) && leaf.inStock > 0);
  const floors = leaves.map(floorPrice).filter((value): value is number => value !== null);
  return {
    inStock: leaves.reduce((sum, leaf) => sum + leaf.inStock, 0),
    floor: floors.length > 0 ? Math.min(...floors) : null,
  };
}

export interface SlotInPlay {
  slot: string;
  /** The category node in the anchor's department (or its unisex twin when only that stocks it). */
  node: PathConfigNode;
  /** Unisex twin of `node`, searched alongside it. */
  twin: PathConfigNode | null;
  floor: number | null;
}

export function slotsForCategory(category: string | null): string[] {
  return category ? SLOTS_FOR[category] ?? [] : [];
}

/** The anchor's slots that this store actually has stock for. */
export function slotsInPlay(config: PersonaPathConfig, department: string, anchorCategory: string | null): SlotInPlay[] {
  const twinDepartment = unisexDepartmentFor(department);
  const result: SlotInPlay[] = [];
  for (const slot of slotsForCategory(anchorCategory)) {
    const own = findNode(config, `${department} > ${slot}`);
    const twin = twinDepartment ? findNode(config, `${twinDepartment} > ${slot}`) : null;
    const ownStock = own ? outfitStock(config, own) : null;
    const twinStock = twin ? outfitStock(config, twin) : null;
    const stockedOwn = own && ownStock!.inStock > 0 ? own : null;
    const stockedTwin = twin && twinStock!.inStock > 0 ? twin : null;
    const node = stockedOwn ?? stockedTwin;
    if (!node) continue;
    const floors = [stockedOwn ? ownStock!.floor : null, stockedTwin ? twinStock!.floor : null].filter(
      (value): value is number => value !== null
    );
    result.push({
      slot,
      node,
      twin: stockedOwn && stockedTwin ? stockedTwin : null,
      floor: floors.length > 0 ? Math.min(...floors) : null,
    });
  }
  return result;
}

/** A path belongs to a slot when it sits under the slot's category in its department or twin. */
export function pathBelongsToSlot(node: PathConfigNode, slot: SlotInPlay): boolean {
  const departments = [slot.node.department, slot.twin?.department].filter(Boolean);
  return node.category === slot.slot && departments.includes(node.department);
}

export function renderSlotsInPlay(config: PersonaPathConfig, slots: SlotInPlay[]): string {
  return slots
    .map((slot) => {
      const parts = [`### slot: ${slot.slot}${slot.floor !== null ? ` (cheapest in stock: ${slot.floor})` : ""}`, renderCategory(config, slot.node)];
      if (slot.twin) parts.push(renderCategory(config, slot.twin));
      return parts.join("\n");
    })
    .join("\n\n");
}

/** The tier a price falls in, by label. */
export function tierOf(tiers: readonly PathConfigTier[], price: number | null): PathConfigTier | null {
  if (price === null || tiers.length === 0) return null;
  return tiers.find((tier) => price >= tier.min && price <= tier.max) ?? (price < tiers[0].min ? tiers[0] : tiers[tiers.length - 1]);
}

/**
 * No budget: every slot's ceiling is the top of the same tier the anchor sits in on its own path,
 * so a mid-priced anchor gets mid-priced company.
 */
export function fallbackCeilings(anchorNode: PathConfigNode | null, anchorPrice: number | null, slots: SlotInPlay[]): Map<string, number | null> {
  const label = anchorNode ? tierOf(anchorNode.tiers, anchorPrice)?.label ?? null : null;
  return new Map(
    slots.map((slot) => {
      const tier = label ? slot.node.tiers.find((entry) => entry.label === label) : null;
      return [slot.slot, tier ? tier.max : null];
    })
  );
}
