import { describe, expect, it } from "vitest";
import type { Product } from "@/modules/shopping-agent/types";
import { filterToRequestedGarmentCategory } from "./category-consistency";

function makeProduct(overrides: Partial<Product> & Pick<Product, "id" | "name">): Product {
  return {
    description: "",
    price: 50,
    currency: "USD",
    imageUrl: "https://example.com/p.jpg",
    categoryId: "1",
    tags: [],
    variants: [],
    rating: 0,
    reviewCount: 0,
    inStock: true,
    ...overrides,
  };
}

describe("filterToRequestedGarmentCategory", () => {
  it("drops a jacket that leaked into shoes results", () => {
    const products = [
      makeProduct({ id: "s1", name: "ID Men Brown Leather Formal Slip-Ons" }),
      makeProduct({ id: "s2", name: "ID Men Black Leather Formal Slip-Ons" }),
      makeProduct({ id: "j1", name: "Brown Solid Casual Jacket" }),
    ];

    const result = filterToRequestedGarmentCategory(products, "shoes");

    expect(result.map((p) => p.id)).toEqual(["s1", "s2"]);
  });

  it("leaves results untouched when the request is ambiguous (no concrete garment type)", () => {
    const products = [
      makeProduct({ id: "s1", name: "Leather Slip-Ons" }),
      makeProduct({ id: "j1", name: "Casual Jacket" }),
    ];

    const result = filterToRequestedGarmentCategory(products, "casual outfit");

    expect(result).toHaveLength(2);
  });

  it("keeps products with unclassifiable names instead of dropping them as false positives", () => {
    const products = [
      makeProduct({ id: "s1", name: "Chelsea 42" }), // no shoe keyword in the name
      makeProduct({ id: "j1", name: "Bomber Jacket" }),
    ];

    const result = filterToRequestedGarmentCategory(products, "shoes");

    expect(result.map((p) => p.id)).toEqual(["s1"]);
  });

  it("fails open when filtering would remove every result", () => {
    const products = [
      makeProduct({ id: "j1", name: "Bomber Jacket" }),
      makeProduct({ id: "j2", name: "Denim Jacket" }),
    ];

    const result = filterToRequestedGarmentCategory(products, "shoes");

    expect(result).toHaveLength(2);
  });
});
