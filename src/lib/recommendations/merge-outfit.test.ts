import { describe, expect, it } from "vitest";
import type { Product } from "@/modules/commerce/types";
import { mergeGarmentIntoOutfit } from "./merge-outfit";

function makeProduct(id: string, name: string): Product {
  return {
    id,
    name,
    description: "",
    price: 50,
    currency: "USD",
    imageUrl: "https://example.com/product.jpg",
    categoryId: "1",
    tags: [],
    variants: [],
    rating: 0,
    reviewCount: 0,
    inStock: true,
  };
}

const shirt = makeProduct("shirt-1", "Oxford Shirt");
const pants = makeProduct("pants-1", "Chino Pants");
const shoes = makeProduct("shoes-1", "Leather Derby Shoes");
const jacket = makeProduct("jacket-1", "Tailored Jacket");

describe("mergeGarmentIntoOutfit", () => {
  it("adds a jacket while keeping the shirt, pants, and shoes", () => {
    const result = mergeGarmentIntoOutfit([shirt, pants, shoes], [jacket]);

    expect(result.map((p) => p.id)).toEqual(["shirt-1", "pants-1", "shoes-1", "jacket-1"]);
  });

  it("replaces an existing jacket while keeping unrelated slots", () => {
    const newJacket = makeProduct("jacket-2", "Wool Blazer");
    const result = mergeGarmentIntoOutfit([shirt, pants, shoes, jacket], [newJacket]);

    expect(result.map((p) => p.id)).toEqual(["shirt-1", "pants-1", "shoes-1", "jacket-2"]);
  });

  it("replaces shoes only", () => {
    const newShoes = makeProduct("shoes-2", "ID Men Brown Leather Formal Slip-Ons");
    const result = mergeGarmentIntoOutfit([shirt, pants, shoes, jacket], [newShoes]);

    expect(result.map((p) => p.id)).toEqual(["shirt-1", "pants-1", "jacket-1", "shoes-2"]);
  });

  it("replaces a separate top and bottom with a dress", () => {
    const dress = makeProduct("dress-1", "Evening Dress");
    const result = mergeGarmentIntoOutfit([shirt, pants, shoes, jacket], [dress]);

    expect(result.map((p) => p.id)).toEqual(["shoes-1", "jacket-1", "dress-1"]);
  });

  it("removes an existing dress when a new top is added", () => {
    const dress = makeProduct("dress-1", "Evening Dress");
    const newTop = makeProduct("shirt-2", "Linen Shirt");
    const result = mergeGarmentIntoOutfit([dress, shoes, jacket], [newTop]);

    expect(result.map((p) => p.id)).toEqual(["shoes-1", "jacket-1", "shirt-2"]);
  });

  it("stacks multiple unclassified accessories", () => {
    const scarf = makeProduct("accessory-1", "Silk Scarf");
    const belt = makeProduct("accessory-2", "Leather Belt");
    const result = mergeGarmentIntoOutfit([shirt], [scarf, belt]);

    expect(result.map((p) => p.id)).toEqual(["shirt-1", "accessory-1", "accessory-2"]);
  });

  it("returns the same outfit when the exact product is already worn", () => {
    const current = [shirt, pants];
    const result = mergeGarmentIntoOutfit(current, [shirt]);

    expect(result).toBe(current);
  });
});
