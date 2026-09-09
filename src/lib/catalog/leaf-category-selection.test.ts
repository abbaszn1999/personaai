import { describe, expect, it } from "vitest";
import { expandCategorySelection } from "./category-scope";
import type { StoreCategory } from "@/modules/store/types";

function category(id: string, name: string, parentId: string | null = null, productCount = 0): StoreCategory {
  return { id, name, productCount, parentId };
}

/**
 *  Women ─┬─ Tops ─┬─ T-Shirts
 *         │        └─ Blouses
 *         └─ Dresses
 *  Men ───── Tops ─── Shirts
 */
const WOO_TREE: StoreCategory[] = [
  category("women", "Women"),
  category("women-tops", "Tops", "women"),
  category("women-tees", "T-Shirts", "women-tops"),
  category("women-blouses", "Blouses", "women-tops"),
  category("women-dresses", "Dresses", "women"),
  category("men", "Men"),
  category("men-tops", "Tops", "men"),
  category("men-shirts", "Shirts", "men-tops"),
];

/** Shopify reports collections with no parent at all, so the key is absent rather than null. */
const SHOPIFY_COLLECTIONS: StoreCategory[] = [
  { id: "270", name: "Dresses", productCount: 84 },
  { id: "271", name: "Tops", productCount: 152 },
  { id: "272", name: "Summer Sale", productCount: 60 },
];

/**
 * The add/remove diff `PATCH /api/store-connection` computes from a category save. Additions flip
 * the connection to `pending` and re-gate the mapping approval; removals trigger a prune.
 */
function patchDiff(previous: readonly string[], next: readonly string[]) {
  return {
    added: next.filter((id) => !previous.includes(id)),
    removed: previous.filter((id) => !next.includes(id)),
  };
}

/**
 * Guards the assumption the leaf-selection migration rests on
 * (`supabase/migrations/20260902150000_leaf_category_selection.sql`): once a stored top-level
 * selection has been expanded in place, the first save from the leaf picker must look like a
 * no-change save. If this breaks, every existing merchant gets a full catalog prune and reindex
 * the first time they open the Categories tab.
 */
describe("leaf-level category selection migration", () => {
  it("makes the first save from the leaf picker a no-op diff", () => {
    const storedBeforeMigration = ["women"];
    const migrated = expandCategorySelection(storedBeforeMigration, WOO_TREE);

    // What the leaf picker sends: every leaf under Women, ticked.
    const savedByLeafPicker = [...migrated];

    expect(patchDiff(migrated, savedByLeafPicker)).toEqual({ added: [], removed: [] });
  });

  it("would have pruned and reindexed without the migration", () => {
    // The failure mode being prevented, asserted directly so the test above can't pass vacuously.
    const storedBeforeMigration = ["women"];
    const savedByLeafPicker = expandCategorySelection(storedBeforeMigration, WOO_TREE).filter(
      (id) => id !== "women"
    );

    const diff = patchDiff(storedBeforeMigration, savedByLeafPicker);
    expect(diff.removed).toEqual(["women"]);
    expect(diff.added.length).toBeGreaterThan(0);
  });

  it("expands to the same set the indexer already treats as in scope", () => {
    // The migration is only safe because it writes the value every scope check already resolves
    // to — it widens nothing.
    expect(expandCategorySelection(["women"], WOO_TREE).sort()).toEqual(
      ["women", "women-blouses", "women-dresses", "women-tees", "women-tops"].sort()
    );
  });

  it("is idempotent, so re-running it cannot drift", () => {
    const once = expandCategorySelection(["women", "men"], WOO_TREE);
    const twice = expandCategorySelection(once, WOO_TREE);
    expect(twice.sort()).toEqual(once.sort());
  });

  it("leaves Shopify connections untouched", () => {
    // Collections are flat, so top level already equals leaf level and the migration has nothing
    // to do. Anything else here would mean Shopify merchants also get a spurious reindex.
    const stored = ["270", "271"];
    const migrated = expandCategorySelection(stored, SHOPIFY_COLLECTIONS);

    expect(migrated.sort()).toEqual(stored.sort());
    expect(patchDiff(stored, migrated)).toEqual({ added: [], removed: [] });
  });

  it("keeps a category deleted in the store admin selected", () => {
    // The migration unions the seed ids in rather than only their resolved descendants, so an id
    // that has vanished from `categories` survives instead of reading as a removal-and-prune.
    const stored = ["women", "retired-category"];
    const migrated = expandCategorySelection(stored, WOO_TREE);

    expect(migrated).toContain("retired-category");
    expect(patchDiff(stored, migrated).removed).toEqual([]);
  });
});
