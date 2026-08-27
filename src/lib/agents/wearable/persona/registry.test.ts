import { describe, expect, it } from "vitest";
import { RETRIEVAL_MODES } from "@/lib/retrieval/types";
import { describeSkillsForRouter, DIRECT_SKILLS, PERSONA_SKILLS } from "./registry";

describe("the skill registry", () => {
  it("keys every skill by its own mode", () => {
    // A mismatch here means the router would describe one mode and dispatch to another.
    for (const mode of RETRIEVAL_MODES) {
      expect(PERSONA_SKILLS[mode].mode).toBe(mode);
    }
  });

  it("gives every mode a home: a runner, or the engine's own dispatch", () => {
    // The engine handles ask_info and bundle itself and looks up everything else. A mode in
    // neither set would route successfully and then do nothing.
    const engineHandled = ["ask_info", "bundle"];

    for (const mode of RETRIEVAL_MODES) {
      const hasRunner = Object.hasOwn(DIRECT_SKILLS, mode);
      expect(hasRunner || engineHandled.includes(mode)).toBe(true);
      expect(hasRunner && engineHandled.includes(mode)).toBe(false);
    }
  });

  /**
   * The router's mode list is assembled from the skill folders rather than written out in its
   * prompt, which is what makes retuning a mode a one-folder change. The cost of that
   * indirection is that a skill dropping out of the list, or its description drifting, is
   * invisible — the router just quietly stops choosing it. This asserts the exact text.
   */
  it("assembles the router's mode list in enum order", () => {
    expect(describeSkillsForRouter()).toBe(
      `- ask_info — you cannot act yet. Use ONLY when one of these is true: no category is stated or
  implied anywhere in the conversation; a constraint the request depends on is missing; or the
  request is too broad to scope at all ("get me something nice"). Never use it as a hedge, and
  never use it for a request naming several coordinated pieces or an outfit/bundle/look/set as
  a whole ("build me a full outfit", "put together a bundle") even with no specific item named
  yet — that is bundle, which asks its own budget/category questions and carries the answer
  forward; an ask_info question here is a dead end that remembers nothing.
- filter — every stated constraint maps to a real column: category, subcategory, garment type,
  brand, price, stock. "Adidas t-shirts under $50" qualifies. Nothing is left to rank.
- cosine — anything with descriptive, subjective or functional intent. "a t-shirt for
  swimming", "something my dad would wear to a BBQ", "comfy red tee".
- bundle — the shopper wants several coordinated items that go together, building a new outfit
  from scratch. Route here even for a bare "a full outfit"/"a bundle"/"a look"/"a set" with
  nothing specific named yet — do not defer to ask_info for being too broad; bundle owns its
  own budget/category intake questions. A follow-up scoped to one item of a bundle already
  shown (e.g. "different pants", "something cheaper for the shoes") is cosine, not bundle.
- attribute_variant — the shopper explicitly asks whether an item ALREADY selected or shown
  comes in a different option ("does that come in navy", "other sizes"). Only ever returns
  verified alternatives (the same product's own recorded colourways/sizes) — never a
  different, merely-similar item standing in for one. Not for general facts about the
  current item (material, fit, what it looks like); those are answered from context, not a
  tool call at all — see tool-policy.md.`
    );
  });
});
