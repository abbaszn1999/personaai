import { describe, expect, it } from "vitest";
import type { CatalogFilter } from "@/lib/retrieval/types";
import { buildAcsFilterExpression } from "./filter-expression";

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";

describe("buildAcsFilterExpression", () => {
  it("returns undefined for an empty filter", () => {
    expect(buildAcsFilterExpression({}, CONNECTION_ID)).toBeUndefined();
  });

  it("prefers subcategory over category when both are set", () => {
    const expr = buildAcsFilterExpression({ category: "Men", subcategory: "Shirts" }, CONNECTION_ID);
    expect(expr).toBe('(categories: ANY("Shirts"))');
  });

  it("falls back to category alone", () => {
    const expr = buildAcsFilterExpression({ category: "Men" }, CONNECTION_ID);
    expect(expr).toBe('(categories: ANY("Men"))');
  });

  it("builds a brand clause", () => {
    expect(buildAcsFilterExpression({ brand: "Acme" }, CONNECTION_ID)).toBe('(brands: ANY("Acme"))');
  });

  it("builds an inclusive price range with both bounds", () => {
    expect(buildAcsFilterExpression({ priceMin: 10, priceMax: 100 }, CONNECTION_ID)).toBe("(price: IN(10i, 100i))");
  });

  it("builds an open-ended price range when only a ceiling is given", () => {
    expect(buildAcsFilterExpression({ priceMax: 100 }, CONNECTION_ID)).toBe("(price: IN(*, 100i))");
  });

  it("builds an open-ended price range when only a floor is given", () => {
    expect(buildAcsFilterExpression({ priceMin: 10 }, CONNECTION_ID)).toBe("(price: IN(10i, *))");
  });

  it("adds an availability clause when inStockOnly is set", () => {
    expect(buildAcsFilterExpression({ inStockOnly: true }, CONNECTION_ID)).toBe('(availability: ANY("IN_STOCK"))');
  });

  it("namespaces excluded ids with the connection id, one clause per id", () => {
    const expr = buildAcsFilterExpression({ excludeExternalIds: ["a", "b"] }, CONNECTION_ID);
    expect(expr).toBe(
      `(NOT productId: ANY("${CONNECTION_ID}_a")) AND (NOT productId: ANY("${CONNECTION_ID}_b"))`
    );
  });

  it("builds garment category/subcategory clauses against the internal attributes", () => {
    const expr = buildAcsFilterExpression({ garmentCategory: "tops", garmentSubcategory: "shirt" }, CONNECTION_ID);
    expect(expr).toBe(
      '(attributes.garment_category: ANY("tops")) AND (attributes.garment_subcategory: ANY("shirt"))'
    );
  });

  it("combines every clause present, ANDed", () => {
    const filter: CatalogFilter = {
      category: "Men",
      brand: "Acme",
      priceMax: 100,
      inStockOnly: true,
    };
    const expr = buildAcsFilterExpression(filter, CONNECTION_ID);
    expect(expr).toBe(
      '(categories: ANY("Men")) AND (brands: ANY("Acme")) AND (price: IN(*, 100i)) AND (availability: ANY("IN_STOCK"))'
    );
  });

  it("escapes embedded quotes in literals", () => {
    const expr = buildAcsFilterExpression({ brand: 'Bob\'s "Best"' }, CONNECTION_ID);
    expect(expr).toBe('(brands: ANY("Bob\'s \\"Best\\""))');
  });
});
