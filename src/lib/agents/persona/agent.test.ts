import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiChatError } from "@/lib/ai/gemini-chat";
import { renderPathConfig } from "@/lib/catalog/path-config/render";
import type { StoredPathConfig } from "@/lib/catalog/path-config/types";
import { CONFIG, candidate } from "../__fixtures__/catalog";
import { createSessionMeter } from "@/lib/billing/session-meter";
import type { AgentContext, AgentEvent, LastSearch } from "../types";

const deps = vi.hoisted(() => ({
  callStructured: vi.fn(),
  searchCatalog: vi.fn(),
  verifyForDisplay: vi.fn(),
}));

vi.mock("../shared/structured-call", async (original) => ({
  ...(await original<typeof import("../shared/structured-call")>()),
  agentModel: () => "test-model",
  callStructured: deps.callStructured,
}));
vi.mock("../shared/search", () => ({
  searchCatalog: deps.searchCatalog,
  verifyForDisplay: deps.verifyForDisplay,
  recordShown: vi.fn(),
  isDisplayable: (item: { inStock: boolean; imageUrl?: string | null; price: number | null }) =>
    item.inStock && Boolean(item.imageUrl) && item.price !== null,
}));
vi.mock("../shared/hydrate", () => ({
  toProducts: (items: Array<{ externalId: string }>) => items.map((item) => ({ id: item.externalId })),
}));
vi.mock("@/lib/ai/gemini-cache", () => ({ resolvePrefixCache: () => null }));
vi.mock("@/lib/db/persona-path-configs", () => ({ savePersonaGeminiCache: vi.fn() }));
vi.mock("@/lib/db/persona-turn-metrics", () => ({ recordPersonaTurn: vi.fn() }));
vi.mock("../shared/stream", async (original) => ({
  ...(await original<typeof import("../shared/stream")>()),
  textEvents: async function* (text: string) {
    yield { type: "text", delta: text };
  },
}));

import { isRepeatSearch, runPersona } from "./agent";

const pathConfig: StoredPathConfig = {
  connectionId: "conn",
  config: CONFIG,
  renderedText: renderPathConfig(CONFIG),
  fingerprint: "f",
  taxonomyVersion: 1,
  builtAt: "",
  staleAt: null,
  geminiCacheName: null,
  geminiCacheKey: null,
  geminiCacheExpiresAt: null,
};

function context(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    userId: "u",
    visitorId: "v",
    geminiApiKey: "k",
    connection: { id: "conn" } as AgentContext["connection"],
    catalogReady: true,
    categoryScope: ["persona"],
    pathConfig,
    session: { audience: "woman", department: "women", budget: null, measurements: null },
    history: [],
    message: "show me trousers",
    products: new Map(),
    shownProductIds: [],
    lastSearch: null,
    attachment: null,
    trigger: null,
    referencedItemId: null,
    styleGuide: null,
    ...overrides,
  };
}

function decision(overrides: Record<string, unknown>) {
  return {
    value: { reasoning: "", reply: "", path: "", brands: [], attributes: [], sizes: [], query: "", exclude_ids: [], quick_options: [], confidence: 0.9, price_min: null, price_max: null, ...overrides },
    usage: { cachedTokens: 0 },
  };
}

async function run(ctx: AgentContext): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of runPersona(ctx)) events.push(event);
  return events;
}

const text = (events: AgentEvent[]) =>
  events.flatMap((event) => (event.type === "text" ? [event.delta] : [])).join("");
const promptOf = (call: number) => deps.callStructured.mock.calls[call][0].userText as string;

describe("runPersona", () => {
  beforeEach(() => {
    deps.callStructured.mockReset();
    deps.searchCatalog.mockReset();
    deps.verifyForDisplay.mockReset().mockImplementation(async (_ctx: unknown, candidates: unknown[]) => candidates);
  });

  it("lets the model word a search that cannot run, in the shopper's language", async () => {
    deps.callStructured
      .mockResolvedValueOnce(decision({ action: "filter", path: "women > bottom > skirt" }))
      .mockResolvedValueOnce(decision({ action: "filter", path: "women > bottom > skirt" }))
      .mockResolvedValueOnce(decision({ action: "answer", reply: "للأسف ما عندنا تنانير حالياً.", quick_options: ["بناطيل"] }));
    const events = await run(context({ message: "عايزة جيبة" }));
    expect(text(events)).toBe("للأسف ما عندنا تنانير حالياً.");
    expect(events).toContainEqual({ type: "quick_options", options: ["بناطيل"] });
    expect(promptOf(2)).toContain("## CANNOT SEARCH");
    expect(deps.searchCatalog).not.toHaveBeenCalled();
  });

  it("falls back to the fixed line only when the honest reply cannot be written", async () => {
    deps.callStructured
      .mockResolvedValueOnce(decision({ action: "filter", path: "women > bottom > skirt" }))
      .mockResolvedValueOnce(decision({ action: "filter", path: "women > bottom > skirt" }))
      .mockRejectedValueOnce(new Error("Gemini down"));
    expect(text(await run(context()))).toMatch(/^I couldn't find that in this store/);
  });

  it("asks the model again instead of overwriting its reply when the catalog cannot be searched", async () => {
    deps.callStructured
      .mockResolvedValueOnce(decision({ action: "filter", path: "women > bottom > trouser" }))
      .mockResolvedValueOnce(decision({ action: "answer", reply: "Les produits arrivent bientôt." }));
    const events = await run(context({ catalogReady: false, message: "des pantalons" }));
    expect(text(events)).toBe("Les produits arrivent bientôt.");
    expect(promptOf(0)).toContain("catalog: unavailable");
    expect(promptOf(1)).toContain("cannot be searched right now");
  });

  it("never repeats a card on show me more, and keeps the earlier batch on screen", async () => {
    const last: LastSearch = {
      action: "filter",
      path: "women > bottom > trouser",
      brands: [],
      priceMin: null,
      priceMax: null,
      attributes: [],
      sizes: [],
      query: "",
    };
    deps.callStructured.mockResolvedValueOnce(decision({ action: "filter", path: "women > bottom > trouser", reply: "More trousers." }));
    deps.searchCatalog.mockResolvedValue({ candidates: [candidate({ externalId: "new-1" })], filter: "f" });
    const events = await run(context({ lastSearch: last, shownProductIds: ["old-1", "old-2"], message: "show me more" }));
    expect(deps.searchCatalog.mock.calls[0][1].excludeIds).toEqual(["old-1", "old-2"]);
    expect(events).toContainEqual({
      type: "retrieval_state",
      shownProductIds: ["new-1", "old-1", "old-2"],
      lastSearch: expect.objectContaining({ path: "women > bottom > trouser" }),
    });
  });

  it("says that is everything when show me more finds nothing new", async () => {
    const last: LastSearch = { action: "filter", path: "women > bottom > trouser", brands: [], priceMin: null, priceMax: null, attributes: [], sizes: [], query: "" };
    deps.callStructured
      .mockResolvedValueOnce(decision({ action: "filter", path: "women > bottom > trouser" }))
      .mockResolvedValueOnce(decision({ action: "answer", reply: "That's all the trousers we have right now." }));
    deps.searchCatalog.mockResolvedValue({ candidates: [], filter: "f" });
    const events = await run(context({ lastSearch: last, shownProductIds: ["old-1"], message: "more" }));
    expect(promptOf(1)).toContain("## NOTHING MORE TO SHOW");
    expect(text(events)).toBe("That's all the trousers we have right now.");
  });

  it("sends a second request when a decision times out, instead of failing the turn", async () => {
    deps.callStructured
      .mockRejectedValueOnce(new GeminiChatError("The request to Gemini timed out.", 504))
      .mockResolvedValueOnce(decision({ action: "answer", reply: "Hi! What are you shopping for today?" }));
    const events = await run(context({ message: "hi" }));
    expect(text(events)).toBe("Hi! What are you shopping for today?");
    expect(deps.callStructured).toHaveBeenCalledTimes(2);
    expect(deps.callStructured.mock.calls[1][0].timeoutMs).toBeLessThanOrEqual(17_000);
  });

  it("carries the last search's brand and price into a refinement that only changes the colour", async () => {
    const last: LastSearch = {
      action: "filter",
      path: "women > bottom > trouser",
      brands: ["Acme"],
      priceMin: null,
      priceMax: 60,
      attributes: [{ key: "color", values: ["Black"] }],
      sizes: [],
      query: "",
    };
    deps.callStructured.mockResolvedValueOnce(
      decision({ action: "filter", refine: true, path: "women > bottom > trouser", attributes: [{ key: "color", values: ["Navy"] }] })
    );
    deps.searchCatalog.mockResolvedValue({ candidates: [candidate({ externalId: "n-1" })], filter: "f" });
    await run(context({ lastSearch: last, message: "in navy?" }));
    const spec = deps.searchCatalog.mock.calls[0][1];
    expect(spec.brands).toEqual(["Acme"]);
    expect(spec.priceMax).toBe(60);
    expect(spec.attributes).toEqual([expect.objectContaining({ key: "color", values: ["Navy"] })]);
  });

  it("says nothing comes in their size when the search finds stock once fit is left out", async () => {
    deps.callStructured
      .mockResolvedValueOnce(decision({ action: "filter", path: "women > bottom > trouser" }))
      .mockResolvedValueOnce(decision({ action: "answer", reply: "Nothing in your size right now." }));
    deps.searchCatalog
      .mockResolvedValueOnce({ candidates: [], filter: "f" })
      .mockResolvedValueOnce({ candidates: [candidate({ externalId: "other-size" })], filter: "f" });
    const measurements = { heightCm: 170, chestCm: 90, waistCm: 70, hipsCm: 96, shoeSizeEu: 39 };
    await run(context({ session: { audience: "woman", department: "women", budget: null, measurements } }));
    expect(deps.searchCatalog.mock.calls[1][4]).toEqual({ skipFit: true });
    expect(promptOf(1)).toContain("## NOTHING IN THEIR SIZE");
  });

  it("keeps Arabic quick options in Modern Standard Arabic", async () => {
    deps.callStructured.mockResolvedValueOnce(
      decision({ action: "answer", reply: "نعم، إنه من القطن.", quick_options: ["وريني خيارات أخرى", "ألوان أخرى", "عايز أرخص", "كده تمام"] })
    );
    const events = await run(context({ message: "ده قطن؟" }));
    expect(events).toContainEqual({ type: "quick_options", options: ["أرني خيارات أخرى", "ألوان أخرى", "أريد أرخص"] });
  });

  it("answers in the shopper's language when no model call can word the reply", async () => {
    deps.callStructured
      .mockResolvedValueOnce(decision({ action: "filter", path: "women > bottom > skirt" }))
      .mockResolvedValueOnce(decision({ action: "filter", path: "women > bottom > skirt" }))
      .mockRejectedValueOnce(new Error("Gemini down"));
    expect(text(await run(context({ message: "عايزة جيبة" })))).toMatch(/لم أجد/);
  });

  it("does not resend a refusal", async () => {
    deps.callStructured.mockRejectedValueOnce(new GeminiChatError("bad request", 400));
    await expect(run(context({ message: "hi" }))).rejects.toThrow("bad request");
    expect(deps.callStructured).toHaveBeenCalledTimes(1);
  });

  it("meters every request it sends, once each", async () => {
    const meter = createSessionMeter();
    deps.callStructured.mockResolvedValueOnce(decision({ action: "answer", reply: "Hi!" }));
    await run(context({ message: "hi", meter }));
    await Promise.allSettled(meter.pending);
    expect(deps.callStructured.mock.calls[0][0].meter).toBeUndefined();
    expect(meter.geminiCalls).toBe(1);
  });

  it("charges the backup request that lost the race too, once it settles", async () => {
    vi.useFakeTimers();
    const meter = createSessionMeter();
    let finishSlow: (value: unknown) => void = () => {};
    deps.callStructured
      .mockImplementationOnce(() => new Promise((resolve) => (finishSlow = resolve)))
      .mockResolvedValueOnce(decision({ action: "answer", reply: "Hi!" }));
    const turn = run(context({ message: "hi", meter }));
    await vi.advanceTimersByTimeAsync(8_100);
    await turn;
    finishSlow(decision({ action: "answer", reply: "late" }));
    await Promise.allSettled(meter.pending);
    vi.useRealTimers();
    expect(meter.geminiCalls).toBe(2);
  });

  it("starts a fresh screen for a new search", async () => {
    deps.callStructured.mockResolvedValueOnce(decision({ action: "filter", path: "women > top", reply: "Tops." }));
    deps.searchCatalog.mockResolvedValue({ candidates: [candidate({ externalId: "t-1" })], filter: "f" });
    const events = await run(context({ shownProductIds: ["old-1"] }));
    expect(deps.searchCatalog.mock.calls[0][1].excludeIds).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: "retrieval_state", shownProductIds: ["t-1"] }));
  });
});

describe("isRepeatSearch", () => {
  const base: LastSearch = { action: "cosine", path: "men > top > shirt", brands: ["A"], priceMin: null, priceMax: 500, attributes: [{ key: "color", values: ["White", "Blue"] }], sizes: [], query: "Linen  Summer" };

  it("matches the same search regardless of order, case and spacing", () => {
    expect(isRepeatSearch(base, { ...base, attributes: [{ key: "Color", values: ["blue", "white"] }], query: "linen summer" })).toBe(true);
  });

  it("does not match a refinement", () => {
    expect(isRepeatSearch(base, { ...base, priceMax: 400 })).toBe(false);
    expect(isRepeatSearch(base, { ...base, query: "linen summer relaxed" })).toBe(false);
    expect(isRepeatSearch(null, base)).toBe(false);
  });
});
