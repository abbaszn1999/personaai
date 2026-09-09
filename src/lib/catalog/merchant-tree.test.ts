import { describe, expect, it } from "vitest";
import { merchantTreePaths, parseMerchantTree, selectedCollectionIds } from "./merchant-tree";
import type { MerchantTreeNode } from "@/modules/store/types";

function leaf(id: string, name: string, collectionId: string, productCount = 10) {
  return { id, name, collectionId, productCount };
}

/** `T-Shirts` deliberately hangs off both departments, which is how plenty of Shopify stores are
 *  actually arranged: one collection, two places to reach it. */
const TREE: MerchantTreeNode[] = [
  {
    id: "d-women",
    name: "Women",
    collectionId: "col-women",
    subGroups: [
      {
        id: "s-women-tops",
        name: "Tops",
        collectionId: "col-tops",
        leafs: [leaf("l-w-tees", "T-Shirts", "col-tshirts", 400), leaf("l-w-blouses", "Blouses", "col-blouses", 120)],
      },
    ],
  },
  {
    id: "d-men",
    name: "Men",
    collectionId: "col-men",
    subGroups: [
      {
        id: "s-men-tops",
        name: "Tops",
        collectionId: "col-tops",
        leafs: [leaf("l-m-tees", "T-Shirts", "col-tshirts", 400)],
      },
    ],
  },
];

describe("merchantTreePaths", () => {
  it("gives every leaf the breadcrumb its nesting earns it", () => {
    expect(merchantTreePaths(TREE).map((path) => path.path)).toEqual([
      "Women > Tops > T-Shirts",
      "Women > Tops > Blouses",
      "Men > Tops > T-Shirts",
    ]);
  });

  it("leaves out a leaf the merchant typed but never filled in", () => {
    // No collection behind it means no products, so there is nothing to put in scope and no parent
    // worth asking about. It stays in the tree as structure; it just is not a path.
    const sketched: MerchantTreeNode[] = [
      {
        id: "d",
        name: "Women",
        collectionId: null,
        subGroups: [{ id: "s", name: "Tops", collectionId: null, leafs: [leaf("l", "T-Shirts", "")] }],
      },
    ];

    expect(merchantTreePaths(sketched)).toEqual([]);
  });
});

describe("selectedCollectionIds", () => {
  it("reports one collection reached from two departments exactly once", () => {
    // Indexing walks these ids and the parent mapping keys on them, so a duplicate would mean the
    // same question asked twice with no way to reconcile two different answers.
    const ids = selectedCollectionIds(TREE, ["l-w-tees", "l-m-tees", "l-w-blouses"]);

    expect(ids.sort()).toEqual(["col-blouses", "col-tshirts"]);
  });

  it("ignores leaves the merchant left unticked", () => {
    expect(selectedCollectionIds(TREE, ["l-w-blouses"])).toEqual(["col-blouses"]);
  });
});

describe("parseMerchantTree", () => {
  it("keeps a hand-typed leaf rather than dropping the structure someone sketched", () => {
    const parsed = parseMerchantTree([
      {
        id: "d",
        name: "Women",
        subGroups: [{ id: "s", name: "Tops", leafs: [{ id: "l", name: "T-Shirts" }] }],
      },
    ]);

    expect(parsed[0].subGroups[0].leafs[0]).toEqual({
      id: "l",
      name: "T-Shirts",
      collectionId: "",
      productCount: 0,
    });
  });

  it("drops one malformed node instead of refusing the whole save", () => {
    // The merchant may have spent ten minutes assembling this. Losing the branch that came back
    // without a name is a far better outcome than losing all of them.
    const parsed = parseMerchantTree([
      { id: "good", name: "Women", subGroups: [] },
      { id: "bad", subGroups: [] },
    ]);

    expect(parsed.map((node) => node.id)).toEqual(["good"]);
  });

  it("returns an empty tree for anything that is not an array", () => {
    expect(parseMerchantTree(null)).toEqual([]);
    expect(parseMerchantTree({ id: "d", name: "Women" })).toEqual([]);
  });

  it("refuses a negative or non-numeric product count rather than storing it", () => {
    const parsed = parseMerchantTree([
      {
        id: "d",
        name: "Women",
        subGroups: [
          { id: "s", name: "Tops", leafs: [{ id: "l", name: "Tees", collectionId: "c", productCount: -5 }] },
        ],
      },
    ]);

    expect(parsed[0].subGroups[0].leafs[0].productCount).toBe(0);
  });
});
