import type { StoreCategory } from "@/modules/store/types";
import type { CategoryNode } from "@/modules/store/sizing/types";

/**
 * Assembles the flat category list both platforms return into a tree.
 *
 * Depth is whatever the store actually has. WooCommerce lets merchants nest as far as they like
 * and the indexer already walks arbitrary depth, so a fixed group/subgroup/leaf shape would be the
 * only place in the system that couldn't represent a real store. Shopify collections carry no
 * parent, so every node comes back as a childless root.
 *
 * A category whose `parentId` points at something absent from the list is treated as a root rather
 * than dropped — otherwise deleting a parent in the store admin would make its children vanish
 * from the picker while they are still indexed.
 */
export function buildCategoryTree(categories: readonly StoreCategory[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  for (const category of categories) {
    nodes.set(category.id, {
      id: category.id,
      name: category.name,
      productCount: category.productCount,
      children: [],
    });
  }

  const roots: CategoryNode[] = [];
  for (const category of categories) {
    const node = nodes.get(category.id)!;
    const parent = category.parentId ? nodes.get(category.parentId) : undefined;
    // Self-parenting would otherwise build a node that contains itself and hang the renderer.
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

/** The node and everything beneath it. */
export function subtreeIds(node: CategoryNode): string[] {
  const ids: string[] = [];
  const stack: CategoryNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    ids.push(current.id);
    stack.push(...current.children);
  }
  return ids;
}

/** Ids on the path from the tree root down to, but not including, `targetId`. */
export function ancestorIds(roots: readonly CategoryNode[], targetId: string): string[] {
  function walk(node: CategoryNode, trail: string[]): string[] | null {
    if (node.id === targetId) return trail;
    for (const child of node.children) {
      const found = walk(child, [...trail, node.id]);
      if (found) return found;
    }
    return null;
  }

  for (const root of roots) {
    const found = walk(root, []);
    if (found) return found;
  }
  return [];
}

export type CheckState = "checked" | "indeterminate" | "unchecked";

/**
 * A selection is always stored closed under descendants — if a node is in the set, everything
 * beneath it is too. That is the shape `expandCategorySelection` produces and the shape every
 * scope check re-derives, so membership alone answers "is this selected".
 */
export function checkStateOf(node: CategoryNode, selected: ReadonlySet<string>): CheckState {
  if (selected.has(node.id)) return "checked";
  const hasSelectedDescendant = node.children.some(
    (child) => checkStateOf(child, selected) !== "unchecked"
  );
  return hasSelectedDescendant ? "indeterminate" : "unchecked";
}

/**
 * Adds the node and its whole subtree.
 *
 * Ancestors are deliberately left alone. Ticking every child does not tick the parent, because a
 * parent in the set means "everything below, forever" — including categories the merchant hasn't
 * created yet. Leaving it out keeps the stored scope to what was actually chosen.
 */
export function selectSubtree(
  selected: ReadonlySet<string>,
  node: CategoryNode
): Set<string> {
  const next = new Set(selected);
  for (const id of subtreeIds(node)) next.add(id);
  return next;
}

/**
 * Removes the node, its subtree, and every ancestor.
 *
 * Dropping the ancestors is the part that is easy to miss and impossible to skip: the indexer
 * re-expands the stored set downward, so leaving a selected parent behind would silently re-add
 * the branch the merchant just unticked. Sibling branches survive because the stored set already
 * lists them explicitly — only the ancestor rows themselves go.
 */
export function deselectSubtree(
  selected: ReadonlySet<string>,
  roots: readonly CategoryNode[],
  node: CategoryNode
): Set<string> {
  const next = new Set(selected);
  for (const id of subtreeIds(node)) next.delete(id);
  for (const id of ancestorIds(roots, node.id)) next.delete(id);
  return next;
}

/**
 * Products the merchant is committing to index.
 *
 * Counted over the topmost selected nodes only. Both platforms report `productCount` inclusive of
 * descendants, so summing every selected id would count a nested catalog several times over and
 * quote a number far above what actually gets indexed.
 */
export function selectedProductCount(
  roots: readonly CategoryNode[],
  selected: ReadonlySet<string>
): number {
  let total = 0;
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (selected.has(node.id)) total += node.productCount;
    else stack.push(...node.children);
  }
  return total;
}

/** Every node in the tree, depth-first, for counting and select-all. */
export function flattenTree(roots: readonly CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = [];
  const stack = [...roots].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    out.push(node);
    stack.push(...[...node.children].reverse());
  }
  return out;
}

/** Ids of nodes matching a search term, plus their ancestors so matches stay reachable. */
export function matchingIds(roots: readonly CategoryNode[], query: string): Set<string> {
  const needle = query.trim().toLowerCase();
  const matches = new Set<string>();
  if (!needle) return matches;

  function walk(node: CategoryNode, trail: string[]): boolean {
    const selfMatches = node.name.toLowerCase().includes(needle);
    let childMatches = false;
    for (const child of node.children) {
      if (walk(child, [...trail, node.id])) childMatches = true;
    }
    if (selfMatches || childMatches) {
      matches.add(node.id);
      for (const id of trail) matches.add(id);
      // A matched parent keeps its whole subtree visible, so "Tops" doesn't hide its leaves.
      if (selfMatches) for (const id of subtreeIds(node)) matches.add(id);
      return true;
    }
    return false;
  }

  for (const root of roots) walk(root, []);
  return matches;
}
