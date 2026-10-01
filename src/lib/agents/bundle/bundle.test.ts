import { describe, expect, it } from "vitest";
import { buildPathConfig } from "@/lib/catalog/path-config/build";
import { findNode } from "@/lib/catalog/path-config/lookup";
import { CONFIG, acsProduct, candidate } from "../__fixtures__/catalog";
import { budgetSuggestions, distinctLooks, lookTotal, naiveLook, verifyLook, type LookRules, type SlotCandidates } from "./compose";
import { fallbackSlotPlan, validateLookPlan, validateSlotPlan, type PlanLimits } from "./plan";
import { renderComposeTurn, renderPlanTurn } from "./prompt";
import {
  fallbackCeilings,
  isOutfitLeaf,
  outfitPaths,
  pathBelongsToSlot,
  slotsForCategory,
  slotsInPlay,
  tierOf,
} from "./slots";

const anchor = candidate({ externalId: "w-tee-1", price: 25, attributes: { color: ["White"] } });

describe("slots", () => {
  it("full-body never pairs with a top or bottom", () => {
    expect(slotsForCategory("full-body")).toEqual(["outerwear", "footwear"]);
    expect(slotsForCategory(null)).toEqual([]);
  });

  it("lists slots in dressing order, footwear last, so queries chain top to bottom", () => {
    expect(slotsForCategory("top")).toEqual(["bottom", "outerwear", "footwear"]);
    expect(slotsForCategory("footwear")).toEqual(["top", "bottom", "outerwear"]);
  });

  it("keeps only slots the store stocks, with the unisex twin and floor", () => {
    const slots = slotsInPlay(CONFIG, "women", "top");
    expect(slots.map((slot) => slot.slot)).toEqual(["bottom", "footwear"]);
    const bottom = slots[0];
    expect(bottom.node.path).toBe("women > bottom");
    expect(bottom.twin?.path).toBe("unisex > bottom");
    expect(bottom.floor).toBe(40);
  });

  it("matches paths to their slot across the twin department", () => {
    const [bottom] = slotsInPlay(CONFIG, "women", "top");
    expect(pathBelongsToSlot(findNode(CONFIG, "unisex > bottom > trouser")!, bottom)).toBe(true);
    expect(pathBelongsToSlot(findNode(CONFIG, "women > top > t-shirt")!, bottom)).toBe(false);
  });

  it("places a price in its tier, clamping outside the range", () => {
    const tiers = [
      { label: "A" as const, min: 10, max: 20, count: 1 },
      { label: "B" as const, min: 20, max: 40, count: 1 },
    ];
    expect(tierOf(tiers, 30)?.label).toBe("B");
    expect(tierOf(tiers, 5)?.label).toBe("A");
    expect(tierOf(tiers, 99)?.label).toBe("B");
    expect(tierOf(tiers, null)).toBeNull();
  });

  it("derives no-budget ceilings from the anchor's tier", () => {
    const slots = slotsInPlay(CONFIG, "women", "top");
    const ceilings = fallbackCeilings(findNode(CONFIG, "women > top > t-shirt"), 25, slots);
    expect([...ceilings.keys()]).toEqual(["bottom", "footwear"]);
  });
});

describe("outfit leaves", () => {
  const config = buildPathConfig([
    acsProduct("tee", "women > top > t-shirt", 20),
    acsProduct("jean", "women > bottom > jean", 50),
    acsProduct("swim", "women > bottom > swim-bottom", 8),
    acsProduct("sneaker", "women > footwear > sneaker", 60),
    acsProduct("sock", "women > footwear > sock", 3),
    acsProduct("sleep", "women > top > sleep-top", 12),
  ]);
  const slots = slotsInPlay(config, "women", "top");

  it("floors come from outfit leaves only", () => {
    expect(slots.map((slot) => [slot.slot, slot.floor])).toEqual([
      ["bottom", 50],
      ["footwear", 60],
    ]);
  });

  it("narrows a category search to its outfit leaves and rejects a non-outfit leaf", () => {
    const limits: PlanLimits = { remaining: null, fallbackCeilings: new Map(), excludeIds: [] };
    const plan = validateSlotPlan(
      config,
      slots,
      [
        { slot: "bottom", path: "women > bottom", price_max: null, query: "", attributes: [] },
        { slot: "footwear", path: "women > footwear > sneaker", price_max: null, query: "", attributes: [] },
      ],
      limits
    );
    expect(plan.ok && plan.searches.map((search) => search.spec.paths)).toEqual([["women > bottom > jean"], ["women > footwear > sneaker"]]);

    const sock = validateSlotPlan(config, slots, [{ slot: "footwear", path: "women > footwear > sock", price_max: null, query: "", attributes: [] }], limits);
    expect(sock.ok === false && sock.problems[0]).toMatch(/not an outfit piece/);
  });

  it("knows which anchors never get a look", () => {
    expect(isOutfitLeaf("bra")).toBe(false);
    expect(isOutfitLeaf("swimsuit")).toBe(false);
    expect(isOutfitLeaf("jean")).toBe(true);
    expect(isOutfitLeaf(null)).toBe(true);
    expect(outfitPaths(config, ["women > top > t-shirt"])).toBeNull();
  });
});

describe("validateSlotPlan", () => {
  const slots = slotsInPlay(CONFIG, "women", "top");
  const budgetLimits: PlanLimits = { remaining: 150, fallbackCeilings: new Map(), excludeIds: ["w-tee-1"] };

  it("accepts a plan inside the budget and treats price_max 0 as skipped", () => {
    const plan = validateSlotPlan(
      CONFIG,
      slots,
      [
        { slot: "bottom", path: "women > bottom > trouser", price_max: 70, query: "tailored", attributes: [] },
        { slot: "footwear", path: "women > footwear", price_max: 0, query: "", attributes: [] },
      ],
      budgetLimits
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.searches.map((search) => search.path)).toEqual(["women > bottom > trouser"]);
    expect(plan.searches[0].spec.excludeIds).toEqual(["w-tee-1"]);
    expect(plan.skipped).toEqual(["footwear"]);
  });

  it("rejects unknown slots, wrong paths, missing ceilings and overspend", () => {
    const plan = validateSlotPlan(
      CONFIG,
      slots,
      [
        { slot: "outerwear", path: "women > outerwear", price_max: 10, query: "", attributes: [] },
        { slot: "bottom", path: "women > top", price_max: 60, query: "", attributes: [] },
        { slot: "footwear", path: "women > footwear", price_max: null, query: "", attributes: [] },
      ],
      budgetLimits
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.problems).toHaveLength(3);

    const over = validateSlotPlan(
      CONFIG,
      slots,
      [
        { slot: "bottom", path: "women > bottom", price_max: 90, query: "", attributes: [] },
        { slot: "footwear", path: "women > footwear", price_max: 80, query: "", attributes: [] },
      ],
      budgetLimits
    );
    expect(over.ok === false && over.problems.join()).toMatch(/add up to 170/);
  });

  it("applies a hard cap below whatever the intent asked for", () => {
    const plan = validateSlotPlan(
      CONFIG,
      slots,
      [{ slot: "bottom", path: "women > bottom", price_max: 90, query: "", attributes: [] }],
      { ...budgetLimits, caps: new Map([["bottom", 64.99]]) }
    );
    expect(plan.ok && plan.searches[0].spec.priceMax).toBe(64.99);
  });

  it("falls back by dropping slots until the floors fit, then splitting the rest", () => {
    const plan = fallbackSlotPlan(CONFIG, slots, anchor, { ...budgetLimits, remaining: 100 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.searches.map((search) => search.slot)).toEqual(["bottom"]);
    expect(plan.searches[0].spec.priceMax).toBe(100);
    expect(plan.searches[0].query).toContain("white tones");
    expect(plan.skipped).toEqual(["footwear"]);
  });

  it("fails honestly when no floor fits", () => {
    const plan = fallbackSlotPlan(CONFIG, slots, anchor, { ...budgetLimits, remaining: 10 });
    expect(plan.ok).toBe(false);
  });
});

describe("validateLookPlan", () => {
  const slots = slotsInPlay(CONFIG, "women", "top");
  const limits: PlanLimits = { remaining: 150, fallbackCeilings: new Map(), excludeIds: [] };
  const look = (theme: string, bottom: number) => ({
    theme,
    slots: [
      { slot: "bottom", path: "women > bottom", price_max: bottom, query: "navy chino", attributes: [] },
      { slot: "footwear", path: "women > footwear", price_max: 80, query: "white trainer", attributes: [] },
    ],
  });

  it("keeps every valid look, each checked against the budget on its own", () => {
    const plan = validateLookPlan(CONFIG, slots, [look(" Smart casual ", 60), look("Weekend", 70)], limits);
    expect(plan.ok && plan.directions.map((direction) => direction.theme)).toEqual(["Smart casual", "Weekend"]);
    expect(plan.ok && plan.directions[0].searches.map((search) => search.slot)).toEqual(["bottom", "footwear"]);
  });

  it("drops a broken look but runs the rest, and caps the count", () => {
    const plan = validateLookPlan(CONFIG, slots, [look("Over", 90), look("Fine", 60)], limits);
    expect(plan.ok && plan.directions.map((direction) => direction.theme)).toEqual(["Fine"]);
    const many = Array.from({ length: 7 }, (_, index) => look(`L${index}`, 60));
    const five = validateLookPlan(CONFIG, slots, many, limits);
    expect(five.ok && five.directions).toHaveLength(5);
    const one = validateLookPlan(CONFIG, slots, many, limits, 1);
    expect(one.ok && one.directions).toHaveLength(1);
  });

  it("fails with numbered problems when no look survives", () => {
    const plan = validateLookPlan(CONFIG, slots, [look("Over", 90)], limits);
    expect(plan.ok === false && plan.problems[0]).toMatch(/^look 1: /);
    expect(validateLookPlan(CONFIG, slots, [], limits)).toEqual({ ok: false, problems: ["no look planned"] });
  });
});

describe("budgetSuggestions", () => {
  it("spans from just above the cheapest full outfit to past a typical one, in round steps", () => {
    const slots = [
      { floor: 40, typical: 70 },
      { floor: 80, typical: 100 },
    ];
    expect(budgetSuggestions(25, slots)).toEqual([170, 180, 200, 300]);
    expect(budgetSuggestions(25, [])).toEqual([]);
  });

  it("never suggests a budget the anchor alone uses up, nor the same amount twice", () => {
    expect(budgetSuggestions(95, [{ floor: null, typical: null }])).toEqual([120, 150]);
  });
});

describe("renderComposeTurn", () => {
  const trouser = candidate({ externalId: "t1", title: "Navy Chino", price: 60 });

  it("shows a swap what it replaces, apart from the candidates", () => {
    const shoe = candidate({ externalId: "old-shoe", title: "Lace-Up Shoe", price: 43 });
    const text = renderComposeTurn({ anchor, kept: [], budget: 250, directions: [], request: "cheaper shoes", replacing: [shoe] });
    expect(text).toMatch(/## REPLACING[^\n]*\n.*Lace-Up Shoe/);
    expect(renderComposeTurn({ anchor, kept: [], budget: 250, directions: [] })).not.toContain("REPLACING");
  });

  it("groups candidates by numbered look, then slot", () => {
    const text = renderComposeTurn({
      anchor,
      kept: [],
      budget: null,
      sized: true,
      directions: [
        { theme: "Smart casual", slots: [{ slot: "bottom", ceiling: 70, candidates: [trouser] }] },
        { theme: "Weekend", slots: [{ slot: "bottom", ceiling: 70, candidates: [] }] },
      ],
    });
    expect(text).toMatch(/### look 1 — Smart casual\n\n#### slot: bottom \(ceiling 70\)\n.*Navy Chino/);
    expect(text).toMatch(/### look 2 — Weekend\n\n#### slot: bottom \(ceiling 70\)\n\(nothing in stock under this ceiling in the shopper's size\)/);
  });
});

describe("renderPlanTurn", () => {
  it("says how many looks to plan", () => {
    const base = { anchor, department: "women", budget: { kind: "budget" as const, budget: 200, committed: 25 }, slotsText: "" };
    expect(renderPlanTurn({ ...base, looks: 5 })).toContain("## LOOKS TO PLAN\nup to 5");
    expect(renderPlanTurn({ ...base, looks: 1 })).toContain("## LOOKS TO PLAN\nexactly 1");
  });
});

describe("verifyLook", () => {
  const trouser = candidate({ externalId: "t1", price: 60, categoryPaths: [["persona", "women", "bottom", "trouser"]] });
  const unisex = candidate({ externalId: "t2", price: 50, categoryPaths: [["persona", "unisex", "bottom", "trouser"]] });
  const mens = candidate({ externalId: "t3", price: 30, categoryPaths: [["persona", "men", "bottom", "trouser"]] });
  const sneaker = candidate({ externalId: "s1", price: 80, categoryPaths: [["persona", "women", "footwear", "sneaker"]] });
  const slots: SlotCandidates[] = [
    { slot: "bottom", ceiling: 70, candidates: [trouser, unisex, mens] },
    { slot: "footwear", ceiling: 90, candidates: [sneaker] },
  ];
  const rules: LookRules = { fixed: [anchor], budget: 200, department: "women", hardRules: [] };

  it("accepts one in-budget piece per slot, in slot order", () => {
    const look = verifyLook({ item_ids: ["s1", "t2"], reason: " crisp " }, slots, rules);
    expect(look?.picks.map((pick) => pick.item.externalId)).toEqual(["t2", "s1"]);
    expect(look?.reason).toBe("crisp");
  });

  it("drops looks with invented ids, two pieces in a slot, or a missing slot", () => {
    const reasons: string[] = [];
    expect(verifyLook({ item_ids: ["nope", "s1"], reason: "" }, slots, rules, (reason) => reasons.push(reason))).toBeNull();
    expect(reasons).toEqual(["unknown id nope"]);
    expect(verifyLook({ item_ids: ["t1", "t2", "s1"], reason: "" }, slots, rules)).toBeNull();
    expect(verifyLook({ item_ids: ["t1"], reason: "" }, slots, rules)).toBeNull();
  });

  it("drops looks across departments, over a ceiling, or over budget", () => {
    expect(verifyLook({ item_ids: ["t3", "s1"], reason: "" }, slots, rules)).toBeNull();
    expect(
      verifyLook({ item_ids: ["t1", "s1"], reason: "" }, [{ ...slots[0], ceiling: 55 }, slots[1]], rules)
    ).toBeNull();
    expect(verifyLook({ item_ids: ["t1", "s1"], reason: "" }, slots, { ...rules, budget: 150 })).toBeNull();
  });

  it("enforces merchant hard rules", () => {
    const hardRules = [{ type: "max_price_spread" as const, amount: 40 }];
    expect(verifyLook({ item_ids: ["t1", "s1"], reason: "" }, slots, { ...rules, hardRules })).toBeNull();
  });

  it("ignores repeated fixed pieces", () => {
    expect(verifyLook({ item_ids: ["w-tee-1", "t1", "s1"], reason: "" }, slots, rules)).not.toBeNull();
  });

  it("dedupes identical looks and computes totals", () => {
    const a = verifyLook({ item_ids: ["t1", "s1"], reason: "" }, slots, rules)!;
    const b = verifyLook({ item_ids: ["s1", "t1"], reason: "other" }, slots, rules)!;
    expect(distinctLooks([a, b])).toHaveLength(1);
    expect(lookTotal([anchor, trouser, sneaker])).toBe(165);
  });

  it("builds a naive look, falling back to the cheapest pieces", () => {
    expect(naiveLook(slots, rules)?.picks.map((pick) => pick.item.externalId)).toEqual(["t1", "s1"]);
    const womenOnly: SlotCandidates[] = [{ ...slots[0], candidates: [trouser, unisex] }, slots[1]];
    expect(naiveLook(womenOnly, { ...rules, budget: 160 })?.picks.map((pick) => pick.item.externalId)).toEqual(["t2", "s1"]);
    expect(naiveLook(womenOnly, { ...rules, budget: 100 })).toBeNull();
  });
});
