import type { StoreCategory } from "@/modules/store/types";

/**
 * Expands a merchant's selection to every category id it actually covers.
 *
 * Needed for the scope check rather than for fetching. Products are tagged with the specific term
 * they sit on, so a product in "Men > Clothing" records only that child — while the merchant
 * selected "Men". Comparing an indexed product against the unexpanded selection would find no
 * overlap and hide the entire subtree.
 *
 * Ids that no longer exist in `categories` are preserved rather than dropped: a category deleted
 * in the store admin should not silently widen the scope of what remains selected.
 */
export function expandCategorySelection(
  selectedIds: readonly string[],
  categories: readonly StoreCategory[]
): string[] {
  if (selectedIds.length === 0) return [];

  const childrenOf = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const bucket = childrenOf.get(category.parentId) ?? [];
    bucket.push(category.id);
    childrenOf.set(category.parentId, bucket);
  }

  const covered = new Set<string>();
  const queue = [...selectedIds];

  while (queue.length > 0) {
    const id = queue.pop()!;
    // Doubles as cycle protection: a self-parenting term would otherwise queue forever.
    if (covered.has(id)) continue;
    covered.add(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }

  return [...covered];
}

/** Categories a merchant can actually choose from. Children come along with their parent. */
export function topLevelCategories(categories: readonly StoreCategory[]): StoreCategory[] {
  return categories.filter((category) => !category.parentId);
}
