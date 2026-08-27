import { afterEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/modules/shopping-agent/types";

const createChatCompletion = vi.fn();

vi.mock("@/lib/ai/gemini-chat", () => ({
  createChatCompletion: (...args: unknown[]) => createChatCompletion(...args),
}));

// Imported after the mock so select-products.ts picks up the mocked createChatCompletion.
const { selectTopProducts } = await import("./select-products");

function makeProduct(overrides: Partial<Product> & { id: string; name: string }): Product {
  return {
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
    ...overrides,
  };
}

function baseInput(pool: Product[], overrides: Partial<Parameters<typeof selectTopProducts>[0]> = {}) {
  return {
    pool,
    query: "router",
    limit: 10,
    apiKey: "sk-test",
    intake: {},
    matchType: "exact" as const,
    categories: [],
    ...overrides,
  };
}

function selectToolCallWith(selections: Array<{ productId: string }>) {
  return {
    content: null,
    toolCalls: [
      {
        id: "call_1",
        type: "function" as const,
        function: { name: "select_products", arguments: JSON.stringify({ selections }) },
      },
    ],
  };
}

describe("selectTopProducts (unwearable)", () => {
  afterEach(() => {
    createChatCompletion.mockReset();
  });

  it("returns picks in the model's order on a forced-tool success", async () => {
    const pool = [
      makeProduct({ id: "p1", name: "Aurora Router" }),
      makeProduct({ id: "p2", name: "Nimbus Router" }),
      makeProduct({ id: "p3", name: "Mystery Router" }),
    ];
    createChatCompletion.mockResolvedValue(selectToolCallWith([{ productId: "p2" }, { productId: "p1" }]));

    const { products, usedFallback } = await selectTopProducts(baseInput(pool));

    expect(usedFallback).toBe(false);
    expect(products.map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(createChatCompletion).toHaveBeenCalledTimes(1);
    const [, , opts] = createChatCompletion.mock.calls[0];
    expect(opts.toolChoice).toEqual({ type: "function", name: "select_products" });
  });

  it("caps picks at the requested limit even if the model returns more", async () => {
    const pool = Array.from({ length: 5 }, (_, i) => makeProduct({ id: `p${i}`, name: `Router ${i}` }));
    createChatCompletion.mockResolvedValue(selectToolCallWith(pool.map((p) => ({ productId: p.id }))));

    const { products } = await selectTopProducts(baseInput(pool, { limit: 2 }));

    expect(products).toHaveLength(2);
  });

  it("drops selections with unknown product ids, keeping valid ones", async () => {
    const pool = [makeProduct({ id: "p1", name: "Aurora Router" }), makeProduct({ id: "p2", name: "Nimbus Router" })];
    createChatCompletion.mockResolvedValue(
      selectToolCallWith([{ productId: "unknown-id" }, { productId: "p2" }])
    );

    const { products, usedFallback } = await selectTopProducts(baseInput(pool));

    expect(usedFallback).toBe(false);
    expect(products.map((p) => p.id)).toEqual(["p2"]);
  });

  it("falls back to the rule-based pipeline when the AI call throws", async () => {
    const pool = [makeProduct({ id: "p1", name: "Aurora Router" })];
    createChatCompletion.mockRejectedValue(new Error("network down"));

    const { products, usedFallback } = await selectTopProducts(baseInput(pool));

    expect(usedFallback).toBe(true);
    expect(products.map((p) => p.id)).toEqual(["p1"]);
  });

  it("falls back to the rule-based pipeline on a malformed/empty tool response", async () => {
    const pool = [makeProduct({ id: "p1", name: "Aurora Router" })];
    createChatCompletion.mockResolvedValue({ content: null, toolCalls: [] });

    const { products, usedFallback } = await selectTopProducts(baseInput(pool));

    expect(usedFallback).toBe(true);
    expect(products.map((p) => p.id)).toEqual(["p1"]);
  });

  it("ranks in-stock items above out-of-stock in the fallback", async () => {
    const pool = [
      makeProduct({ id: "p1", name: "Aurora Router", inStock: false }),
      makeProduct({ id: "p2", name: "Nimbus Router", inStock: true }),
    ];
    createChatCompletion.mockRejectedValue(new Error("network down"));

    const { products } = await selectTopProducts(baseInput(pool));

    expect(products[0].id).toBe("p2");
  });

  it("skips the AI call entirely and returns an empty result for an empty pool", async () => {
    const { products, usedFallback } = await selectTopProducts(baseInput([]));

    expect(products).toEqual([]);
    expect(usedFallback).toBe(false);
    expect(createChatCompletion).not.toHaveBeenCalled();
  });

  it("goes straight to fallback without calling the model when there is no API key", async () => {
    const pool = [makeProduct({ id: "p1", name: "Aurora Router" })];

    const { products, usedFallback } = await selectTopProducts(baseInput(pool, { apiKey: "" }));

    expect(usedFallback).toBe(true);
    expect(products.map((p) => p.id)).toEqual(["p1"]);
    expect(createChatCompletion).not.toHaveBeenCalled();
  });
});
