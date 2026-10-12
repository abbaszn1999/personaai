import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPathConfig } from "@/lib/catalog/path-config/build";
import { renderPathConfig } from "@/lib/catalog/path-config/render";
import type { PersonaPathConfig, StoredPathConfig } from "@/lib/catalog/path-config/types";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import { CONFIG, acsProduct, candidate } from "../__fixtures__/catalog";
import type { SearchSpec } from "../shared/acs-translator";
import type { AgentContext, AgentEvent, LookRecord } from "../types";

const deps = vi.hoisted(() => ({
  callStructured: vi.fn(),
  searchCatalog: vi.fn(),
  runPersona: vi.fn(),
}));

vi.mock("../shared/structured-call", async (original) => ({
  ...(await original<typeof import("../shared/structured-call")>()),
  agentModel: () => "test-model",
  callStructured: deps.callStructured,
}));
vi.mock("../shared/search", () => ({ searchCatalog: deps.searchCatalog }));
vi.mock("../shared/hydrate", () => ({
  hydrateLiveFacts: async (_connection: unknown, items: unknown[]) => items,
  toProducts: (items: Array<{ externalId: string }>) => items.map((item) => ({ id: item.externalId })),
}));
vi.mock("../persona/agent", () => ({ runPersona: deps.runPersona }));
vi.mock("../shared/stream", async (original) => ({
  ...(await original<typeof import("../shared/stream")>()),
  textEvents: async function* (text: string) {
    yield { type: "text", delta: text };
  },
}));

import { runBundle } from "./agent";

function stored(config: PersonaPathConfig): StoredPathConfig {
  return {
    connectionId: "conn",
    config,
    renderedText: renderPathConfig(config),
    fingerprint: "f",
    taxonomyVersion: 1,
    builtAt: "",
    staleAt: null,
    geminiCacheName: null,
    geminiCacheKey: null,
    geminiCacheExpiresAt: null,
  };
}

const pathConfig = stored(CONFIG);

const anchor = candidate({ externalId: "w-tee-1", price: 25, categoryPaths: [["persona", "women", "top", "t-shirt"]] });
const trousers = candidate({ externalId: "w-trouser-1", price: 40, categoryPaths: [["persona", "women", "bottom", "trouser"]] });
const trousers2 = candidate({ externalId: "w-trouser-3", price: 65, categoryPaths: [["persona", "women", "bottom", "trouser"]] });
const sneakers = candidate({ externalId: "w-sneaker-1", price: 80, categoryPaths: [["persona", "women", "footwear", "sneaker"]] });

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
    message: "",
    products: new Map([[anchor.externalId, anchor]]),
    shownProductIds: [],
    lastSearch: null,
    attachment: { kind: "anchor", productId: anchor.externalId },
    referencedItemId: null,
    styleGuide: null,
    ...overrides,
  };
}

function reply(overrides: Record<string, unknown>) {
  return {
    value: { reasoning: "", intent: "rerun", reply: "", brief: "", language: "English", budget: null, new_pieces: false, ...overrides },
    usage: { cachedTokens: 0 },
  };
}

function followUpReply(overrides: Record<string, unknown>) {
  return {
    value: { reasoning: "", intent: "answer", reply: "", brief: "", language: "English", slots: [], drop_slots: [], budget: null, ...overrides },
    usage: { cachedTokens: 0 },
  };
}

async function run(ctx: AgentContext): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of runBundle(ctx)) events.push(event);
  return events;
}

const text = (events: AgentEvent[]) => events.flatMap((event) => (event.type === "text" ? [event.delta] : [])).join("");
const attachments = (events: AgentEvent[]) => events.flatMap((event) => (event.type === "attachment" ? [event.attachment] : []));
const specs = () => deps.searchCatalog.mock.calls.map((call) => call[1] as SearchSpec);
const userText = (index: number) => (deps.callStructured.mock.calls[index]?.[0] as { userText: string } | undefined)?.userText ?? "";

function bySlot(map: Record<string, CatalogCandidate[]>) {
  return async (_ctx: unknown, spec: SearchSpec) => {
    const key = Object.keys(map).find((slot) => spec.paths.some((path) => path.includes(`> ${slot}`)));
    return { candidates: key ? map[key] : [] };
  };
}

describe("the Bundle agent with an anchor attached", () => {
  beforeEach(() => {
    deps.callStructured.mockReset();
    deps.searchCatalog.mockReset();
    deps.runPersona.mockReset().mockImplementation(async function* () {
      yield { type: "agent", agent: "persona" } as AgentEvent;
    });
  });

  it("answers about other products with a pointer to ×, and stays attached", async () => {
    deps.callStructured.mockResolvedValueOnce(reply({ intent: "detach", reply: "للبحث عن منتجات أخرى اضغط ×." }));
    const events = await run(context({ message: "أريد بنطلون جينز" }));

    expect(text(events)).toBe("للبحث عن منتجات أخرى اضغط ×.");
    expect(attachments(events)).toEqual([]);
    expect(deps.runPersona).not.toHaveBeenCalled();
    expect(deps.searchCatalog).not.toHaveBeenCalled();
  });

  it("falls back to a pointer to × in the shopper's language when the model gives no wording", async () => {
    deps.callStructured.mockResolvedValueOnce(reply({ intent: "detach", reply: "  ", language: "English" }));
    expect(text(await run(context({ message: "show me jeans" })))).toMatch(/press ×/);

    deps.callStructured.mockResolvedValueOnce(reply({ intent: "detach", reply: "", language: "Modern Standard Arabic" }));
    const arabic = text(await run(context({ message: "عندكم شنط؟" })));
    expect(arabic).toMatch(/×/);
    expect(arabic).toMatch(/[\u0600-\u06FF]/);

    deps.callStructured.mockResolvedValueOnce(reply({ intent: "detach", reply: "", language: "French" }));
    expect(text(await run(context({ message: "vous avez des sacs ?" })))).toMatch(/appuyez sur ×/);
  });

  it("answers a question without searching and without touching its memory", async () => {
    deps.callStructured.mockResolvedValueOnce(reply({ intent: "answer", reply: "It's a cotton tee.", brief: "what is it made of" }));
    const events = await run(context({ message: "what is it made of?" }));
    expect(text(events)).toBe("It's a cotton tee.");
    expect(attachments(events)).toEqual([]);
    expect(deps.searchCatalog).not.toHaveBeenCalled();
  });

  it("builds looks from what was typed, keeps the budget it named and remembers the brief and the pieces shown", async () => {
    deps.callStructured
      .mockResolvedValueOnce(reply({ intent: "rerun", budget: 300, brief: "something casual" }))
      .mockRejectedValue(new Error("model unavailable")); // the plan and compose fall back to code
    deps.searchCatalog.mockImplementation(bySlot({ bottom: [trousers], footwear: [sneakers] }));

    const events = await run(context({ message: "something casual, 300 total" }));

    expect(events).toContainEqual({ type: "budget", budget: 300 });
    const bundle = events.find((event) => event.type === "bundle");
    expect(bundle).toMatchObject({
      type: "bundle",
      bundles: [expect.objectContaining({ anchorId: "w-tee-1", budget: 300, brief: "something casual" })],
    });
    expect(attachments(events)).toEqual([
      { kind: "anchor", productId: "w-tee-1", brief: "something casual", shownIds: ["w-trouser-1", "w-sneaker-1"] },
    ]);
    expect(deps.runPersona).not.toHaveBeenCalled();
  });

  it("builds the looks from the very first message, even a bare 'go' with no budget", async () => {
    deps.callStructured.mockResolvedValueOnce(reply({ intent: "rerun", budget: null })).mockRejectedValue(new Error("model unavailable"));
    deps.searchCatalog.mockImplementation(bySlot({ bottom: [trousers], footwear: [sneakers] }));

    const events = await run(context({ message: "go", history: [] }));

    expect(events.some((event) => event.type === "budget")).toBe(false);
    expect(events.find((event) => event.type === "bundle")).toMatchObject({
      bundles: [expect.objectContaining({ anchorId: "w-tee-1", budget: null })],
    });
    expect(attachments(events)).not.toContainEqual(null);
  });

  it("reads 0 as no limit and does not repeat an unchanged budget", async () => {
    deps.callStructured.mockResolvedValueOnce(reply({ intent: "rerun", budget: 0 })).mockRejectedValue(new Error("down"));
    deps.searchCatalog.mockResolvedValue({ candidates: [] });
    const cleared = await run(context({ message: "no limit", session: { audience: "woman", department: "women", budget: 200, measurements: null } }));
    expect(cleared).toContainEqual({ type: "budget", budget: null });

    deps.callStructured.mockReset().mockResolvedValueOnce(reply({ intent: "rerun", budget: null })).mockRejectedValue(new Error("down"));
    const unchanged = await run(context({ message: "more formal", session: { audience: "woman", department: "women", budget: 200, measurements: null } }));
    expect(unchanged.some((event) => event.type === "budget")).toBe(false);
  });

  it("gives the plan everything asked so far, the store's language and the reply language", async () => {
    deps.callStructured
      .mockResolvedValueOnce(reply({ intent: "rerun", brief: "summer wedding, under 140 in total", language: "Modern Standard Arabic" }))
      .mockRejectedValue(new Error("down"));
    deps.searchCatalog.mockImplementation(bySlot({ bottom: [trousers], footwear: [sneakers] }));

    await run(
      context({
        message: "الميزانية 140",
        attachment: { kind: "anchor", productId: anchor.externalId, brief: "summer wedding", shownIds: ["x-1"] },
        styleGuide: "We dress clean and minimal.",
      })
    );

    expect(userText(0)).toContain("## ASKED SO FAR\nsummer wedding");
    expect(userText(0)).toContain("## LOOKS SHOWN\nyes — 1 pieces");
    const plan = userText(1);
    expect(plan).toContain("## SHOPPER REQUEST\nsummer wedding, under 140 in total");
    expect(plan).toContain("## REPLY LANGUAGE\nModern Standard Arabic");
    expect(plan).toMatch(/## STORE\ncurrency: USD\ncatalog language: /);
    expect(plan).toContain("We dress clean and minimal.");
    expect(plan).toMatch(/price position: tier [ABC] of women > top > t-shirt/);
  });

  it("falls back to the earlier brief plus the message when the model writes none", async () => {
    deps.callStructured.mockResolvedValueOnce(reply({ intent: "rerun", brief: "" })).mockRejectedValue(new Error("down"));
    deps.searchCatalog.mockImplementation(bySlot({ bottom: [trousers], footwear: [sneakers] }));
    const events = await run(context({ message: "darker colours", attachment: { kind: "anchor", productId: anchor.externalId, brief: "for the office" } }));
    expect(attachments(events)[0]).toMatchObject({ brief: "for the office; darker colours" });
  });

  it("avoids pieces already shown when other looks are asked for, and lets go when too little is left", async () => {
    deps.callStructured.mockResolvedValueOnce(reply({ intent: "rerun", new_pieces: true })).mockRejectedValue(new Error("down"));
    deps.searchCatalog.mockImplementation(async (_ctx: unknown, spec: SearchSpec) => {
      if (spec.paths.some((path) => path.includes("> footwear"))) return { candidates: [sneakers] };
      return { candidates: spec.excludeIds.includes("w-trouser-1") ? [trousers2] : [trousers, trousers2] };
    });

    const events = await run(
      context({ message: "show me other looks", attachment: { kind: "anchor", productId: anchor.externalId, shownIds: ["w-trouser-1"] } })
    );

    const bottoms = specs().filter((spec) => spec.paths.some((path) => path.includes("> bottom")));
    expect(bottoms[0].excludeIds).toContain("w-trouser-1");
    expect(bottoms[1].excludeIds).not.toContain("w-trouser-1");
    // The piece not shown yet stays first; the fallback look picks it.
    const bundle = events.find((event): event is Extract<AgentEvent, { type: "bundle" }> => event.type === "bundle");
    expect(bundle?.bundles[0].productIds).toContain("w-trouser-3");
    expect(attachments(events)[0]).toMatchObject({ shownIds: expect.arrayContaining(["w-trouser-1", "w-trouser-3"]) });
  });

  it("keeps a premium anchor in premium company while the stock allows", async () => {
    const rich = buildPathConfig([
      ...[10, 15, 20, 25, 30, 35].map((price, index) => acsProduct(`tee-${index}`, "women > top > t-shirt", price)),
      ...[20, 30, 40, 50, 60, 70].map((price, index) => acsProduct(`trouser-${index}`, "women > bottom > trouser", price)),
    ]);
    const premium = candidate({ externalId: "tee-5", price: 35, categoryPaths: [["persona", "women", "top", "t-shirt"]] });
    const picks = [55, 60, 65].map((price, index) =>
      candidate({ externalId: `trouser-p${index}`, price, categoryPaths: [["persona", "women", "bottom", "trouser"]] })
    );
    deps.callStructured.mockResolvedValueOnce(reply({ intent: "rerun" })).mockRejectedValue(new Error("down"));
    deps.searchCatalog.mockResolvedValue({ candidates: picks });

    await run(
      context({
        message: "go",
        pathConfig: stored(rich),
        products: new Map([[premium.externalId, premium]]),
        attachment: { kind: "anchor", productId: premium.externalId },
      })
    );

    const middle = rich.nodes.find((node) => node.path === "women > bottom")!.tiers.find((tier) => tier.label === "B")!;
    expect(specs()[0].priceMin).toBe(middle.min);
    expect(deps.searchCatalog).toHaveBeenCalledTimes(1);
  });

  it("completes a unisex piece from the shopper's own department", async () => {
    const config = buildPathConfig([
      acsProduct("u-tee", "unisex > top > t-shirt", 20),
      acsProduct("m-trouser-1", "men > bottom > trouser", 40),
      acsProduct("m-trouser-2", "men > bottom > trouser", 50),
      acsProduct("u-trouser", "unisex > bottom > trouser", 45),
    ]);
    const tee = candidate({ externalId: "u-tee", price: 20, categoryPaths: [["persona", "unisex", "top", "t-shirt"]] });
    const mens = candidate({ externalId: "m-trouser-1", price: 40, categoryPaths: [["persona", "men", "bottom", "trouser"]] });
    deps.callStructured.mockResolvedValueOnce(reply({ intent: "rerun" })).mockRejectedValue(new Error("down"));
    deps.searchCatalog.mockResolvedValue({ candidates: [mens] });

    const events = await run(
      context({
        message: "go",
        pathConfig: stored(config),
        session: { audience: "man", department: "men", budget: null, measurements: null },
        products: new Map([[tee.externalId, tee]]),
        attachment: { kind: "anchor", productId: tee.externalId },
      })
    );

    expect(specs()[0].paths.join()).toContain("men > bottom");
    expect(events.find((event) => event.type === "bundle")).toMatchObject({ bundles: [expect.objectContaining({ department: "men" })] });
  });

  it("builds from the first message when the decision cannot be had, and asks again later", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.callStructured.mockRejectedValue(new Error("The request to Gemini timed out."));
    deps.searchCatalog.mockImplementation(bySlot({ bottom: [trousers], footwear: [sneakers] }));

    const first = await run(context({ message: "something for the office" }));
    expect(first.find((event) => event.type === "bundle")).toBeDefined();
    expect(attachments(first)[0]).toMatchObject({ kind: "anchor", brief: "something for the office" });

    const later = await run(
      context({ message: "بدي شي أرخص", attachment: { kind: "anchor", productId: anchor.externalId, shownIds: ["w-trouser-1"] } })
    );
    expect(later.some((event) => event.type === "bundle")).toBe(false);
    expect(text(later)).toMatch(/[\u0600-\u06FF]/);
  });

  it("tells the shopper the assistant is busy when the quota is hit, instead of guessing", async () => {
    const { GeminiChatError } = await import("@/lib/ai/gemini-chat");
    deps.callStructured.mockRejectedValue(new GeminiChatError("busy", 429, true));
    await expect(run(context({ message: "go" }))).rejects.toThrow("busy");
    expect(deps.searchCatalog).not.toHaveBeenCalled();
  });

  it("drops the attachment when the piece can't anchor a look", async () => {
    const gone = candidate({ externalId: "w-tee-1", inStock: false });
    const events = await run(context({ message: "300", products: new Map([[gone.externalId, gone]]) }));
    expect(events).toContainEqual({ type: "attachment", attachment: null });
    expect(text(events)).toMatch(/isn't available/);
    expect(deps.callStructured).not.toHaveBeenCalled();
  });

  it("says why in the shopper's language when the piece never anchors an outfit", async () => {
    const bra = candidate({ externalId: "w-bra", categoryPaths: [["persona", "women", "top", "bra"]] });
    const events = await run(context({ message: "ابدأ", products: new Map([[bra.externalId, bra]]), attachment: { kind: "anchor", productId: "w-bra" } }));
    expect(events).toContainEqual({ type: "attachment", attachment: null });
    expect(text(events)).toMatch(/[\u0600-\u06FF]/);
  });

  it("hands over to Persona only when the attached product no longer exists in the store", async () => {
    await run(context({ message: "hello", products: new Map() }));
    expect(deps.runPersona).toHaveBeenCalledTimes(1);
  });
});

describe("the Bundle agent with a look attached", () => {
  const look: LookRecord = {
    id: "look-1",
    label: "Smart office",
    productIds: [anchor.externalId, trousers.externalId],
    items: [
      { productId: anchor.externalId, category: "top", price: 25 },
      { productId: trousers.externalId, category: "bottom", price: 40 },
    ],
    rationale: "",
    anchorId: anchor.externalId,
    total: 65,
    budget: null,
    department: "women",
    slots: [{ slot: "bottom", path: "women > bottom", priceMax: 90, query: "navy trouser", attributes: [] }],
    brief: "for the office",
  };
  const lookContext = (overrides: Partial<AgentContext> = {}) =>
    context({
      attachment: { kind: "look", look },
      products: new Map([
        [anchor.externalId, anchor],
        [trousers.externalId, trousers],
      ]),
      ...overrides,
    });

  beforeEach(() => {
    deps.callStructured.mockReset();
    deps.searchCatalog.mockReset();
    deps.runPersona.mockReset();
  });

  it("keeps the look attached when a message is about other products", async () => {
    deps.callStructured.mockResolvedValueOnce(followUpReply({ intent: "detach", reply: "Press × to search for other things." }));
    const events = await run(lookContext({ message: "show me handbags" }));
    expect(text(events)).toBe("Press × to search for other things.");
    expect(attachments(events)).toEqual([]);
    expect(deps.runPersona).not.toHaveBeenCalled();
  });

  it("shows what it asked for so far and remembers a budget named while changing the look", async () => {
    deps.callStructured
      .mockResolvedValueOnce(
        followUpReply({
          intent: "swap",
          brief: "for the office, under 120",
          budget: 120,
          slots: [{ slot: "bottom", path: "women > bottom", price_max: 80, query: "black tailored trouser", attributes: [] }],
        })
      )
      .mockResolvedValueOnce({
        value: {
          looks: [
            { look: 1, item_ids: ["w-trouser-3"], reason: "sharper" },
            { look: 1, item_ids: ["w-trouser-2"], reason: "softer" },
          ],
          reply: "Two sharper trousers.",
        },
        usage: { cachedTokens: 0 },
      });
    const navy = candidate({ externalId: "w-trouser-2", price: 50, categoryPaths: [["persona", "women", "bottom", "trouser"]] });
    deps.searchCatalog.mockResolvedValue({ candidates: [trousers2, navy] });

    const events = await run(lookContext({ message: "different trousers, 120 total" }));

    expect(userText(0)).toContain("## ASKED SO FAR\nfor the office");
    expect(userText(0)).toMatch(/## STORE\ncurrency: USD/);
    expect(events).toContainEqual({ type: "budget", budget: 120 });
    const bundle = events.find((event): event is Extract<AgentEvent, { type: "bundle" }> => event.type === "bundle");
    expect(bundle?.bundles.map((entry) => entry.label)).toEqual(["Smart office", "Smart office · 2"]);
    expect(bundle?.bundles[0]).toMatchObject({ budget: 120, brief: "for the office, under 120" });
    expect(attachments(events)).toEqual([expect.objectContaining({ kind: "look", look: expect.objectContaining({ productIds: ["w-tee-1", "w-trouser-3"] }) })]);
  });

  it("says the piece is already the cheapest when nothing in stock is under it", async () => {
    const floorPriced = { ...look, items: [look.items[0], { productId: trousers.externalId, category: "bottom", price: 40 }] };
    deps.callStructured.mockResolvedValueOnce(
      followUpReply({ intent: "swap", slots: [{ slot: "bottom", path: "women > bottom", price_max: 30, query: "trouser", attributes: [] }] })
    );
    const events = await run(lookContext({ message: "cheaper trousers", attachment: { kind: "look", look: floorPriced } }));
    expect(text(events)).toMatch(/nothing cheaper in stock to replace the bottoms/);
    expect(text(events)).toMatch(/unchanged/);
    expect(deps.searchCatalog).not.toHaveBeenCalled();
  });

  it("asks the shopper to send it again when the follow-up decision cannot be had", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.callStructured.mockRejectedValue(new Error("The request to Gemini timed out."));
    const events = await run(lookContext({ message: "cheaper trousers" }));
    expect(text(events)).toMatch(/send it again/);
    expect(attachments(events)).toEqual([]);
  });

  it("drops a slot without searching and keeps the brief on the look", async () => {
    deps.callStructured.mockResolvedValueOnce(followUpReply({ intent: "drop_slot", drop_slots: ["bottom"], brief: "for the office, no trousers" }));
    const events = await run(lookContext({ message: "skip the trousers" }));
    expect(deps.searchCatalog).not.toHaveBeenCalled();
    expect(attachments(events)[0]).toMatchObject({ kind: "look", look: { productIds: ["w-tee-1"], total: 25, brief: "for the office, no trousers" } });
  });
});
