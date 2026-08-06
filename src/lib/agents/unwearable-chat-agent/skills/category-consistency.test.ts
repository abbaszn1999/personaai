import { describe, expect, it } from "vitest";
import type { Product } from "@/modules/shopping-agent/types";
import type { StoreCategory } from "@/modules/store/types";
import { filterToRequestedCategory } from "./category-consistency";

function makeProduct(overrides: Partial<Product> & Pick<Product, "id" | "name">): Product {
  return {
    description: "",
    price: 50,
    currency: "USD",
    imageUrl: "https://example.com/p.jpg",
    categoryId: "",
    tags: [],
    variants: [],
    rating: 0,
    reviewCount: 0,
    inStock: true,
    ...overrides,
  };
}

const CATEGORIES: StoreCategory[] = [
  { id: "cat-routers", name: "Routers", productCount: 12 },
  { id: "cat-vacuums", name: "Vacuums", productCount: 8 },
];

describe("filterToRequestedCategory", () => {
  it("drops a vacuum that leaked into router results", () => {
    const products = [
      makeProduct({ id: "r1", name: "Mesh WiFi Router 6E", categoryId: "cat-routers" }),
      makeProduct({ id: "r2", name: "Dual-Band Travel Router", categoryId: "cat-routers" }),
      makeProduct({ id: "v1", name: "Cordless Stick Vacuum", categoryId: "cat-vacuums" }),
    ];

    const result = filterToRequestedCategory(products, "cat-routers looking for a fast router", CATEGORIES);

    expect(result.map((p) => p.id)).toEqual(["r1", "r2"]);
  });

  it("leaves results untouched when the request is ambiguous (no category resolves)", () => {
    const products = [
      makeProduct({ id: "r1", name: "Mesh Router", categoryId: "cat-routers" }),
      makeProduct({ id: "v1", name: "Stick Vacuum", categoryId: "cat-vacuums" }),
    ];

    const result = filterToRequestedCategory(products, " something useful for my home", CATEGORIES);

    expect(result).toHaveLength(2);
  });

  it("keeps products with no/unknown category instead of dropping them as false positives", () => {
    const products = [
      makeProduct({ id: "r1", name: "Mesh Router", categoryId: "cat-routers" }),
      makeProduct({ id: "u1", name: "Universal Ethernet Cable", categoryId: "" }),
    ];

    const result = filterToRequestedCategory(products, " router", CATEGORIES);

    expect(result.map((p) => p.id)).toEqual(["r1", "u1"]);
  });

  it("fails open when filtering would remove every result", () => {
    const products = [
      makeProduct({ id: "v1", name: "Cordless Stick Vacuum", categoryId: "cat-vacuums" }),
      makeProduct({ id: "v2", name: "Robot Vacuum", categoryId: "cat-vacuums" }),
    ];

    const result = filterToRequestedCategory(products, "cat-routers fast router", CATEGORIES);

    expect(result).toHaveLength(2);
  });
});
