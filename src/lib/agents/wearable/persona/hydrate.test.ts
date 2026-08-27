import { describe, expect, it } from "vitest";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import { toProduct } from "./hydrate";

function candidate(overrides: Partial<CatalogCandidate> = {}): CatalogCandidate {
  return {
    externalId: "p1",
    productGroupId: null,
    title: "Field Jacket",
    brand: "Acme",
    categoryPaths: [["Men", "Jackets"]],
    price: 129,
    currency: "USD",
    inStock: true,
    productUrl: null,
    imageUrl: "https://cdn.example.com/jacket.jpg",
    enrichedDescription: "A rugged shell built for wet-weather commutes.",
    garmentCategory: "outerwear",
    garmentSubcategory: "jacket",
    ...overrides,
  };
}

describe("toProduct", () => {
  it("carries the candidate's description through unchanged", () => {
    const product = toProduct(candidate());
    expect(product.description).toBe("A rugged shell built for wet-weather commutes.");
  });

  it("carries whatever store-specific attributes the candidate has, unchanged", () => {
    const product = toProduct(candidate({ attributes: { collar_type: ["Mandarin"], inseam: ["30in", "32in"] } }));
    expect(product.attributes).toEqual({ collar_type: ["Mandarin"], inseam: ["30in", "32in"] });
  });

  it("leaves attributes undefined when the candidate has none", () => {
    const product = toProduct(candidate());
    expect(product.attributes).toBeUndefined();
  });
});
