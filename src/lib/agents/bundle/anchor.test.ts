import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderPathConfig } from "@/lib/catalog/path-config/render";
import type { StoredPathConfig } from "@/lib/catalog/path-config/types";
import { CONFIG, candidate } from "../__fixtures__/catalog";
import type { AgentContext, AgentEvent } from "../types";

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

const anchor = candidate({ externalId: "w-tee-1", price: 25, categoryPaths: [["persona", "women", "top", "t-shirt"]] });
const trousers = candidate({ externalId: "w-trouser-1", price: 40, categoryPaths: [["persona", "women", "bottom", "trouser"]] });
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
    value: { reasoning: "", intent: "rerun", reply: "", slots: [], drop_slots: [], budget: null, ...overrides },
    usage: { cachedTokens: 0 },
  };
}

async function run(ctx: AgentContext): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of runBundle(ctx)) events.push(event);
  return events;
}

const text = (events: AgentEvent[]) => events.flatMap((event) => (event.type === "text" ? [event.delta] : [])).join("");

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
    expect(events.some((event) => event.type === "attachment")).toBe(false);
    expect(deps.runPersona).not.toHaveBeenCalled();
    expect(deps.searchCatalog).not.toHaveBeenCalled();
  });

  it("falls back to an English pointer when the model gives no wording", async () => {
    deps.callStructured.mockResolvedValueOnce(reply({ intent: "detach", reply: "  " }));
    const events = await run(context({ message: "show me jeans" }));
    expect(text(events)).toMatch(/press ×/);
    expect(events.some((event) => event.type === "attachment")).toBe(false);
  });

  it("answers a question without searching", async () => {
    deps.callStructured.mockResolvedValueOnce(reply({ intent: "answer", reply: "It's a cotton tee." }));
    const events = await run(context({ message: "what is it made of?" }));
    expect(text(events)).toBe("It's a cotton tee.");
    expect(deps.searchCatalog).not.toHaveBeenCalled();
  });

  it("builds looks around the anchor from what was typed, and keeps the budget it named", async () => {
    deps.callStructured
      .mockResolvedValueOnce(reply({ intent: "rerun", budget: 300 }))
      .mockRejectedValue(new Error("model unavailable")); // the plan and compose fall back to code
    deps.searchCatalog.mockImplementation(async (_ctx: unknown, spec: { paths?: string[] }) => ({
      candidates: JSON.stringify(spec).includes("footwear") ? [sneakers] : [trousers],
    }));

    const events = await run(context({ message: "something casual, 300 total" }));

    expect(events).toContainEqual({ type: "budget", budget: 300 });
    const bundle = events.find((event) => event.type === "bundle");
    expect(bundle).toMatchObject({ type: "bundle", bundles: [expect.objectContaining({ anchorId: "w-tee-1", budget: 300 })] });
    expect(events.some((event) => event.type === "attachment")).toBe(false);
    expect(deps.runPersona).not.toHaveBeenCalled();
  });

  it("builds the looks from the very first message, even a bare 'go' with no budget", async () => {
    deps.callStructured
      .mockResolvedValueOnce(reply({ intent: "rerun", budget: null }))
      .mockRejectedValue(new Error("model unavailable"));
    deps.searchCatalog.mockImplementation(async (_ctx: unknown, spec: { paths?: string[] }) => ({
      candidates: JSON.stringify(spec).includes("footwear") ? [sneakers] : [trousers],
    }));

    const events = await run(context({ message: "go", history: [] }));

    expect(events.some((event) => event.type === "budget")).toBe(false);
    expect(events.find((event) => event.type === "bundle")).toMatchObject({
      bundles: [expect.objectContaining({ anchorId: "w-tee-1", budget: null })],
    });
    expect(events.some((event) => event.type === "attachment")).toBe(false);
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

  it("drops the attachment when the piece can't anchor a look", async () => {
    const gone = candidate({ externalId: "w-tee-1", inStock: false });
    const events = await run(context({ message: "300", products: new Map([[gone.externalId, gone]]) }));
    expect(events[events.length - 1]).toBeDefined();
    expect(events).toContainEqual({ type: "attachment", attachment: null });
    expect(text(events)).toMatch(/isn't available/);
    expect(deps.callStructured).not.toHaveBeenCalled();
  });

  it("hands over to Persona only when the attached product no longer exists in the store", async () => {
    await run(context({ message: "hello", products: new Map() }));
    expect(deps.runPersona).toHaveBeenCalledTimes(1);
  });

  it("keeps a look attached when a message is about other products", async () => {
    const look = {
      id: "look-1",
      label: "Look 1",
      productIds: [anchor.externalId],
      items: [],
      rationale: "",
      anchorId: anchor.externalId,
      total: 25,
      budget: null,
      department: "women",
      slots: [],
    };
    deps.callStructured.mockResolvedValueOnce(reply({ intent: "detach", reply: "Press × to search for other things." }));
    const events = await run(context({ attachment: { kind: "look", look }, message: "show me handbags" }));
    expect(text(events)).toBe("Press × to search for other things.");
    expect(events.some((event) => event.type === "attachment")).toBe(false);
    expect(deps.runPersona).not.toHaveBeenCalled();
  });
});
