import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreCategory } from "@/modules/store/types";
import type { CategoryLookup } from "./index-product";
import type { RawCatalogProduct } from "./sync-types";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SECRET_KEY ??= "test-key";

const syncProductToAcs = vi.fn();
const downgradeAcsProductIfExists = vi.fn();
const fetchExistingAcsSourceCategoryIds = vi.fn();

vi.mock("@/lib/catalog/acs/sync", () => ({
  syncProductToAcs: (...args: unknown[]) => syncProductToAcs(...args),
  downgradeAcsProductIfExists: (...args: unknown[]) => downgradeAcsProductIfExists(...args),
  fetchExistingAcsSourceCategoryIds: (...args: unknown[]) => fetchExistingAcsSourceCategoryIds(...args),
}));

const { indexSingleProduct, indexProductIfInScope, resolveCategoryPaths, resolveGarmentCategory } = await import(
  "./index-product"
);

const categories: StoreCategory[] = [
  { id: "10", name: "Men", productCount: 500, parentId: null },
  { id: "12", name: "mens pants", productCount: 120, parentId: "10" },
  { id: "13", name: "Shirts", productCount: 60, parentId: "12" },
  { id: "20", name: "Shoes & Bags", productCount: 80, parentId: null },
];

// The merchant only ever selects top-level categories (the UI enforces this) — "mens pants" and
// "Shirts" below are exercised as things a product is *tagged with*, not as a selection.
const connection: CategoryLookup = {
  selectedCategoryIds: ["10", "20"],
  categories,
};

const product: RawCatalogProduct = {
  externalId: "gid://shopify/Product/1",
  productGroupId: "linen-shirt",
  sku: "LS-01",
  title: "Relaxed Fit Linen Shirt",
  description: "Breathable linen, camp collar.",
  brand: "Aria",
  rawCategories: ["Shirts"],
  sourceCategoryIds: ["12"],
  price: 68,
  currency: "USD",
  inStock: true,
  productUrl: "https://store.example.com/linen-shirt",
  imageUrl: "https://cdn.example.com/linen-shirt.webp",
  images: [],
  variantOptions: {},
  updatedAt: null,
};

beforeEach(() => {
  syncProductToAcs.mockReset().mockResolvedValue(true);
  downgradeAcsProductIfExists.mockReset().mockResolvedValue(false);
  fetchExistingAcsSourceCategoryIds.mockReset().mockResolvedValue([]);
});

describe("indexSingleProduct", () => {
  it("syncs the product to ACS and reports the outcome", async () => {
    expect(await indexSingleProduct("conn-1", product, ["12"], connection)).toBe("indexed");
    expect(syncProductToAcs).toHaveBeenCalledOnce();
    expect(syncProductToAcs).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "conn-1", sourceCategoryIds: ["12"] })
    );
  });

  it("reports failure instead of throwing when the ACS write fails", async () => {
    syncProductToAcs.mockResolvedValue(false);
    expect(await indexSingleProduct("conn-1", product, ["12"], connection)).toBe("failed");
  });
});

describe("indexProductIfInScope", () => {
  const scopedConnection = { ...connection, id: "conn-1" } as unknown as Parameters<typeof indexProductIfInScope>[0];

  it("indexes a product whose reported categories overlap the selection", async () => {
    const outcome = await indexProductIfInScope(scopedConnection, product);
    expect(outcome).toBe("indexed");
    expect(syncProductToAcs).toHaveBeenCalledOnce();
  });

  it("reports out-of-scope without touching ACS when nothing overlaps and it never existed", async () => {
    downgradeAcsProductIfExists.mockResolvedValue(false);
    const outcome = await indexProductIfInScope(scopedConnection, { ...product, sourceCategoryIds: ["99"] });
    expect(outcome).toBe("out-of-scope");
    expect(syncProductToAcs).not.toHaveBeenCalled();
  });

  it("reports removed when a previously-indexed product falls out of scope", async () => {
    downgradeAcsProductIfExists.mockResolvedValue(true);
    const outcome = await indexProductIfInScope(scopedConnection, { ...product, sourceCategoryIds: ["99"] });
    expect(outcome).toBe("removed");
    expect(downgradeAcsProductIfExists).toHaveBeenCalledWith("conn-1", product.externalId);
  });

  it("falls back to ACS's recorded membership when the payload omits categories", async () => {
    fetchExistingAcsSourceCategoryIds.mockResolvedValue(["12"]);
    const outcome = await indexProductIfInScope(scopedConnection, { ...product, sourceCategoryIds: [] });
    expect(outcome).toBe("indexed");
    expect(fetchExistingAcsSourceCategoryIds).toHaveBeenCalledWith("conn-1", product.externalId);
  });

  it("reports out-of-scope when the merchant has selected nothing", async () => {
    const outcome = await indexProductIfInScope({ ...scopedConnection, selectedCategoryIds: [] }, product);
    expect(outcome).toBe("out-of-scope");
    expect(syncProductToAcs).not.toHaveBeenCalled();
  });

  it("fails, rather than downgrading a live product, when the membership read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchExistingAcsSourceCategoryIds.mockResolvedValue(null);

    // A null read means membership is unknown. Treating it as "belongs to nothing" would take an
    // in-scope product off the storefront over a transient 429; failing lets the webhook redeliver.
    const outcome = await indexProductIfInScope(scopedConnection, { ...product, sourceCategoryIds: [] });

    expect(outcome).toBe("failed");
    expect(downgradeAcsProductIfExists).not.toHaveBeenCalled();
    expect(syncProductToAcs).not.toHaveBeenCalled();
  });
});

describe("resolveCategoryPaths", () => {
  it("uses the merchant's own category name, walking up from the product's tag to the selected parent", () => {
    // The product is tagged with "mens pants" (a child of "Men"); "Men" is what's selected.
    expect(resolveCategoryPaths(product, connection)).toEqual([["Men", "mens pants"]]);
  });

  it("keeps every level of a chain deeper than two, in order, rather than collapsing the middle", () => {
    // "Men" is selected; the product is tagged with "Shirts", a grandchild of "Men" via "mens
    // pants". The full chain survives, root-first, so a sub-sub-category isn't lost.
    expect(resolveCategoryPaths({ ...product, sourceCategoryIds: ["13"] }, connection)).toEqual([
      ["Men", "mens pants", "Shirts"],
    ]);
  });

  it("keeps every selected category a product belongs to, not just one", () => {
    // A wallet filed under both "mens pants" (under "Men") and "Shoes & Bags" must be reachable
    // through either — picking a single winner would make it invisible under the other.
    expect(resolveCategoryPaths({ ...product, sourceCategoryIds: ["12", "20"] }, connection)).toEqual([
      ["Men", "mens pants"],
      ["Shoes & Bags"],
    ]);
  });

  it("ignores categories the product carries that aren't selected for indexing", () => {
    const unselected: CategoryLookup = { selectedCategoryIds: ["10"], categories };
    expect(resolveCategoryPaths({ ...product, sourceCategoryIds: ["12", "20"] }, unselected)).toEqual([
      ["Men", "mens pants"],
    ]);
  });

  it("returns a single-element path for a top-level category with no children tagged", () => {
    const topLevelOnly: CategoryLookup = { selectedCategoryIds: ["20"], categories };
    expect(resolveCategoryPaths({ ...product, sourceCategoryIds: ["20"] }, topLevelOnly)).toEqual([["Shoes & Bags"]]);
  });

  it("matches a product tagged directly with a selected non-top-level category, as its own single-element root", () => {
    // Selection is normally top-level only, but the resolver doesn't assume that — a directly
    // selected/tagged match is its own root, not collapsed under its own parent.
    const childSelected: CategoryLookup = { selectedCategoryIds: ["12"], categories };
    expect(resolveCategoryPaths({ ...product, sourceCategoryIds: ["12"] }, childSelected)).toEqual([["mens pants"]]);
  });

  it("returns nothing when the product carries no selected category", () => {
    expect(resolveCategoryPaths({ ...product, sourceCategoryIds: [] }, connection)).toEqual([]);
  });

  it("returns nothing when the product's tag has no path up to any selected category", () => {
    const other: CategoryLookup = { selectedCategoryIds: ["20"], categories };
    expect(resolveCategoryPaths({ ...product, sourceCategoryIds: ["13"] }, other)).toEqual([]);
  });
});

describe("resolveGarmentCategory", () => {
  it("derives the internal try-on slot from the title alone", () => {
    // Independent of the real store category — a wallet titled as such should never be treated
    // as a pair of trousers just because it happens to sit in a "mens pants" merchandising bucket.
    expect(resolveGarmentCategory(product)).toEqual({ garmentCategory: "tops", garmentSubcategory: "shirt" });

    expect(
      resolveGarmentCategory({ ...product, title: "Greyson Logo Billfold Wallet With Coin Pocket" })
    ).toEqual({ garmentCategory: "bags", garmentSubcategory: "wallet" });
  });

  it("returns nulls rather than guessing when the title identifies nothing", () => {
    expect(resolveGarmentCategory({ ...product, title: "Item 4471" })).toEqual({
      garmentCategory: null,
      garmentSubcategory: null,
    });
  });
});
