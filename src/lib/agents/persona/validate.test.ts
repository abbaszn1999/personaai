import { describe, expect, it } from "vitest";
import { buildPathConfig } from "@/lib/catalog/path-config/build";
import { CONFIG, acsProduct } from "../__fixtures__/catalog";
import { normalizeDecision, type PersonaDecision } from "./schema";
import { gateOnConfidence, mergeRefinement, planDecision, type DecisionPlan } from "./validate";

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

describe("own department only", () => {
  const config = buildPathConfig([
    acsProduct("m-shirt", "men > top > shirt", 40),
    acsProduct("w-dress", "women > full-body > dress", 60),
    acsProduct("u-tee", "unisex > top > t-shirt", 20),
    acsProduct("kb-tee", "kids-boys > top > t-shirt", 15),
  ]);

  it("lets a profile shop its own department and its unisex twin", () => {
    expect(planDecision(config, decision({ action: "filter", path: "men > top > shirt" }), "men").kind).toBe("search");
    expect(planDecision(config, decision({ action: "filter", path: "unisex > top > t-shirt" }), "men").kind).toBe("search");
  });

  it("refuses a search sized for someone else and says what to do", () => {
    const plan = planDecision(config, decision({ action: "cosine", path: "women > full-body > dress", query: "x" }), "men");
    expect(plan.kind).toBe("invalid");
    expect(plan.kind === "invalid" && plan.problems[0]).toMatch(/women department.*profile is men.*Add profile/);
    expect(planDecision(config, decision({ action: "filter", path: "kids-boys > top" }), "men").kind).toBe("invalid");
  });

  it("lets a unisex profile wear either gendered department of its age group", () => {
    expect(planDecision(config, decision({ action: "filter", path: "women > full-body > dress" }), "unisex").kind).toBe("search");
    expect(planDecision(config, decision({ action: "filter", path: "kids-boys > top" }), "unisex").kind).toBe("invalid");
  });

  it("places no restriction when the profile's department is unknown", () => {
    expect(planDecision(config, decision({ action: "filter", path: "women > full-body > dress" }), null).kind).toBe("search");
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

describe("several leaves and exclusions", () => {
  it("searches every named leaf, with exclusions in the store's spelling", () => {
    const plan = planDecision(
      CONFIG,
      decision({
        action: "filter",
        path: "women > bottom > trouser",
        also_paths: ["women > top > t-shirt"],
        exclude_brands: ["acme", "Nobody"],
        exclude_attributes: [{ key: "color", values: ["black"] }],
      })
    );
    expect(plan.kind).toBe("search");
    if (plan.kind !== "search") return;
    expect(plan.search.spec.paths).toEqual(expect.arrayContaining(["women > bottom > trouser", "women > top > t-shirt"]));
    expect(plan.search.alsoPaths).toEqual(["women > top > t-shirt"]);
    expect(plan.search.spec.excludeBrands).toEqual(["Acme"]);
    expect(plan.search.spec.excludeAttributes).toEqual([expect.objectContaining({ key: "color", values: ["Black"] })]);
  });

  it("returns a problem for an extra leaf the store doesn't stock", () => {
    const plan = planDecision(CONFIG, decision({ action: "filter", path: "women > bottom > trouser", also_paths: ["women > top > blouse"] }));
    expect(plan.kind).toBe("invalid");
  });
});

describe("mergeRefinement", () => {
  const last = {
    action: "filter" as const,
    path: "women > bottom > trouser",
    brands: ["Acme"],
    priceMin: 20,
    priceMax: 60,
    attributes: [{ key: "color", values: ["Black"] }],
    sizes: [],
    query: "",
  };

  it("carries every constraint the refinement leaves empty", () => {
    const merged = mergeRefinement(
      decision({ action: "filter", refine: true, path: "women > bottom > trouser", attributes: [{ key: "material", values: ["Cotton"] }] }),
      last
    );
    expect(merged.brands).toEqual(["Acme"]);
    expect([merged.price_min, merged.price_max]).toEqual([20, 60]);
    expect(merged.attributes.map((attribute) => attribute.key)).toEqual(["material", "color"]);
  });

  it("drops what the shopper removed and replaces a changed price window whole", () => {
    const merged = mergeRefinement(
      decision({ action: "filter", refine: true, path: "", price_max: 30, drop: ["brands", "color"] }),
      last
    );
    expect(merged.path).toBe("women > bottom > trouser");
    expect(merged.brands).toEqual([]);
    expect([merged.price_min, merged.price_max]).toEqual([null, 30]);
    expect(merged.attributes).toEqual([]);
  });

  it("carries nothing into a different garment or a non-refinement", () => {
    const other = decision({ action: "filter", refine: true, path: "women > top > t-shirt" });
    expect(mergeRefinement(other, last).brands).toEqual([]);
    const fresh = decision({ action: "filter", refine: false, path: "women > bottom > trouser" });
    expect(mergeRefinement(fresh, last).brands).toEqual([]);
  });
});
