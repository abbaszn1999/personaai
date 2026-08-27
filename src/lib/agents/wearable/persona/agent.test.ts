import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCall } from "@/lib/ai/gemini-chat";
import type { ChatMessage } from "@/modules/shopping-agent/types";
import type { RetrievalResult } from "@/lib/retrieval/types";
import type { WearableAgentEvent, WearableChatContext } from "./types";

// The db layer builds its Supabase client at module load, and the tool barrel pulls it in
// transitively. These are never called — the modules that would are mocked below.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SECRET_KEY ??= "test-key";

const createChatCompletion = vi.fn();
const runRetrieval = vi.fn();

vi.mock("@/lib/ai/gemini-chat", () => ({
  createChatCompletion: (...args: unknown[]) => createChatCompletion(...args),
}));

vi.mock("@/lib/agents/wearable/persona/engine", () => ({
  runRetrieval: (...args: unknown[]) => runRetrieval(...args),
  rehydrateAnchor: vi.fn(),
  rehydrateProducts: vi.fn(),
}));

const { runWearableChatAgent } = await import("./agent");

function toolCall(id: string, name: string, args: Record<string, unknown>): ToolCall {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

function retrievalResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    mode: "cosine",
    products: [
      {
        id: "p1",
        name: "Linen Camp Shirt",
        description: "A relaxed warm-weather shirt.",
        price: 68,
        currency: "USD",
        imageUrl: "https://cdn.example.com/shirt.jpg",
        categoryId: "shirt",
        tags: [],
        variants: [],
        rating: 0,
        reviewCount: 0,
        inStock: true,
        garmentSlot: "top",
      },
    ],
    ...overrides,
  };
}

function context(): WearableChatContext {
  return {
    userId: "user-1",
    geminiApiKey: "key",
    creditsRemaining: 10,
    categoryScope: ["12"],
    profile: {
      heightCm: null,
      weightKg: null,
      chestCm: null,
      waistCm: null,
      shoeSizeEu: null,
      photoBase64: null,
      photoMimeType: null,
      avatarUrl: null,
      isCustomAvatar: false,
    },
    outfitItems: [],
    knownProducts: [],
    intake: {},
    storeProductCount: 100,
    categories: [],
    connection: { id: "conn-1" } as WearableChatContext["connection"],
    catalogReady: true,
    facets: { categories: [], brands: [], priceRange: null },
    hardRules: [],
    styleGuide: null,
    recentTurns: [],
    anchor: null,
    anchorPinned: false,
    bundleState: null,
    discussedBundleItems: [],
    shownProductIds: [],
    visitorId: "visitor-1",
  };
}

const history: ChatMessage[] = [
  {
    id: "m1",
    role: "user",
    content: "build me a bundle around that shirt, and also does it come in blue?",
    timestamp: new Date().toISOString(),
  },
];

async function collect(): Promise<WearableAgentEvent[]> {
  const events: WearableAgentEvent[] = [];
  for await (const event of runWearableChatAgent(context(), history)) events.push(event);
  return events;
}

beforeEach(() => {
  createChatCompletion.mockReset();
  runRetrieval.mockReset();
});

/**
 * A single message can carry two intents. That is handled at the tool-call layer — the model
 * emits two calls in one round and the loop resolves both — which is what lets the retrieval
 * router stay a single strict enum per request instead of parsing compound requests.
 */
describe("multi-intent messages", () => {
  it("resolves two tool calls emitted in one round", async () => {
    createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          toolCall("call-1", "search_catalog", { query: "build me a bundle around that shirt" }),
          toolCall("call-2", "search_catalog", { query: "does it come in blue" }),
        ],
      })
      .mockResolvedValueOnce({ content: "Here's a look, and yes it comes in blue.", toolCalls: [] })
      .mockResolvedValue({ content: "Here's a look, and yes it comes in blue.", toolCalls: [] });

    runRetrieval
      .mockResolvedValueOnce(retrievalResult({ mode: "bundle" }))
      .mockResolvedValueOnce(retrievalResult({ mode: "attribute_variant" }));

    const events = await collect();

    expect(runRetrieval).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => event.type === "products")).toHaveLength(2);
  });

  it("returns exactly one tool result per tool call, in the same round", async () => {
    // Gemini rejects the whole request when a functionCall has no matching functionResponse,
    // so this invariant fails the entire turn rather than just one tool.
    createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          toolCall("call-1", "search_catalog", { query: "a bundle" }),
          toolCall("call-2", "search_catalog", { query: "in blue" }),
        ],
      })
      .mockResolvedValue({ content: "Done.", toolCalls: [] });

    runRetrieval.mockResolvedValue(retrievalResult());

    await collect();

    const secondCallMessages = createChatCompletion.mock.calls[1][1] as Array<{
      role: string;
      tool_call_id?: string;
    }>;
    const toolResultIds = secondCallMessages.filter((m) => m.role === "tool").map((m) => m.tool_call_id);

    expect(toolResultIds).toEqual(["call-1", "call-2"]);
  });

  it("still answers the other intent when one tool call fails", async () => {
    createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          toolCall("call-1", "search_catalog", { query: "a bundle" }),
          toolCall("call-2", "search_catalog", { query: "in blue" }),
        ],
      })
      .mockResolvedValue({ content: "Done.", toolCalls: [] });

    runRetrieval.mockRejectedValueOnce(new Error("engine exploded")).mockResolvedValueOnce(retrievalResult());

    const events = await collect();

    // One result each is still sent back, so the turn completes rather than 400ing.
    const secondCallMessages = createChatCompletion.mock.calls[1][1] as Array<{
      role: string;
      tool_call_id?: string;
    }>;
    expect(secondCallMessages.filter((m) => m.role === "tool")).toHaveLength(2);
    expect(events.filter((event) => event.type === "products")).toHaveLength(1);
  });

  it("emits an unknown tool as an error result rather than dropping it", async () => {
    createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [toolCall("call-1", "not_a_real_tool", {})],
      })
      .mockResolvedValue({ content: "Done.", toolCalls: [] });

    await collect();

    const secondCallMessages = createChatCompletion.mock.calls[1][1] as Array<{
      role: string;
      tool_call_id?: string;
      content?: string;
    }>;
    const toolResult = secondCallMessages.find((m) => m.role === "tool");

    expect(toolResult?.tool_call_id).toBe("call-1");
    expect(toolResult?.content).toContain("Unknown tool");
  });
});

describe("bundle attachment — multiple outfit options", () => {
  function product(id: string, name: string, price: number) {
    return {
      id,
      name,
      description: "",
      price,
      currency: "USD",
      imageUrl: `https://cdn.example.com/${id}.jpg`,
      categoryId: "tops",
      tags: [],
      variants: [],
      rating: 0,
      reviewCount: 0,
      inStock: true,
    };
  }

  it("carries every stylist-validated outfit through as its own bundle, not just the first", async () => {
    createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [toolCall("call-1", "search_catalog", { query: "build me an outfit" })],
      })
      .mockResolvedValue({ content: "Here are a couple of options.", toolCalls: [] });

    runRetrieval.mockResolvedValueOnce(
      retrievalResult({
        mode: "bundle",
        products: [product("p1", "Shirt", 40), product("p2", "Pants", 60), product("p3", "Jacket", 120)],
        bundles: [
          {
            externalIds: ["p1", "p2"],
            items: [
              { externalId: "p1", category: "tops", price: 40 },
              { externalId: "p2", category: "bottoms", price: 60 },
            ],
            rationale: "Casual and coordinated.",
          },
          {
            externalIds: ["p1", "p3"],
            items: [
              { externalId: "p1", category: "tops", price: 40 },
              { externalId: "p3", category: "outerwear", price: 120 },
            ],
            rationale: "Dressier layered look.",
          },
        ],
      })
    );

    const events = await collect();
    const bundleEvent = events.find((event) => event.type === "bundle");

    expect(bundleEvent?.type).toBe("bundle");
    if (bundleEvent?.type !== "bundle") throw new Error("expected a bundle event");
    expect(bundleEvent.bundles).toHaveLength(2);
    expect(bundleEvent.bundles[0].productIds).toEqual(["p1", "p2"]);
    expect(bundleEvent.bundles[1].productIds).toEqual(["p1", "p3"]);
    expect(bundleEvent.bundles[0].rationale).toBe("Casual and coordinated.");
    expect(bundleEvent.bundles[1].items.map((item) => item.category)).toEqual(["tops", "outerwear"]);
  });

  it("drops an outfit whose products didn't all resolve, keeping the others", async () => {
    createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [toolCall("call-1", "search_catalog", { query: "build me an outfit" })],
      })
      .mockResolvedValue({ content: "Here's an option.", toolCalls: [] });

    runRetrieval.mockResolvedValueOnce(
      retrievalResult({
        mode: "bundle",
        products: [product("p1", "Shirt", 40), product("p2", "Pants", 60)],
        bundles: [
          {
            // p9 never comes back in `products`, so this whole outfit is incomplete.
            externalIds: ["p1", "p9"],
            items: [
              { externalId: "p1", category: "tops", price: 40 },
              { externalId: "p9", category: "bottoms", price: 60 },
            ],
            rationale: "Incomplete.",
          },
          {
            externalIds: ["p1", "p2"],
            items: [
              { externalId: "p1", category: "tops", price: 40 },
              { externalId: "p2", category: "bottoms", price: 60 },
            ],
            rationale: "Complete.",
          },
        ],
      })
    );

    const events = await collect();
    const bundleEvent = events.find((event) => event.type === "bundle");

    expect(bundleEvent?.type).toBe("bundle");
    if (bundleEvent?.type !== "bundle") throw new Error("expected a bundle event");
    expect(bundleEvent.bundles).toHaveLength(1);
    expect(bundleEvent.bundles[0].rationale).toBe("Complete.");
  });
});

/**
 * The cards a turn will show are settled the moment its tools return, so the model is told about
 * them before it writes. It used to write first and then be asked to rewrite, which cost a second
 * full-history model call on every turn that showed a product.
 */
describe("attachment facts", () => {
  function searchThen(reply: string) {
    createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [toolCall("call-1", "search_catalog", { query: "linen shirts" })],
      })
      .mockResolvedValue({ content: reply, toolCalls: [] });
  }

  function messagesOfCall(index: number) {
    return createChatCompletion.mock.calls[index][1] as Array<{ role: string; content: string | null }>;
  }

  it("hands the model the cards before it writes, in the same call", async () => {
    searchThen("Here you go.");
    runRetrieval.mockResolvedValue(retrievalResult());

    await collect();

    const facts = messagesOfCall(1).filter((m) => m.content?.includes("SYSTEM ATTACHMENT FACTS"));
    expect(facts).toHaveLength(1);
    // Told, not corrected afterwards — the reply the model writes here is the one that ships.
    expect(facts[0].role).toBe("user");
    expect(facts[0].content).toContain("Write it to match them");
  });

  it("costs one model call per tool round and no rewrite pass", async () => {
    searchThen("Here you go.");
    runRetrieval.mockResolvedValue(retrievalResult());

    await collect();

    expect(createChatCompletion).toHaveBeenCalledTimes(2);
  });

  it("streams the model's own words rather than a rewritten copy", async () => {
    searchThen("A crisp linen shirt.");
    runRetrieval.mockResolvedValue(retrievalResult());

    const events = await collect();
    const text = events
      .filter((event): event is Extract<WearableAgentEvent, { type: "text" }> => event.type === "text")
      .map((event) => event.delta)
      .join("");

    expect(text.trim()).toBe("A crisp linen shirt.");
  });

  it("says nothing about attachments on a turn that shows none", async () => {
    createChatCompletion.mockResolvedValue({ content: "What kind of piece?", toolCalls: [] });

    await collect();

    for (const call of createChatCompletion.mock.calls) {
      const messages = call[1] as Array<{ content: string | null }>;
      expect(messages.some((m) => m.content?.includes("SYSTEM ATTACHMENT FACTS"))).toBe(false);
    }
  });
});

describe("retrieval state", () => {
  it("reports what the conversation is anchored on so the client can send it back", async () => {
    createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [toolCall("call-1", "search_catalog", { query: "linen shirts" })],
      })
      .mockResolvedValue({ content: "Done.", toolCalls: [] });

    runRetrieval.mockResolvedValue(
      retrievalResult({
        anchor: {
          externalId: "p1",
          productGroupId: "g1",
          title: "Linen Camp Shirt",
          brand: null,
          category: "tops",
          subcategory: "shirt",
          enrichedDescription: null,
          garmentCategory: "tops",
        },
      })
    );

    const events = await collect();
    const state = events.find((event) => event.type === "retrieval_state");

    expect(state).toMatchObject({ anchorId: "p1", shownProductIds: ["p1"] });
  });

  it("passes a clarifying question through instead of products", async () => {
    createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [toolCall("call-1", "search_catalog", { query: "something nice" })],
      })
      .mockResolvedValue({ content: "What kind of piece?", toolCalls: [] });

    runRetrieval.mockResolvedValue({
      mode: "ask_info",
      products: [],
      question: "What kind of piece are you after?",
      quickOptions: ["Tops", "Bottoms"],
    } satisfies RetrievalResult);

    const events = await collect();

    expect(events.some((event) => event.type === "products")).toBe(false);
    expect(events.find((event) => event.type === "quick_options")).toMatchObject({
      options: ["Tops", "Bottoms"],
    });
  });
});
