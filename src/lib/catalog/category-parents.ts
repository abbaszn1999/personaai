import { isSizingGroup, type SizingGroup } from "@/lib/sizing/measurements";
import type { CategoryParentMap, SkuParentOverrides, StoreCategory } from "@/modules/store/types";

/**
 * Resolving a product's parent sizing category from the merchant's own category mapping.
 *
 * This replaces inferring the sizing group from the product's title and canonical category. That
 * inference had two failure modes a merchant could neither see nor correct: a title matching no
 * synonym dropped the product from sizing silently, and a title matching the wrong synonym sized it
 * against the wrong chart just as silently. The merchant maps each category path once in the
 * Categories tab, and everything underneath inherits it.
 */

/** `parentId` lookups, built once per resolution batch rather than per product — a catalog walk
 *  calls the resolver tens of thousands of times against the same unchanging category list. */
export interface CategoryIndex {
  parentOf: ReadonlyMap<string, string | null>;
  childrenOf: ReadonlyMap<string, readonly string[]>;
  depthOf: ReadonlyMap<string, number>;
}

export function buildCategoryIndex(categories: readonly StoreCategory[]): CategoryIndex {
  const parentOf = new Map<string, string | null>();
  const childrenOf = new Map<string, string[]>();

  for (const category of categories) {
    const parentId = category.parentId ?? null;
    // A parent id pointing at a term that no longer exists would otherwise send the upward walk
    // into a dead end; treating it as a root matches how `buildCategoryTree` promotes orphans.
    parentOf.set(category.id, parentId);
  }
  for (const category of categories) {
    const parentId = parentOf.get(category.id) ?? null;
    if (parentId === null || parentId === category.id || !parentOf.has(parentId)) {
      parentOf.set(category.id, null);
      continue;
    }
    const siblings = childrenOf.get(parentId);
    if (siblings) siblings.push(category.id);
    else childrenOf.set(parentId, [category.id]);
  }

  const depthOf = new Map<string, number>();
  for (const category of categories) {
    let depth = 0;
    let cursor = parentOf.get(category.id) ?? null;
    // Bounded by the category count so a parent cycle surviving the checks above cannot hang a
    // catalog walk.
    while (cursor !== null && depth <= categories.length) {
      depth += 1;
      cursor = parentOf.get(cursor) ?? null;
    }
    depthOf.set(category.id, depth);
  }

  return { parentOf, childrenOf, depthOf };
}

function mappedGroup(map: CategoryParentMap, id: string): SizingGroup | null {
  const value = map[id];
  return isSizingGroup(value) ? value : null;
}

/** The nearest mapped ancestor, for a product filed directly on an interior term the merchant
 *  never mapped because the grid only asks about the paths at the edge of their selection. */
function inheritedFromAncestor(
  id: string,
  map: CategoryParentMap,
  index: CategoryIndex
): SizingGroup | null {
  let cursor = index.parentOf.get(id) ?? null;
  let hops = 0;
  while (cursor !== null && hops <= index.parentOf.size) {
    const group = mappedGroup(map, cursor);
    if (group) return group;
    cursor = index.parentOf.get(cursor) ?? null;
    hops += 1;
  }
  return null;
}

/**
 * The group every mapped descendant agrees on, or null if they disagree.
 *
 * Covers the merchant who mapped `Women > Tops > T-Shirts` and `Women > Tops > Blouses` but has a
 * handful of products sitting on `Women > Tops` itself. Both children say Tops, so the parent term
 * is Tops too. If the children disagree — a `Swimwear` term whose leaves went to Tops and Bottoms —
 * there is no safe answer and the product stays unsized rather than being guessed onto one of them.
 */
function agreedAmongDescendants(
  id: string,
  map: CategoryParentMap,
  index: CategoryIndex
): SizingGroup | null {
  const found = new Set<SizingGroup>();
  const queue = [...(index.childrenOf.get(id) ?? [])];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const next = queue.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);

    const group = mappedGroup(map, next);
    if (group) {
      found.add(group);
      if (found.size > 1) return null;
      continue;
    }
    queue.push(...(index.childrenOf.get(next) ?? []));
  }

  return found.size === 1 ? [...found][0] : null;
}

/**
 * The parent sizing category a product belongs to, or null when the merchant's mapping does not
 * reach it.
 *
 * A product usually sits in several categories at once — `Men > Tops > T-Shirts` and `Summer Sale`
 * and `New In`. The most specific one wins, because that is the one that says what the garment
 * actually is; a sale collection says only when it is on offer. Depth ties keep the order the store
 * reported, which is stable per product, so the same catalog resolves the same way on every walk.
 *
 * Null means skip, never "use a default". A product sized against a plausible but wrong chart is
 * excluded from results it should have been in, which is strictly worse than one carrying no chart
 * at all and falling back to the size labels the merchant already published.
 */
export function resolveParentCategory(
  categoryIds: readonly string[],
  map: CategoryParentMap,
  index: CategoryIndex
): SizingGroup | null {
  let best: SizingGroup | null = null;
  let bestDepth = -1;

  for (const id of categoryIds) {
    const group =
      mappedGroup(map, id) ??
      inheritedFromAncestor(id, map, index) ??
      agreedAmongDescendants(id, map, index);
    if (!group) continue;

    const depth = index.depthOf.get(id) ?? 0;
    if (depth > bestDepth) {
      best = group;
      bestDepth = depth;
    }
  }

  return best;
}

/**
 * The parent a product actually sizes on: its Stage 2 correction if it has one, otherwise whatever
 * its category path gives it.
 *
 * The single place that answer is computed. It is needed by the scan, which writes coverage, and by
 * the Stage 2 preview, which shows the merchant what the scan will do — and those two disagreeing
 * would make the preview a liar about the one thing it exists to report.
 */
export function resolveProductParent(
  product: { externalId: string; categoryIds: readonly string[] },
  map: CategoryParentMap,
  overrides: SkuParentOverrides,
  index: CategoryIndex
): SizingGroup | null {
  const override = overrides[product.externalId];
  if (isSizingGroup(override)) return override;
  return resolveParentCategory(product.categoryIds, map, index);
}

/**
 * The category ids the merchant is actually asked about in step 2 — the frontier of their
 * selection, meaning every selected path with no selected path beneath it.
 *
 * Interior terms are left out on purpose. Ticking `Women > Tops` selects its children too, and
 * asking about the branch as well as each of its leaves would be the same question three times.
 * Products filed on the interior term itself still resolve, via `agreedAmongDescendants`.
 */
export function mappableCategoryIds(
  selectedIds: readonly string[],
  index: CategoryIndex
): string[] {
  const selected = new Set(selectedIds);
  return selectedIds.filter((id) => {
    const children = index.childrenOf.get(id) ?? [];
    return !children.some((child) => selected.has(child));
  });
}

/** Whether every path the merchant put in scope has been given a parent. The Categories tab will
 *  not let them leave step 2 until this is true, because an unmapped path is a silent hole in
 *  sizing rather than a visible one. */
export function unmappedCategoryIds(
  selectedIds: readonly string[],
  map: CategoryParentMap,
  index: CategoryIndex
): string[] {
  return mappableCategoryIds(selectedIds, index).filter((id) => !mappedGroup(map, id));
}

/**
 * Words that place a category path on a parent, checked against the path the merchant already
 * wrote. Deliberately nouns for the garment itself — never an audience or an occasion, which say
 * nothing about what has to be measured.
 */
const PARENT_KEYWORDS: Record<SizingGroup, readonly string[]> = {
  footwear: [
    "shoe", "boot", "sneaker", "trainer", "sandal", "heel", "loafer", "footwear", "sock",
    "slipper", "pump", "espadrille", "moccasin", "clog", "flip flop", "plimsoll",
  ],
  dresses: [
    "dress", "gown", "jumpsuit", "playsuit", "romper", "kaftan", "caftan", "frock", "sundress",
    "onesie", "bodysuit", "leotard",
  ],
  outerwear: [
    "coat", "jacket", "blazer", "parka", "anorak", "gilet", "outerwear", "trench", "puffer",
    "windbreaker", "raincoat", "poncho", "bomber", "overcoat",
  ],
  bottoms: [
    "trouser", "pant", "jean", "denim", "short", "skirt", "legging", "chino", "jogger",
    "sweatpant", "bottom", "cargo", "culotte", "brief", "boxer", "tight", "capri", "slack",
  ],
  tops: [
    "shirt", "tee", "top", "blouse", "sweater", "jumper", "hoodie", "sweatshirt", "polo",
    "knit", "cardigan", "tank", "camisole", "bra", "pullover", "tunic", "vest", "bodice",
  ],
};

/**
 * A first guess at the parent for a category path, from the words the merchant already used.
 *
 * The match closest to the *end* of the path wins, which is not arbitrary: English compound nouns
 * carry their head last, so "Dress Shirts" is a shirt and "Shirt Dresses" is a dress. Scoring by
 * keyword count, or by a fixed parent order, gets one of those two wrong whichever way it is tuned.
 *
 * Only ever a suggestion. It fills rows the merchant has not answered, marks them as suggestions
 * rather than choices, and never overwrites one they did answer.
 */
export function suggestParentCategory(path: string): SizingGroup | null {
  const text = path.toLowerCase();

  let best: SizingGroup | null = null;
  let bestEnd = -1;

  for (const group of Object.keys(PARENT_KEYWORDS) as SizingGroup[]) {
    for (const keyword of PARENT_KEYWORDS[group]) {
      // Word-prefix anchored so "top" matches "Tops" but not "Laptop", and "sock" matches "Socks"
      // without also matching every path containing the letters in sequence.
      const match = new RegExp(`\\b${keyword}`, "g");
      let hit: RegExpExecArray | null;
      while ((hit = match.exec(text)) !== null) {
        const end = hit.index + keyword.length;
        if (end > bestEnd) {
          bestEnd = end;
          best = group;
        }
      }
    }
  }

  return best;
}

/**
 * Validates a parent map arriving over the wire, dropping any entry that does not name one of the
 * five parents.
 *
 * Dropping rather than rejecting the whole request is deliberate: the values that fail this are
 * almost always a group the vocabulary used to have, sent by a stale tab the merchant left open.
 * Refusing the save would lose the twenty good mappings alongside the one stale one, and the paths
 * whose entries were dropped simply show as unmapped again.
 */
export function parseCategoryParentMap(value: unknown): CategoryParentMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const parsed: CategoryParentMap = {};
  for (const [id, group] of Object.entries(value as Record<string, unknown>)) {
    if (id && isSizingGroup(group)) parsed[id] = group;
  }
  return parsed;
}

/** Same contract as `parseCategoryParentMap`, over product ids rather than category ids: an entry
 *  naming a group this build does not have is dropped, and that product falls back to inheriting
 *  from its path rather than taking the whole save down with it. */
export function parseSkuParentOverrides(value: unknown): SkuParentOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const parsed: SkuParentOverrides = {};
  for (const [externalId, group] of Object.entries(value as Record<string, unknown>)) {
    if (externalId && isSizingGroup(group)) parsed[externalId] = group;
  }
  return parsed;
}
