import { describe, expect, it } from "vitest";
import { buildPathConfig } from "@/lib/catalog/path-config/build";
import { findNode } from "@/lib/catalog/path-config/lookup";
import { CONFIG, acsProduct, candidate } from "../__fixtures__/catalog";
import { distinctLooks, lookTotal, naiveLook, verifyLook, type LookRules, type SlotCandidates } from "./compose";
import { bundleLanguage, bundleMessages } from "./messages";
import { CEILING_SLACK, fallbackSlotPlan, validateLookPlan, validateSlotPlan, type PlanLimits } from "./plan";
import { composePrefix, followUpPrefix, planPrefix, renderComposeTurn, renderFollowUpTurn, renderPlanTurn, renderStore } from "./prompt";
import { renderAnchorRead } from "./schema";
import type { AgentContext, LookRecord } from "../types";
import {
  fallbackCeilings,
  isOutfitLeaf,
  outfitPaths,
  pathBelongsToSlot,
  premiumFloors,
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

  it("completes shoes with a top and a bottom, and a kids' piece from its unisex twin too", () => {
    expect(slotsInPlay(CONFIG, "women", "footwear").map((slot) => slot.slot)).toEqual(["top", "bottom"]);
    const kids = buildPathConfig([
      acsProduct("k-tee", "kids-girls > top > t-shirt", 10),
      acsProduct("k-jean", "kids-girls > bottom > jean", 20),
      acsProduct("ku-jean", "kids-unisex > bottom > jean", 18),
    ]);
    const [bottom] = slotsInPlay(kids, "kids-girls", "top");
    expect(bottom.node.path).toBe("kids-girls > bottom");
    expect(bottom.twin?.path).toBe("kids-unisex > bottom");
    expect(bottom.floor).toBe(18);
  });
});

describe("premium company", () => {
  const rich = buildPathConfig([
    ...[10, 15, 20, 25, 30, 35].map((price, index) => acsProduct(`tee-${index}`, "women > top > t-shirt", price)),
    ...[20, 30, 40, 50, 60, 70].map((price, index) => acsProduct(`trouser-${index}`, "women > bottom > trouser", price)),
  ]);
  const slots = slotsInPlay(rich, "women", "top");
  const teeTiers = findNode(rich, "women > top > t-shirt")!.tiers;

  it("gives a tier C anchor a floor at the middle of each slot's range", () => {
    const floors = premiumFloors(tierOf(teeTiers, 35), slots);
    expect(floors.get("bottom")).toBe(findNode(rich, "women > bottom")!.tiers.find((tier) => tier.label === "B")!.min);
  });

  it("leaves every other anchor unconstrained", () => {
    expect(premiumFloors(tierOf(teeTiers, 20), slots).size).toBe(0);
    expect(premiumFloors(null, slots).size).toBe(0);
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

  it("lets each search reach above its share, never past what the other slots' cheapest pieces leave", () => {
    const plan = validateSlotPlan(
      CONFIG,
      slots,
      [
        { slot: "bottom", path: "women > bottom", price_max: 60, query: "", attributes: [] },
        { slot: "footwear", path: "women > footwear", price_max: 80, query: "", attributes: [] },
      ],
      budgetLimits
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const [bottom, footwear] = plan.searches.map((search) => search.spec.priceMax);
    // bottom: 60 × 1.3 = 78, but the cheapest shoes (80) must still fit in 150 → 70.
    expect(bottom).toBe(70);
    // footwear: 80 × 1.3 = 104, under 150 − the cheapest bottom (40).
    expect(footwear).toBe(Math.floor(80 * (1 + CEILING_SLACK)));
  });

  it("keeps the shares as written when there is no budget", () => {
    const plan = validateSlotPlan(
      CONFIG,
      slots,
      [{ slot: "bottom", path: "women > bottom", price_max: 60, query: "", attributes: [] }],
      { ...budgetLimits, remaining: null }
    );
    expect(plan.ok && plan.searches[0].spec.priceMax).toBe(60);
  });

  it("prices a no-budget leaf search against that leaf's own tier, not the whole category's", () => {
    const own = findNode(CONFIG, "women > bottom > trouser")!.tiers.find((tier) => tier.label === "A")!.max;
    const plan = validateSlotPlan(
      CONFIG,
      slots,
      [{ slot: "bottom", path: "women > bottom > trouser", price_max: null, query: "", attributes: [] }],
      { remaining: null, fallbackCeilings: new Map([["bottom", 999]]), excludeIds: [], anchorTier: "A" }
    );
    expect(plan.ok && plan.searches[0].spec.priceMax).toBe(own);
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
  const base = { anchor, department: "women", budget: { kind: "budget" as const, budget: 200, committed: 25 }, slotsText: "" };

  it("says how many looks to plan", () => {
    expect(renderPlanTurn({ ...base, looks: 5 })).toContain("## LOOKS TO PLAN\nup to 5");
    expect(renderPlanTurn({ ...base, looks: 1 })).toContain("## LOOKS TO PLAN\nexactly 1");
  });

  it("carries the store's language, the anchor's price position, the reply language and the merchant's notes", () => {
    const text = renderPlanTurn({
      ...base,
      looks: 3,
      store: renderStore({ ...CONFIG, currency: "AED", catalogLanguage: "Arabic" }),
      anchorTier: { path: "women > top > t-shirt", tier: { label: "C", min: 40, max: 90, count: 5 } },
      language: "Modern Standard Arabic",
      request: "عشاء في المساء",
      styleGuide: "Modest cuts only.",
    });
    expect(text).toContain("## STORE\ncurrency: AED\ncatalog language: Arabic — product titles are written in it, so every query is too");
    expect(text).toContain("price position: tier C of women > top > t-shirt (40–90) — the top third of its range");
    expect(text).toContain("## REPLY LANGUAGE\nModern Standard Arabic");
    expect(text).toContain("## SHOPPER REQUEST\nعشاء في المساء");
    expect(text).toContain("## STORE STYLE NOTES (from the merchant — lean on them, never break the doctrine)\nModest cuts only.");
  });

  it("says plainly when no budget was named", () => {
    const text = renderPlanTurn({ ...base, looks: 3, budget: { kind: "fallback", tier: "B", ceilings: new Map([["bottom", 50]]) } });
    expect(text).toContain("## BUDGET\nnone — the shopper named no budget. Every piece stays in the anchor's tier B of the path you search: on a whole category that is bottom ≤ 50;");
  });

  it("falls back to the title words' language when the catalog's is not recorded", () => {
    expect(renderStore({ ...CONFIG, catalogLanguage: null })).toContain("catalog language: not recorded");
  });
});

describe("renderComposeTurn budget line", () => {
  it("asks for the no-budget invitation only once", () => {
    expect(renderComposeTurn({ anchor, kept: [], budget: null, directions: [], mentionBudget: true })).toContain("Mention it once");
    expect(renderComposeTurn({ anchor, kept: [], budget: null, directions: [] })).toContain("do not mention budgets");
  });

  it("tells compose the ceilings overlap and the total is what counts", () => {
    const text = renderComposeTurn({ anchor, kept: [], budget: 200, directions: [], language: "French" });
    expect(text).toContain("may cost up to 175. Slot ceilings overlap");
    expect(text).toContain("## REPLY LANGUAGE\nFrench");
  });
});

describe("the stylist", () => {
  const slots = slotsInPlay(CONFIG, "women", "top");
  const limits: PlanLimits = { remaining: null, fallbackCeilings: new Map(), excludeIds: [] };

  it("is part of every stage that chooses or judges pieces", () => {
    for (const prefix of [planPrefix(), composePrefix(), followUpPrefix()]) {
      expect(prefix).toContain("# STYLIST — THE CRAFT");
      expect(prefix).toContain("## Colour pairing");
    }
  });

  it("turns a slot's preferred colours into the store's spelling, unless a colour is already required", () => {
    const plan = validateSlotPlan(
      CONFIG,
      slots,
      [{ slot: "bottom", path: "women > bottom", price_max: null, query: "navy trouser", attributes: [], prefer_colors: ["navy", "Teal"] }],
      limits
    );
    expect(plan.ok && plan.searches[0].preferColours).toMatchObject({ field: "colors", values: ["Navy"] });

    const required = validateSlotPlan(
      CONFIG,
      slots,
      [{ slot: "bottom", path: "women > bottom", price_max: null, query: "trouser", attributes: [{ key: "color", values: ["Black"] }], prefer_colors: ["Navy"] }],
      limits
    );
    expect(required.ok && required.searches[0].preferColours).toBeUndefined();
  });

  it("keeps each planned look's palette", () => {
    const plan = validateLookPlan(
      CONFIG,
      slots,
      [{ theme: "Weekend", palette: " white, navy, tan accent ", slots: [{ slot: "bottom", path: "women > bottom", price_max: 70, query: "navy chino", attributes: [] }] }],
      limits
    );
    expect(plan.ok && plan.directions[0].palette).toBe("white, navy, tan accent");
  });

  it("renders the anchor read as one line, and nothing when it is empty", () => {
    expect(
      renderAnchorRead({ colour: "navy", family: "dark neutral", undertone: "cool", formality: 2, season: "summer", silhouette: "regular", material: "cotton piqué", statement: false })
    ).toBe("colour: navy (dark neutral, cool) · formality 2 · season: summer · silhouette: regular · material: cotton piqué · not a statement piece");
    expect(renderAnchorRead(null)).toBeNull();
    expect(renderAnchorRead({ colour: " ", family: "", undertone: "", formality: 0, season: "", silhouette: "", material: "", statement: false })).toBeNull();
  });

  it("gives compose the anchor read and every look's palette", () => {
    const text = renderComposeTurn({
      anchor,
      anchorRead: "colour: white (light neutral, cool) · formality 2",
      kept: [],
      budget: null,
      directions: [{ theme: "Weekend", palette: "white, navy, tan accent", slots: [] }],
    });
    expect(text).toContain("## ANCHOR READ\ncolour: white (light neutral, cool) · formality 2");
    expect(text).toContain("### look 1 — Weekend · palette: white, navy, tan accent");
  });

  it("shows a follow-up the look's palette, so a swap keeps to it", () => {
    const look: LookRecord = {
      id: "l",
      label: "Weekend",
      productIds: ["w-tee-1"],
      items: [],
      anchorId: "w-tee-1",
      total: 25,
      budget: null,
      department: "women",
      slots: [],
      palette: "white, navy, tan accent",
      anchorRead: "colour: white",
    };
    const text = renderFollowUpTurn({
      ctx: { history: [], styleGuide: null } as unknown as AgentContext,
      message: "cheaper shoes",
      look,
      pieces: [anchor],
      budget: null,
      slotsText: "",
    });
    expect(text).toContain("## LOOK PALETTE\nwhite, navy, tan accent\nanchor read: colour: white");
  });
});

describe("code-written replies", () => {
  it("follow the language the model named, else the message's script", () => {
    expect(bundleLanguage("Modern Standard Arabic")).toBe("ar");
    expect(bundleLanguage("French")).toBe("fr");
    expect(bundleLanguage("English", "بدي لوك")).toBe("en");
    expect(bundleLanguage(null, "بدي لوك للشغل")).toBe("ar");
    expect(bundleLanguage(null, "Une tenue pour le bureau")).toBe("fr");
    expect(bundleLanguage(undefined, "go")).toBe("en");
  });

  it("name the missing pieces in the shopper's words", () => {
    expect(bundleMessages("en").nothingInStock(["outerwear", "footwear"], true, false)).toContain("the jacket and shoes");
    expect(bundleMessages("ar").nothingInStock(["outerwear"], false, true)).toContain("بمقاسك");
    expect(bundleMessages("fr").budgetTooSmall("USD 50")).toContain("Le budget de USD 50");
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

  it("accepts a piece the merchant lists under both departments", () => {
    const both = candidate({
      externalId: "t4",
      price: 40,
      categoryPaths: [
        ["persona", "men", "bottom", "trouser"],
        ["persona", "women", "bottom", "trouser"],
      ],
    });
    const withBoth: SlotCandidates[] = [{ ...slots[0], candidates: [both] }, slots[1]];
    expect(verifyLook({ item_ids: ["t4", "s1"], reason: "" }, withBoth, rules)).not.toBeNull();
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

  it("picks the best-ranked combination that fits the budget, not just the cheapest", () => {
    const piece = (id: string, price: number, leaf: string) => candidate({ externalId: id, price, categoryPaths: [["persona", "women", leaf.split(">")[0], leaf.split(">")[1]]] });
    const ranked: SlotCandidates[] = [
      { slot: "bottom", ceiling: 100, candidates: [piece("b1", 60, "bottom>trouser"), piece("b2", 50, "bottom>trouser"), piece("b3", 30, "bottom>trouser")] },
      { slot: "footwear", ceiling: 100, candidates: [piece("s1", 80, "footwear>sneaker"), piece("s2", 70, "footwear>sneaker")] },
    ];
    expect(naiveLook(ranked, { ...rules, budget: 170 })?.picks.map((pick) => pick.item.externalId)).toEqual(["b1", "s1"]);
    // 165 and 155 are over 150; the best-ranked combination that fits is b2 + s2 (145), not the cheapest (b3 + s2).
    expect(naiveLook(ranked, { ...rules, budget: 150 })?.picks.map((pick) => pick.item.externalId)).toEqual(["b2", "s2"]);
  });

  it("lets a look leave out outerwear, and only outerwear", () => {
    const jacket = candidate({ externalId: "j1", price: 50, categoryPaths: [["persona", "women", "outerwear", "jacket"]] });
    const withJacket: SlotCandidates[] = [slots[0], { slot: "outerwear", ceiling: 90, candidates: [jacket] }];
    expect(verifyLook({ item_ids: ["t1"], reason: "" }, withJacket, rules)?.picks.map((pick) => pick.slot)).toEqual(["bottom"]);
    const reasons: string[] = [];
    expect(verifyLook({ item_ids: ["j1"], reason: "" }, withJacket, rules, (reason) => reasons.push(reason))).toBeNull();
    expect(reasons[0]).toMatch(/missing bottom/);
  });
});
