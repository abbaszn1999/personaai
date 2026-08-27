import { describe, expect, it } from "vitest";
import { expandCategorySelection, topLevelCategories } from "./category-scope";
import type { StoreCategory } from "@/modules/store/types";

function category(id: string, name: string, parentId: string | null = null, productCount = 0): StoreCategory {
  return { id, name, productCount, parentId };
}

/**
 *  Clothing ─┬─ Dresses ─── Summer Dresses
 *            └─ Shirts
 *  Homeware (unrelated, so it can catch over-broad expansion)
 */
const TREE: StoreCategory[] = [
  category("1", "Clothing"),
  category("2", "Dresses", "1"),
  category("3", "Summer Dresses", "2"),
  category("4", "Shirts", "1"),
  category("5", "Homeware"),
  category("6", "Cushions", "5"),
];

describe("expandCategorySelection", () => {
  it("includes descendants at every depth, not just direct children", () => {
    // The grandchild is the case that matters: products are filed on leaf terms, so stopping at
    // one level would index a fraction of what the merchant selected.
    expect(expandCategorySelection(["1"], TREE).sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("does not reach into unselected sibling branches", () => {
    expect(expandCategorySelection(["5"], TREE).sort()).toEqual(["5", "6"]);
  });

  it("returns nothing for an empty selection rather than everything", () => {
    // The whole point of the rebuild: an empty selection must never widen to the full catalog,
    // which would spend a per-product enrichment budget on the entire store.
    expect(expandCategorySelection([], TREE)).toEqual([]);
  });

  it("keeps ids that no longer exist in the store", () => {
    // A category deleted in the store admin shouldn't silently broaden what remains selected.
    expect(expandCategorySelection(["99"], TREE)).toEqual(["99"]);
  });

  it("deduplicates when a parent and its child are both selected", () => {
    expect(expandCategorySelection(["1", "2"], TREE).sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("terminates on a parent cycle", () => {
    // Not reachable through either platform's admin, but a cycle here would hang the indexing
    // job rather than fail it, which is far harder to notice.
    const cyclic: StoreCategory[] = [category("a", "A", "b"), category("b", "B", "a")];
    expect(expandCategorySelection(["a"], cyclic).sort()).toEqual(["a", "b"]);
  });
});

describe("topLevelCategories", () => {
  it("offers only parents, since children are implied by their parent", () => {
    expect(topLevelCategories(TREE).map((c) => c.name)).toEqual(["Clothing", "Homeware"]);
  });
});
