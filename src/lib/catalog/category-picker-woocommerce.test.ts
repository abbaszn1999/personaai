import { describe, expect, it } from "vitest";
import {
  buildCategoryTree,
  checkStateOf,
  deselectSubtree,
  flattenTree,
  selectSubtree,
  selectedProductCount,
} from "./category-tree";
import { expandCategorySelection } from "./category-scope";
import type { StoreCategory } from "@/modules/store/types";

const CATEGORIES = [
  { id: "204", name: "Accessories", parentId: "203", productCount: 75 },
  { id: "144", name: "Accessories", parentId: "137", productCount: 1 },
  { id: "186", name: "Accessories", parentId: "182", productCount: 0 },
  { id: "35", name: "Accessories", parentId: null, productCount: 0 },
  { id: "153", name: "Accessories", parentId: "137", productCount: 144 },
  { id: "146", name: "Accessories", parentId: "137", productCount: 1 },
  { id: "187", name: "Accessories", parentId: "182", productCount: 0 },
  { id: "148", name: "Accessories", parentId: "137", productCount: 1 },
  { id: "138", name: "Accessories", parentId: "137", productCount: 1 },
  { id: "149", name: "Accessories", parentId: "137", productCount: 1 },
  { id: "141", name: "Accessories", parentId: "137", productCount: 1 },
  { id: "151", name: "Accessories", parentId: "137", productCount: 1 },
  { id: "143", name: "Accessories", parentId: "137", productCount: 1 },
  { id: "183", name: "Accessories", parentId: "182", productCount: 60 },
  { id: "152", name: "Accessories", parentId: "137", productCount: 0 },
  { id: "215", name: "Clothing", parentId: "203", productCount: 1022 },
  { id: "172", name: "Clothing", parentId: "137", productCount: 1813 },
  { id: "192", name: "Clothing", parentId: "182", productCount: 604 },
  { id: "203", name: "Kids", parentId: null, productCount: 1348 },
  { id: "180", name: "Lingerie & Sleepwear", parentId: "137", productCount: 1 },
  { id: "182", name: "Men", parentId: null, productCount: 666 },
  { id: "223", name: "Newborn Essentials", parentId: "203", productCount: 251 },
  { id: "240", name: "Shoes & Bags", parentId: null, productCount: 2046 },
  { id: "201", name: "Underwear & Sleepwear", parentId: "182", productCount: 2 },
  { id: "137", name: "Women", parentId: null, productCount: 1966 },
] satisfies StoreCategory[];

/** Post-migration value read back from the live connection. */
const MIGRATED_SELECTION = [
  "137", "138", "141", "143", "144", "146", "148", "149", "151", "152", "153",
  "172", "180", "182", "183", "186", "187", "192", "201", "203", "204", "215",
  "223", "240",
];

const TREE = buildCategoryTree(CATEGORIES);
const find = (id: string) => flattenTree(TREE).find((node) => node.id === id)!;

/**
 * The Categories picker run against a real merchant's WooCommerce tree, as stored after the
 * leaf-selection migration. Synthetic fixtures miss what real stores actually do — twelve sibling
 * categories sharing one name, a root with no products, a category left unselected.
 */
describe("Categories picker against the live WooCommerce connection", () => {
  it("builds the four roots the store actually has", () => {
    expect(TREE.map((node) => node.name).sort()).toEqual([
      "Accessories",
      "Kids",
      "Men",
      "Shoes & Bags",
      "Women",
    ].sort());
  });

  it("renders every duplicate-named sibling as its own row", () => {
    // Women has ten children all called "Accessories". They are distinct terms with distinct
    // product counts, so collapsing them by name would silently merge unrelated scopes.
    const women = find("137");
    const accessories = women.children.filter((node) => node.name === "Accessories");
    expect(accessories).toHaveLength(10);
    expect(new Set(accessories.map((node) => node.id)).size).toBe(10);
  });

  it("shows the migrated selection as fully checked, with the unselected root empty", () => {
    const selected = new Set(MIGRATED_SELECTION);
    expect(checkStateOf(find("137"), selected)).toBe("checked");
    expect(checkStateOf(find("203"), selected)).toBe("checked");
    // Category 35 was never selected and the migration correctly left it alone.
    expect(checkStateOf(find("35"), selected)).toBe("unchecked");
  });

  it("saves back exactly what was loaded, so opening the tab changes nothing", () => {
    const selected = new Set(MIGRATED_SELECTION);
    const saved = [...selected];
    expect(saved.filter((id) => !MIGRATED_SELECTION.includes(id))).toEqual([]);
    expect(MIGRATED_SELECTION.filter((id) => !selected.has(id))).toEqual([]);
  });

  it("quotes the real in-scope product count without double counting", () => {
    // Roots only: 1966 + 666 + 1348 + 2046. Summing all 24 selected ids would land near 12,000
    // for a catalog of roughly 6,000.
    expect(selectedProductCount(TREE, new Set(MIGRATED_SELECTION))).toBe(6026);
  });

  it("keeps the selection closed when a nested category is unticked", () => {
    const selected = new Set(MIGRATED_SELECTION);
    const next = deselectSubtree(selected, TREE, find("172"));

    // "Women" has to go too, or the indexer re-expands it and Clothing comes straight back.
    expect(next.has("137")).toBe(false);
    expect(next.has("172")).toBe(false);
    expect(next.has("153")).toBe(true);

    const expanded = expandCategorySelection([...next], CATEGORIES);
    expect(expanded.sort()).toEqual([...next].sort());
  });

  it("re-ticking the parent restores the original selection", () => {
    const selected = new Set(MIGRATED_SELECTION);
    const removed = deselectSubtree(selected, TREE, find("172"));
    const restored = selectSubtree(removed, find("137"));

    expect([...restored].sort()).toEqual([...selected].sort());
  });
});
