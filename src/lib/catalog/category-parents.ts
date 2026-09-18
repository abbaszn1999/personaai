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

/**
 * The answer for a path that is a container rather than a garment slot.
 *
 * `Women > Clothing` on a real store holds 1,185 products whose only category is that term — a
 * t-shirt, a knit maxi dress, wide-leg trousers and a tweed jacket among the first fifteen. None of
 * the five parents is right for all of them, and picking the most common one sizes every other
 * garment in the path against the wrong chart. So the merchant says what the path *is* instead, and
 * anything filed directly on it stays out of sizing rather than being sized wrongly.
 *
 * Deliberately not a sixth `SizingGroup`. A parent is a set of body measurements — that is what a
 * chart is researched against and what a recommendation is computed from — and a container has
 * none, so one placed in that vocabulary would be a parent nothing could ever fill. It lives in the
 * parent map's value space only, which is what the guards below are for.
 */
export const MAIN_CATEGORY = "main";

/** Everything the merchant can answer a path with: one of the five parents, or "this is a
 *  container". */
export type ParentAnswer = SizingGroup | typeof MAIN_CATEGORY;

export function isMainCategory(value: unknown): value is typeof MAIN_CATEGORY {
  return value === MAIN_CATEGORY;
}

export function isParentAnswer(value: unknown): value is ParentAnswer {
  return isSizingGroup(value) || isMainCategory(value);
}

/** Whether a path has been answered at all. Distinct from having a sizing group, because a container
 *  is a decision the merchant made and must not keep blocking them. */
export function hasParentAnswer(map: CategoryParentMap, id: string): boolean {
  return isParentAnswer(map[id]);
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
    // A container is an answer, so the walk stops on it rather than reaching past it for a
    // grandparent's parent — which would be inheriting from a term the merchant never mapped.
    if (isMainCategory(map[cursor])) return null;
    const group = mappedGroup(map, cursor);
    if (group) return group;
    cursor = index.parentOf.get(cursor) ?? null;
    hops += 1;
  }
  return null;
}

/**
 * Every group the mapped descendants of a term name, stopping at the first mapped one down each
 * branch. Empty when nothing below is mapped yet.
 */
function descendantGroups(
  id: string,
  map: CategoryParentMap,
  index: CategoryIndex
): Set<SizingGroup> {
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
      continue;
    }
    queue.push(...(index.childrenOf.get(next) ?? []));
  }

  return found;
}

/**
 * The group every mapped descendant agrees on, or null if they disagree.
 *
 * Covers the merchant who mapped `Women > Tops > T-Shirts` and `Women > Tops > Blouses` but has a
 * handful of products sitting on `Women > Tops` itself. Both children say Tops, so the parent term
 * is Tops too. If the children disagree — a `Swimwear` term whose leaves went to Tops and Bottoms —
 * there is no safe answer, and `mappableCategoryIds` puts the branch itself on the grid rather than
 * letting the products on it fall out of sizing.
 */
function agreedAmongDescendants(
  id: string,
  map: CategoryParentMap,
  index: CategoryIndex
): SizingGroup | null {
  const found = descendantGroups(id, map, index);
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
  return resolveParentSelection(categoryIds, map, index)?.group ?? null;
}

/** Which category won, as well as what it answered. */
export interface ParentSelection {
  /** The platform's own term id — the most specific category that produced this group. Stage 5 keys
   *  chart assignments on it, so it has to be the same winner the sizing itself came from. */
  categoryId: string;
  group: SizingGroup;
}

/**
 * `resolveParentCategory`, keeping the category that won.
 *
 * Split out rather than duplicated, because Stage 5 assigns a chart to a merchant category path and
 * therefore needs the *same* path the product was sized from. A second implementation that picked
 * "the deepest category" independently would silently diverge on exactly the products where the
 * mapping is subtle — inherited from an ancestor, or agreed among leaves — and hand those SKUs a
 * chart chosen for a different path.
 */
export function resolveParentSelection(
  categoryIds: readonly string[],
  map: CategoryParentMap,
  index: CategoryIndex
): ParentSelection | null {
  let best: ParentSelection | null = null;
  let bestDepth = -1;

  for (const id of categoryIds) {
    // A container answers with nothing, and that has to short-circuit: falling through would hand
    // the product whatever its ancestors or its own leaves say, which is the sizing the merchant
    // just declined. A product also filed on a sub-category still takes that, since it is deeper.
    if (isMainCategory(map[id])) continue;

    const group =
      mappedGroup(map, id) ??
      inheritedFromAncestor(id, map, index) ??
      agreedAmongDescendants(id, map, index);
    if (!group) continue;

    const depth = index.depthOf.get(id) ?? 0;
    if (depth > bestDepth) {
      best = { categoryId: id, group };
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
  return resolveProductParentSelection(product, map, overrides, index)?.group ?? null;
}

/**
 * `resolveProductParent`, keeping the category the answer came from.
 *
 * A corrected product keeps its path. The override says which *parent* to size it on, not which
 * category it sits in, so Stage 5 still assigns it alongside its neighbours — and a merchant who
 * moved one t-shirt out of `dresses` does not get a one-product path of its own to assign.
 *
 * Null path with a real group is therefore possible: a product whose only categories the merchant
 * declared containers, corrected by hand in Stage 2. It is sized, and it has no path to assign, and
 * both of those are true at once.
 */
export function resolveProductParentSelection(
  product: { externalId: string; categoryIds: readonly string[] },
  map: CategoryParentMap,
  overrides: SkuParentOverrides,
  index: CategoryIndex
): { categoryId: string | null; group: SizingGroup } | null {
  const selection = resolveParentSelection(product.categoryIds, map, index);
  const override = overrides[product.externalId];
  if (isSizingGroup(override)) return { categoryId: selection?.categoryId ?? null, group: override };
  return selection;
}

/**
 * The category ids the merchant is actually asked about in step 2 — the frontier of their
 * selection, plus any branch above it that its own leaves cannot answer for.
 *
 * The frontier alone is every selected path with no selected path beneath it. Interior terms are
 * normally left out on purpose: ticking `Women > Tops` selects its children too, and asking about
 * the branch as well as each of its leaves would be the same question twice, because products filed
 * on the branch itself resolve through `agreedAmongDescendants`.
 *
 * That reasoning holds only while the leaves agree. A branch whose leaves went to two different
 * parents — `Women > Clothing` over Tops, Bottoms, Dresses and Outerwear — has no answer to inherit,
 * so anything filed directly on it fell out of sizing entirely, and the grid never asked. On one
 * real store that was 2,200 of 5,400 products: the branch held 1,797 while its thirteen children
 * accounted for 612. So a branch in that state gets a row of its own.
 *
 * Only once its leaves disagree, which is why this needs the map. An unanswered branch over
 * unanswered leaves is not yet a question — it is the same question as its leaves, and asking it up
 * front would put every interior term on the grid.
 */
export function mappableCategoryIds(
  selectedIds: readonly string[],
  index: CategoryIndex,
  map: CategoryParentMap = {}
): string[] {
  const selected = new Set(selectedIds);

  return selectedIds.filter((id) => {
    const children = index.childrenOf.get(id) ?? [];
    if (!children.some((child) => selected.has(child))) return true;
    // Answered as a container: the row stays so the merchant can see and revisit it, including if
    // their leaves have since come to agree and it would otherwise vanish with the answer still on.
    if (isMainCategory(map[id])) return true;
    // Already answered, or answerable from an ancestor or from agreeing leaves.
    if (resolveParentCategory([id], map, index)) return false;
    return descendantGroups(id, map, index).size > 1;
  });
}

/**
 * Whether every path the merchant put in scope has been answered. The Categories tab will not let
 * them leave step 2 until this is true, because an unanswered path is a silent hole in sizing rather
 * than a visible one.
 *
 * Answered, not mapped: `MAIN_CATEGORY` counts. A path the merchant has looked at and declared a
 * container is a decision, and holding them on this screen over it would leave them stuck on a
 * question that has no right answer among the five.
 */
export function unmappedCategoryIds(
  selectedIds: readonly string[],
  map: CategoryParentMap,
  index: CategoryIndex
): string[] {
  return mappableCategoryIds(selectedIds, index, map).filter((id) => !hasParentAnswer(map, id));
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
 * Validates a parent map arriving over the wire, dropping any entry that names neither one of the
 * five parents nor `MAIN_CATEGORY`.
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
    if (id && isParentAnswer(group)) parsed[id] = group;
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
