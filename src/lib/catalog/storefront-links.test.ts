import { describe, expect, it } from "vitest";
import { leafSourceLinks, storefrontCategoryUrl } from "./storefront-links";
import type { StoreCategory } from "@/modules/store/types";

describe("storefrontCategoryUrl", () => {
  it("links a Shopify collection by its handle", () => {
    expect(storefrontCategoryUrl("shopify", "shop.myshopify.com", { handle: "men-shirts" })).toBe(
      "https://shop.myshopify.com/collections/men-shirts",
    );
  });

  it("links a WooCommerce category by slug on any permalink setting, keeping a subdirectory install", () => {
    expect(storefrontCategoryUrl("woocommerce", "https://example.com/shop/", { handle: "t-shirts" })).toBe(
      "https://example.com/shop/?product_cat=t-shirts",
    );
    expect(storefrontCategoryUrl("wordpress", "example.com", { handle: "jeans" })).toBe(
      "https://example.com/?product_cat=jeans",
    );
  });

  it("gives no link without a handle, a store address, or a platform with public category pages", () => {
    expect(storefrontCategoryUrl("shopify", "shop.myshopify.com", {})).toBeNull();
    expect(storefrontCategoryUrl("shopify", " ", { handle: "x" })).toBeNull();
    expect(storefrontCategoryUrl("custom", "shop.example", { handle: "x" })).toBeNull();
  });
});

describe("leafSourceLinks", () => {
  const categories: StoreCategory[] = [
    { id: "women", name: "Women", productCount: 900, parentId: null, handle: "women" },
    { id: "tops", name: "Tops", productCount: 500, parentId: "women", handle: "women-tops" },
    { id: "tees", name: "T-Shirts", productCount: 300, parentId: "tops", handle: "women-tees" },
    { id: "tanks", name: "Tank Tops", productCount: 80, parentId: "tops", handle: "women-tanks" },
    { id: "basics", name: "Basics", productCount: 40, parentId: "tees" },
  ];

  it("lists every category mapped straight to a leaf, biggest first, with its trail", () => {
    const links = leafSourceLinks(
      {
        tanks: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" },
        tees: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" },
        women: { status: "excluded" },
      },
      categories,
      "woocommerce",
      "example.com",
    );

    expect(Object.keys(links)).toEqual(["women:top:t-shirt"]);
    expect(links["women:top:t-shirt"]).toEqual([
      {
        categoryId: "tees",
        name: "T-Shirts",
        trail: ["Women", "Tops", "T-Shirts"],
        productCount: 300,
        url: "https://example.com/?product_cat=women-tees",
      },
      {
        categoryId: "tanks",
        name: "Tank Tops",
        trail: ["Women", "Tops", "Tank Tops"],
        productCount: 80,
        url: "https://example.com/?product_cat=women-tanks",
      },
    ]);
  });

  it("does not list a child that only inherits its parent's mapping, and skips unknown categories", () => {
    const links = leafSourceLinks(
      {
        tees: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" },
        gone: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" },
      },
      categories,
      "shopify",
      "shop.myshopify.com",
    );

    expect(links["women:top:t-shirt"]?.map((link) => link.categoryId)).toEqual(["tees"]);
  });

  it("keeps a category with no handle, without a link", () => {
    const links = leafSourceLinks(
      { basics: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" } },
      categories,
      "shopify",
      "shop.myshopify.com",
    );

    expect(links["women:top:t-shirt"]?.[0]).toMatchObject({ name: "Basics", url: null });
  });
});
