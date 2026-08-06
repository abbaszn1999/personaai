import { describe, expect, it } from "vitest";
import type { Product } from "@/modules/shopping-agent/types";
import type { SearchCallResult } from "../types";
import { buildSolutionKitFromSearches } from "./solution-kit";

function makeProduct(overrides: Partial<Product> & { id: string; name: string; categoryId: string }): Product {
  return {
    description: "",
    price: 100,
    currency: "USD",
    imageUrl: "https://example.com/product.jpg",
    tags: [],
    variants: [],
    rating: 0,
    reviewCount: 0,
    inStock: true,
    ...overrides,
  };
}

function bucket(query: string, products: Product[]): SearchCallResult {
  return { query, products, matchType: "exact" };
}

describe("buildSolutionKitFromSearches", () => {
  it("returns null with fewer than two non-empty search buckets", () => {
    const one = bucket("monitor", [makeProduct({ id: "m1", name: "4K Monitor", categoryId: "monitors" })]);
    expect(buildSolutionKitFromSearches([one], {})).toBeNull();
    expect(buildSolutionKitFromSearches([], {})).toBeNull();
  });

  it("picks exactly one item per search bucket", () => {
    const monitors = bucket("monitor", [
      makeProduct({ id: "m1", name: "4K Monitor", categoryId: "monitors" }),
      makeProduct({ id: "m2", name: "Budget Monitor", categoryId: "monitors" }),
    ]);
    const keyboards = bucket("keyboard", [
      makeProduct({ id: "k1", name: "MX Keys", categoryId: "keyboards" }),
    ]);

    const kit = buildSolutionKitFromSearches([monitors, keyboards], {});

    expect(kit).not.toBeNull();
    expect(kit!.productIds).toHaveLength(2);
    expect(kit!.productIds).toContain("k1");
    // Only one of the two monitors made it in.
    expect(kit!.productIds.filter((id) => id.startsWith("m"))).toHaveLength(1);
  });

  it("never puts two items from the same store category in one kit", () => {
    const searchA = bucket("monitor", [makeProduct({ id: "m1", name: "4K Monitor", categoryId: "monitors" })]);
    const searchB = bucket("display", [
      makeProduct({ id: "m2", name: "Curved Display", categoryId: "monitors" }),
      makeProduct({ id: "l1", name: "Desk Lamp", categoryId: "lighting" }),
    ]);

    const kit = buildSolutionKitFromSearches([searchA, searchB], {});

    expect(kit).not.toBeNull();
    expect(kit!.productIds).toEqual(["m1", "l1"]);
  });

  it("skips out-of-stock items", () => {
    const monitors = bucket("monitor", [
      makeProduct({ id: "m1", name: "4K Monitor", categoryId: "monitors", inStock: false }),
      makeProduct({ id: "m2", name: "Budget Monitor", categoryId: "monitors" }),
    ]);
    const keyboards = bucket("keyboard", [makeProduct({ id: "k1", name: "MX Keys", categoryId: "keyboards" })]);

    const kit = buildSolutionKitFromSearches([monitors, keyboards], {});

    expect(kit).not.toBeNull();
    expect(kit!.productIds).toContain("m2");
    expect(kit!.productIds).not.toContain("m1");
  });

  it("respects the shopper's budget across the whole kit", () => {
    const monitors = bucket("monitor", [makeProduct({ id: "m1", name: "4K Monitor", categoryId: "monitors", price: 250 })]);
    const keyboards = bucket("keyboard", [
      makeProduct({ id: "k1", name: "Premium Keyboard", categoryId: "keyboards", price: 200 }),
      makeProduct({ id: "k2", name: "Budget Keyboard", categoryId: "keyboards", price: 40 }),
    ]);

    const kit = buildSolutionKitFromSearches([monitors, keyboards], { budget: "Under $300" });

    expect(kit).not.toBeNull();
    // The premium keyboard would blow the $300 budget after the $250 monitor.
    expect(kit!.productIds).toEqual(["m1", "k2"]);
  });

  it("labels the kit from the shopper's use case when known", () => {
    const monitors = bucket("monitor", [makeProduct({ id: "m1", name: "4K Monitor", categoryId: "monitors" })]);
    const keyboards = bucket("keyboard", [makeProduct({ id: "k1", name: "MX Keys", categoryId: "keyboards" })]);

    const named = buildSolutionKitFromSearches([monitors, keyboards], { useCase: "Home Office" });
    expect(named!.label).toBe("Home Office Solution Kit");

    const generic = buildSolutionKitFromSearches([monitors, keyboards], {});
    expect(generic!.label).toBe("Complete Solution Kit");
  });

  it("returns null when budget/stock filtering leaves fewer than two items", () => {
    const monitors = bucket("monitor", [makeProduct({ id: "m1", name: "4K Monitor", categoryId: "monitors", price: 500 })]);
    const keyboards = bucket("keyboard", [makeProduct({ id: "k1", name: "MX Keys", categoryId: "keyboards", price: 400 })]);

    expect(buildSolutionKitFromSearches([monitors, keyboards], { budget: "Under $600" })).toBeNull();
  });
});
