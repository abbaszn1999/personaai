import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidate } from "../__fixtures__/catalog";
import type { AgentContext, AgentEvent } from "../types";

const deps = vi.hoisted(() => ({
  callStructured: vi.fn(),
  runPersona: vi.fn(),
}));

vi.mock("../shared/structured-call", async (original) => ({
  ...(await original<typeof import("../shared/structured-call")>()),
  attributeModel: () => "test-model",
  callStructured: deps.callStructured,
}));
vi.mock("../persona/agent", () => ({ runPersona: deps.runPersona }));
vi.mock("@/lib/catalog/acs/catalog-reads", () => ({ getProductGroup: async () => [] }));
vi.mock("../shared/stream", async (original) => ({
  ...(await original<typeof import("../shared/stream")>()),
  textEvents: async function* (text: string) {
    yield { type: "text", delta: text };
  },
}));

import { runAttribute } from "./agent";

const item = candidate({ externalId: "tee", title: "Linen Shirt", attributes: { color: ["White"], size: ["S", "M"] } });

function context(message: string, overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    userId: "u",
    visitorId: "v",
    geminiApiKey: "k",
    connection: { id: "conn" } as AgentContext["connection"],
    catalogReady: true,
    categoryScope: ["persona"],
    pathConfig: null,
    session: { audience: "woman", department: "women", budget: null, measurements: null },
    history: [],
    message,
    products: new Map([[item.externalId, item]]),
    shownProductIds: [],
    lastSearch: null,
    attachment: { kind: "item", productId: item.externalId },
    trigger: null,
    referencedItemId: null,
    styleGuide: null,
    ...overrides,
  };
}

async function run(ctx: AgentContext): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of runAttribute(ctx, item.externalId)) events.push(event);
  return events;
}

const text = (events: AgentEvent[]) => events.flatMap((event) => (event.type === "text" ? [event.delta] : [])).join("");
const model = (value: Record<string, unknown>) => ({
  value: { action: "answer", reply: "", quick_options: [], ...value },
  usage: { cachedTokens: 0 },
});

describe("the Attribute agent while an item is attached", () => {
  beforeEach(() => {
    deps.callStructured.mockReset();
    deps.runPersona.mockReset().mockImplementation(async function* () {
      yield { type: "agent", agent: "persona" } as AgentEvent;
    });
  });

  it("never hands over to Persona, even when the shopper asks for other products", async () => {
    for (const message of ["show me something similar", "yes please", "عايز حاجة شبهه"]) {
      deps.callStructured.mockResolvedValueOnce(model({ action: "other_topic", reply: "Press × to search for other things." }));
      const events = await run(context(message));
      expect(text(events)).toBe("Press × to search for other things.");
      expect(events.some((event) => event.type === "attachment")).toBe(false);
    }
    expect(deps.runPersona).not.toHaveBeenCalled();
  });

  it("falls back to an English pointer when the model gives no wording", async () => {
    deps.callStructured.mockResolvedValueOnce(model({ action: "other_topic", reply: "" }));
    expect(text(await run(context("what else do you have?")))).toMatch(/press ×/);
  });

  it("answers structured questions from the record without a model call", async () => {
    const events = await run(context("in red?"));
    expect(text(events)).toMatch(/Press ×/);
    expect(events.some((event) => event.type === "quick_options")).toBe(false);
    expect(deps.callStructured).not.toHaveBeenCalled();
  });

  it("answers open questions with the model's reply and quick options", async () => {
    deps.callStructured.mockResolvedValueOnce(model({ reply: "It's light linen — fine for summer.", quick_options: ["Which sizes?"] }));
    const events = await run(context("is it good for summer?"));
    expect(text(events)).toBe("It's light linen — fine for summer.");
    expect(events).toContainEqual({ type: "quick_options", options: ["Which sizes?"] });
  });

  it("detaches only when the attached product no longer exists", async () => {
    const events = await run(context("is it soft?", { products: new Map() }));
    expect(events).toContainEqual({ type: "attachment", attachment: null });
    expect(deps.runPersona).toHaveBeenCalledTimes(1);
  });
});
