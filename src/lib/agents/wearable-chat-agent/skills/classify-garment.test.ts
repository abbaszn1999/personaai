import { afterEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/modules/shopping-agent/types";

const createChatCompletion = vi.fn();

vi.mock("@/lib/ai/openai", () => ({
  createChatCompletion: (...args: unknown[]) => createChatCompletion(...args),
}));

// Imported after the mock so classify-garment.ts picks up the mocked createChatCompletion.
const { classifyGarmentSlots, __resetGarmentSlotCacheForTests } = await import("./classify-garment");

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

function toolCallWith(classifications: Array<{ productId: string; slot: string }>) {
  return {
    content: null,
    toolCalls: [
      {
        id: "call_1",
        type: "function" as const,
        function: { name: "classify_garments", arguments: JSON.stringify({ classifications }) },
      },
    ],
  };
}

describe("classifyGarmentSlots", () => {
  afterEach(() => {
    createChatCompletion.mockReset();
    __resetGarmentSlotCacheForTests();
  });

  it("classifies uncached products via a forced tool call", async () => {
    const products = [makeProduct("p1", "Aurora Wrap"), makeProduct("p2", "Nimbus Trainer")];
    createChatCompletion.mockResolvedValue(
      toolCallWith([
        { productId: "p1", slot: "outerwear" },
        { productId: "p2", slot: "shoes" },
      ])
    );

    const result = await classifyGarmentSlots(products, "sk-test");

    expect(result.get("p1")).toBe("outerwear");
    expect(result.get("p2")).toBe("shoes");
    expect(createChatCompletion).toHaveBeenCalledTimes(1);
    const [, , opts] = createChatCompletion.mock.calls[0];
    expect(opts.toolChoice).toEqual({ type: "function", name: "classify_garments" });
  });

  it("never re-classifies an already-cached product", async () => {
    const product = makeProduct("p1", "Aurora Wrap");
    createChatCompletion.mockResolvedValue(toolCallWith([{ productId: "p1", slot: "outerwear" }]));

    const first = await classifyGarmentSlots([product], "sk-test");
    expect(first.get("p1")).toBe("outerwear");
    expect(createChatCompletion).toHaveBeenCalledTimes(1);

    const second = await classifyGarmentSlots([product], "sk-test");
    expect(second.get("p1")).toBe("outerwear");
    // No second call — the cache satisfied it entirely.
    expect(createChatCompletion).toHaveBeenCalledTimes(1);
  });

  it("falls back to an empty map (never throws) when the model call fails", async () => {
    createChatCompletion.mockRejectedValue(new Error("network down"));

    const result = await classifyGarmentSlots([makeProduct("p1", "Aurora Wrap")], "sk-test");

    expect(result.size).toBe(0);
  });

  it("ignores malformed classification entries but keeps valid ones", async () => {
    createChatCompletion.mockResolvedValue(
      toolCallWith([
        { productId: "p1", slot: "not-a-real-slot" },
        { productId: "p2", slot: "top" },
      ])
    );

    const result = await classifyGarmentSlots([makeProduct("p1", "Mystery Item"), makeProduct("p2", "Basic Tee")], "sk-test");

    expect(result.has("p1")).toBe(false);
    expect(result.get("p2")).toBe("top");
  });

  it("returns an empty map without calling the model when there is no API key", async () => {
    const result = await classifyGarmentSlots([makeProduct("p1", "Aurora Wrap")], "");

    expect(result.size).toBe(0);
    expect(createChatCompletion).not.toHaveBeenCalled();
  });
});
