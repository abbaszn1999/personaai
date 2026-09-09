import { describe, expect, it } from "vitest";
import {
  ancestorIds,
  buildCategoryTree,
  checkStateOf,
  deselectSubtree,
  flattenTree,
  matchingIds,
  selectSubtree,
  selectedProductCount,
  subtreeIds,
} from "./category-tree";
import { expandCategorySelection } from "./category-scope";
import type { StoreCategory } from "@/modules/store/types";

function category(id: string, name: string, parentId: string | null = null, productCount = 0): StoreCategory {
  return { id, name, productCount, parentId };
}

/**
 *  Women (100) ─┬─ Tops (60) ─┬─ T-Shirts (35)
 *               │             └─ Blouses (25)
 *               └─ Dresses (40)
 *  Men (50) ───── Shirts (50)
 */
const WOO: StoreCategory[] = [
  category("women", "Women", null, 100),
  category("women-tops", "Tops", "women", 60),
  category("women-tees", "T-Shirts", "women-tops", 35),
  category("women-blouses", "Blouses", "women-tops", 25),
  category("women-dresses", "Dresses", "women", 40),
  category("men", "Men", null, 50),
  category("men-shirts", "Shirts", "men", 50),
];

const SHOPIFY: StoreCategory[] = [
  { id: "270", name: "Dresses", productCount: 84 },
  { id: "271", name: "Tops", productCount: 152 },
];

const TREE = buildCategoryTree(WOO);
const find = (id: string) => flattenTree(TREE).find((node) => node.id === id)!;

describe("buildCategoryTree", () => {
  it("nests to whatever depth the store has", () => {
    expect(TREE.map((n) => n.id)).toEqual(["women", "men"]);
    expect(find("women-tops").children.map((n) => n.id)).toEqual(["women-tees", "women-blouses"]);
  });

  it("returns flat roots for Shopify collections", () => {
    const shopifyTree = buildCategoryTree(SHOPIFY);
    expect(shopifyTree).toHaveLength(2);
    expect(shopifyTree.every((node) => node.children.length === 0)).toBe(true);
  });

  it("promotes an orphan to a root instead of dropping it", () => {
    // A parent deleted in the store admin must not make its children disappear from the picker
    // while their products are still indexed.
    const orphaned = buildCategoryTree([category("child", "Child", "missing-parent")]);
    expect(orphaned.map((n) => n.id)).toEqual(["child"]);
  });

  it("does not hang on a self-parenting category", () => {
    const tree = buildCategoryTree([category("loop", "Loop", "loop")]);
    expect(tree.map((n) => n.id)).toEqual(["loop"]);
    expect(tree[0].children).toEqual([]);
  });
});

describe("subtreeIds / ancestorIds", () => {
  it("collects a node and everything under it", () => {
    expect(subtreeIds(find("women-tops")).sort()).toEqual(
      ["women-blouses", "women-tees", "women-tops"].sort()
    );
  });

  it("walks from the root down to the node, exclusive", () => {
    expect(ancestorIds(TREE, "women-tees")).toEqual(["women", "women-tops"]);
    expect(ancestorIds(TREE, "women")).toEqual([]);
  });
});

describe("checkStateOf", () => {
  it("marks a node with only some descendants selected as indeterminate", () => {
    const selected = new Set(["women-tees"]);
    expect(checkStateOf(find("women-tees"), selected)).toBe("checked");
    expect(checkStateOf(find("women-tops"), selected)).toBe("indeterminate");
    expect(checkStateOf(find("women"), selected)).toBe("indeterminate");
    expect(checkStateOf(find("men"), selected)).toBe("unchecked");
  });
});

describe("selection stays closed under descendants", () => {
  /**
   * The invariant the whole model rests on: every scope check re-expands the stored set downward
   * (`expandCategorySelection`), so a set that grows when expanded means the UI is showing one
   * thing and the indexer is doing another.
   */
  function isClosed(selected: ReadonlySet<string>): boolean {
    const expanded = expandCategorySelection([...selected], WOO);
    return expanded.length === selected.size && expanded.every((id) => selected.has(id));
  }

  it("holds after selecting a parent", () => {
    const next = selectSubtree(new Set(), find("women"));
    expect(isClosed(next)).toBe(true);
    expect([...next].sort()).toEqual(
      ["women", "women-tops", "women-tees", "women-blouses", "women-dresses"].sort()
    );
  });

  it("holds after unticking one leaf beneath a selected parent", () => {
    // The case that silently breaks if ancestors are left behind: "women" would still be stored,
    // and the indexer would re-expand it straight back into the branch just removed.
    const all = selectSubtree(new Set(), find("women"));
    const next = deselectSubtree(all, TREE, find("women-tees"));

    expect(next.has("women")).toBe(false);
    expect(next.has("women-tops")).toBe(false);
    expect(next.has("women-tees")).toBe(false);
    expect(isClosed(next)).toBe(true);
  });

  it("keeps sibling branches when an ancestor is dropped", () => {
    const all = selectSubtree(new Set(), find("women"));
    const next = deselectSubtree(all, TREE, find("women-tees"));

    // Dropping "women" and "women-tops" must not take Dresses or Blouses with them.
    expect(next.has("women-dresses")).toBe(true);
    expect(next.has("women-blouses")).toBe(true);
  });

  it("holds through a select/deselect round trip", () => {
    let selected: ReadonlySet<string> = new Set();
    selected = selectSubtree(selected, find("women"));
    selected = selectSubtree(selected, find("men"));
    selected = deselectSubtree(selected, TREE, find("women-blouses"));
    selected = deselectSubtree(selected, TREE, find("men-shirts"));

    expect(isClosed(selected)).toBe(true);
    expect(selected.has("men")).toBe(false);
    expect(selected.has("women-tees")).toBe(true);
  });

  it("degenerates to plain add/remove on flat Shopify collections", () => {
    const shopifyTree = buildCategoryTree(SHOPIFY);
    const selected = selectSubtree(new Set(), shopifyTree[0]);
    expect([...selected]).toEqual(["270"]);
    expect([...deselectSubtree(selected, shopifyTree, shopifyTree[0])]).toEqual([]);
  });
});

describe("selectedProductCount", () => {
  it("counts the topmost selected nodes only", () => {
    // productCount already includes descendants on both platforms, so adding every selected id
    // would quote 100 + 60 + 35 + 25 + 40 for a branch that indexes 100 products.
    const selected = selectSubtree(new Set(), find("women"));
    expect(selectedProductCount(TREE, selected)).toBe(100);
  });

  it("falls through to children when the parent is not selected", () => {
    const selected = new Set(["women-tees", "women-dresses"]);
    expect(selectedProductCount(TREE, selected)).toBe(75);
  });

  it("is zero for an empty selection", () => {
    expect(selectedProductCount(TREE, new Set())).toBe(0);
  });
});

describe("matchingIds", () => {
  it("keeps ancestors of a match visible", () => {
    const matches = matchingIds(TREE, "blouses");
    expect(matches.has("women-blouses")).toBe(true);
    expect(matches.has("women-tops")).toBe(true);
    expect(matches.has("women")).toBe(true);
    expect(matches.has("men")).toBe(false);
  });

  it("keeps the whole subtree of a matched parent", () => {
    const matches = matchingIds(TREE, "tops");
    expect(matches.has("women-tees")).toBe(true);
    expect(matches.has("women-blouses")).toBe(true);
  });

  it("returns nothing for an empty query, meaning no filtering", () => {
    expect(matchingIds(TREE, "   ").size).toBe(0);
  });
});
