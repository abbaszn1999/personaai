import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext, AgentEvent } from "./types";

const agents = vi.hoisted(() => ({
  runPersona: vi.fn(),
  runBundle: vi.fn(),
  runAttribute: vi.fn(),
}));

vi.mock("./persona/agent", () => ({ runPersona: agents.runPersona }));
vi.mock("./bundle/agent", () => ({ runBundle: agents.runBundle }));
vi.mock("./attribute/agent", () => ({ runAttribute: agents.runAttribute }));

import { parseAttribution } from "./attribution";
import { dispatchTurn } from "./dispatch";

function context(overrides: Partial<AgentContext>): AgentContext {
  return { message: "hi", attachment: null, trigger: null, ...overrides } as AgentContext;
}

async function collect(ctx: AgentContext): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of dispatchTurn(ctx)) events.push(event);
  return events;
}

const look = { id: "look-1", label: "Look 1", productIds: ["a"], items: [], anchorId: "a", total: 10, budget: null, department: "women", slots: [] };

describe("dispatchTurn", () => {
  beforeEach(() => {
    for (const [name, run] of Object.entries(agents)) {
      run.mockReset();
      run.mockImplementation(async function* () {
        yield { type: "agent", agent: name } as unknown as AgentEvent;
      });
    }
  });

  it("routes by what was clicked, never by wording", async () => {
    await collect(context({ trigger: { type: "complete_look", productId: "a" } }));
    await collect(context({ attachment: { kind: "look", look } }));
    expect(agents.runBundle).toHaveBeenCalledTimes(2);

    await collect(context({ attachment: { kind: "item", productId: "a" }, message: "complete the look" }));
    expect(agents.runAttribute).toHaveBeenCalledWith(expect.anything(), "a");

    await collect(context({ message: "build me an outfit" }));
    expect(agents.runPersona).toHaveBeenCalledTimes(1);
    expect(agents.runBundle).toHaveBeenCalledTimes(2);
  });

  it("a trigger wins over an attached item", async () => {
    await collect(context({ trigger: { type: "complete_look", productId: "a" }, attachment: { kind: "item", productId: "b" } }));
    expect(agents.runBundle).toHaveBeenCalledTimes(1);
    expect(agents.runAttribute).not.toHaveBeenCalled();
  });

  it("asks for a message when there is nothing to act on", async () => {
    const events = await collect(context({ message: "" }));
    expect(events).toEqual([{ type: "error", message: "Type a message to get started." }, { type: "done" }]);
    expect(agents.runPersona).not.toHaveBeenCalled();
  });

  it("ends a successful turn with its attribution, credited to the agent that showed products", async () => {
    agents.runAttribute.mockImplementation(async function* () {
      yield { type: "agent", agent: "attribute" } as AgentEvent;
      yield { type: "agent", agent: "persona" } as AgentEvent;
      yield { type: "product_recommendations", productIds: ["x"] } as AgentEvent;
      yield {
        type: "retrieval_state",
        shownProductIds: ["x"],
        lastSearch: { action: "cosine", path: "men > top", brands: [], priceMin: null, priceMax: null, attributes: [], sizes: [], query: "black tee" },
      } as AgentEvent;
    });
    const events = await collect(context({ attachment: { kind: "item", productId: "a" } }));
    expect(events.at(-2)).toEqual({
      type: "attribution",
      attribution: { agent: "persona", action: "cosine", path: "men > top", query: "black tee", lookIds: [] },
    });

    agents.runBundle.mockImplementation(async function* () {
      yield { type: "agent", agent: "bundle" } as AgentEvent;
      yield { type: "bundle", bundles: [look], products: [] } as AgentEvent;
    });
    const bundle = await collect(context({ trigger: { type: "complete_look", productId: "a" } }));
    expect(bundle.at(-2)).toMatchObject({ attribution: { agent: "bundle", action: "complete_look", lookIds: ["look-1"] } });
  });

  it("turns an agent failure into an error event and always ends with done", async () => {
    agents.runPersona.mockImplementation(async function* () {
      yield { type: "status", stage: "thinking" } as AgentEvent;
      throw new Error("boom");
    });
    const events = await collect(context({}));
    expect(events.map((event) => event.type)).toEqual(["status", "error", "done"]);
  });
});

describe("parseAttribution", () => {
  it("keeps well-formed fields and rejects the rest", () => {
    expect(parseAttribution({ agent: "persona", action: "filter", path: "men > top", query: 5, lookIds: ["a", 1] })).toEqual({
      agent: "persona",
      action: "filter",
      path: "men > top",
      query: null,
      lookIds: ["a"],
    });
    expect(parseAttribution({ agent: "admin", action: "filter" })).toBeNull();
    expect(parseAttribution("nope")).toBeNull();
  });
});
