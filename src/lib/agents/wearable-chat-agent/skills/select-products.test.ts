import { afterEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/modules/shopping-agent/types";
import type { WearableChatProfileContext } from "../types";

const createChatCompletion = vi.fn();

vi.mock("@/lib/ai/openai", () => ({
  createChatCompletion: (...args: unknown[]) => createChatCompletion(...args),
}));

// Imported after the mock so select-products.ts picks up the mocked createChatCompletion
// (classify-garment.ts, used by the fallback path, shares the same mocked module).
const { selectTopProducts } = await import("./select-products");
const { __resetGarmentSlotCacheForTests } = await import("./classify-garment");

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

const profile: WearableChatProfileContext = {
  heightCm: null,
  weightKg: null,
  chestCm: null,
  waistCm: null,
  shoeSizeEu: null,
  photoBase64: null,
  photoMimeType: null,
  avatarUrl: null,
  isCustomAvatar: false,
};

function baseInput(pool: Product[], overrides: Partial<Parameters<typeof selectTopProducts>[0]> = {}) {
  return {
    pool,
    query: "jacket",
    limit: 10,
    apiKey: "sk-test",
    profile,
    intake: {},
    matchType: "exact" as const,
    categories: [],
    ...overrides,
  };
}

function selectToolCallWith(selections: Array<{ productId: string; slot: string }>) {
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

describe("selectTopProducts", () => {
  afterEach(() => {
    createChatCompletion.mockReset();
    __resetGarmentSlotCacheForTests();
  });

  it("returns picks in the model's order, tagged with slot, on a forced-tool success", async () => {
    const pool = [
      makeProduct({ id: "p1", name: "Aurora Jacket" }),
      makeProduct({ id: "p2", name: "Nimbus Jacket" }),
      makeProduct({ id: "p3", name: "Mystery Jacket" }),
    ];
    createChatCompletion.mockResolvedValue(
      selectToolCallWith([
        { productId: "p2", slot: "outerwear" },
        { productId: "p1", slot: "outerwear" },
      ])
    );

    const { products, usedFallback } = await selectTopProducts(baseInput(pool));

    expect(usedFallback).toBe(false);
    expect(products.map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(products[0].garmentSlot).toBe("outerwear");
    expect(createChatCompletion).toHaveBeenCalledTimes(1);
    const [, , opts] = createChatCompletion.mock.calls[0];
    expect(opts.toolChoice).toEqual({ type: "function", name: "select_products" });
  });

  it("caps picks at the requested limit even if the model returns more", async () => {
    const pool = Array.from({ length: 5 }, (_, i) => makeProduct({ id: `p${i}`, name: `Jacket ${i}` }));
    createChatCompletion.mockResolvedValue(
      selectToolCallWith(pool.map((p) => ({ productId: p.id, slot: "outerwear" })))
    );

    const { products } = await selectTopProducts(baseInput(pool, { limit: 2 }));

    expect(products).toHaveLength(2);
  });

  it("drops selections with unknown product ids or invalid slots, keeping valid ones", async () => {
    const pool = [makeProduct({ id: "p1", name: "Aurora Jacket" }), makeProduct({ id: "p2", name: "Nimbus Jacket" })];
    createChatCompletion.mockResolvedValue(
      selectToolCallWith([
        { productId: "unknown-id", slot: "outerwear" },
        { productId: "p1", slot: "not-a-real-slot" },
        { productId: "p2", slot: "outerwear" },
      ])
    );

    const { products, usedFallback } = await selectTopProducts(baseInput(pool));

    expect(usedFallback).toBe(false);
    expect(products.map((p) => p.id)).toEqual(["p2"]);
  });

  it("applies the category-consistency safety net after a successful AI selection", async () => {
    const pool = [
      makeProduct({ id: "p1", name: "Aurora Jacket" }),
      makeProduct({ id: "p2", name: "Casual Sneakers" }),
    ];
    // Model mistakenly includes a shoe when the shopper asked for a jacket.
    createChatCompletion.mockResolvedValue(
      selectToolCallWith([
        { productId: "p1", slot: "outerwear" },
        { productId: "p2", slot: "shoes" },
      ])
    );

    const { products } = await selectTopProducts(baseInput(pool, { query: "jacket" }));

    expect(products.map((p) => p.id)).toEqual(["p1"]);
  });

  it("falls back to the rule-based pipeline when the AI call throws", async () => {
    const pool = [makeProduct({ id: "p1", name: "Aurora Jacket" })];
    createChatCompletion.mockRejectedValue(new Error("network down"));

    const { products, usedFallback } = await selectTopProducts(baseInput(pool));

    expect(usedFallback).toBe(true);
    expect(products.map((p) => p.id)).toEqual(["p1"]);
  });

  it("falls back to the rule-based pipeline on a malformed/empty tool response", async () => {
    const pool = [makeProduct({ id: "p1", name: "Aurora Jacket" })];
    createChatCompletion.mockResolvedValue({ content: null, toolCalls: [] });

    const { products, usedFallback } = await selectTopProducts(baseInput(pool));

    expect(usedFallback).toBe(true);
    expect(products.map((p) => p.id)).toEqual(["p1"]);
  });

  it("falls back to the rule-based pipeline when every selection is invalid", async () => {
    const pool = [makeProduct({ id: "p1", name: "Aurora Jacket" })];
    createChatCompletion.mockResolvedValueOnce(
      selectToolCallWith([{ productId: "not-in-pool", slot: "outerwear" }])
    );
    // The fallback path's own classifyGarmentSlots call.
    createChatCompletion.mockRejectedValueOnce(new Error("classify also down"));

    const { products, usedFallback } = await selectTopProducts(baseInput(pool));

    expect(usedFallback).toBe(true);
    // classifyGarmentSlots failed too, but rankAndSelectTopK still ranks off keyword fallback.
    expect(products.map((p) => p.id)).toEqual(["p1"]);
  });

  it("skips the AI call entirely and returns an empty result for an empty pool", async () => {
    const { products, usedFallback } = await selectTopProducts(baseInput([]));

    expect(products).toEqual([]);
    expect(usedFallback).toBe(false);
    expect(createChatCompletion).not.toHaveBeenCalled();
  });

  it("goes straight to fallback without calling the model when there is no API key", async () => {
    const pool = [makeProduct({ id: "p1", name: "Aurora Jacket" })];

    const { products, usedFallback } = await selectTopProducts(baseInput(pool, { apiKey: "" }));

    expect(usedFallback).toBe(true);
    expect(products.map((p) => p.id)).toEqual(["p1"]);
    // Neither the selection call nor classifyGarmentSlots hits the model without a key.
    expect(createChatCompletion).not.toHaveBeenCalled();
  });
});
