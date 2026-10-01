import { describe, expect, it } from "vitest";
import { buildPathConfig } from "@/lib/catalog/path-config/build";
import { CONFIG, acsProduct } from "../__fixtures__/catalog";
import { normalizeDecision, type PersonaDecision } from "./schema";
import { gateOnConfidence, planDecision, type DecisionPlan } from "./validate";

function decision(overrides: Partial<PersonaDecision>): PersonaDecision {
  return normalizeDecision({ reasoning: "", reply: "", ...overrides });
}

describe("planDecision", () => {
  it("passes answers and questions through", () => {
    expect(planDecision(CONFIG, decision({ action: "answer" }))).toEqual({ kind: "reply" });
    expect(planDecision(CONFIG, decision({ action: "ask" }))).toEqual({ kind: "reply" });
  });

  it("keeps the query only for cosine", () => {
    const filter = planDecision(CONFIG, decision({ action: "filter", path: "women > top", query: "ignored" }));
    expect(filter.kind === "search" && filter.search.query).toBe("");
    const cosine = planDecision(CONFIG, decision({ action: "cosine", path: "women > top", query: "relaxed summer tee" }));
    expect(cosine.kind === "search" && cosine.search.query).toBe("relaxed summer tee");
  });

  it("returns validation problems for a bad search", () => {
    const plan = planDecision(CONFIG, decision({ action: "filter", path: "men > top" }));
    expect(plan.kind).toBe("invalid");
  });

  it("never plans an outfit — an unknown action falls back to a reply", () => {
    const plan = planDecision(CONFIG, decision({ action: "split" as PersonaDecision["action"] }));
    expect(plan).toEqual({ kind: "reply" });
  });
});

describe("sizes", () => {
  it("carries a named size into the spec and reports an unlisted one", () => {
    const config = buildPathConfig([acsProduct("s", "women > top > shirt", 30, { sizes: ["S", "M"] })]);
    const plan = planDecision(config, decision({ action: "filter", path: "women > top > shirt", sizes: ["m"] }));
    expect(plan.kind === "search" && plan.search.spec.sizes).toEqual(["M"]);

    const bad = planDecision(config, decision({ action: "filter", path: "women > top > shirt", sizes: ["XL"] }));
    expect(bad.kind === "invalid" && bad.problems[0]).toMatch(/listed: M, S/);
  });
});

describe("gateOnConfidence", () => {
  const search = planDecision(CONFIG, decision({ action: "filter", path: "women > top" }));

  it("sends an unsure search back once and keeps sure ones", () => {
    expect(gateOnConfidence(search, 0.9)).toBe(search);
    const gated = gateOnConfidence(search, 0.3);
    expect(gated.kind === "invalid" && gated.problems[0]).toMatch(/confidence was 0.3/);
  });

  it("never gates replies or already-invalid plans", () => {
    const reply = { kind: "reply" } as const;
    expect(gateOnConfidence(reply, 0)).toBe(reply);
    const invalid: DecisionPlan = { kind: "invalid", problems: ["x"] };
    expect(gateOnConfidence(invalid, 0)).toBe(invalid);
  });
});

describe("normalizeDecision", () => {
  it("falls back to answer and fills missing fields", () => {
    const normalized = normalizeDecision({ action: "dance" as PersonaDecision["action"] });
    expect(normalized.action).toBe("answer");
    expect(normalized.brands).toEqual([]);
    expect(normalized.price_max).toBeNull();
    expect(normalized.sizes).toEqual([]);
  });
});
