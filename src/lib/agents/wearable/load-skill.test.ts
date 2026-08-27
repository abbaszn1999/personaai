import { describe, expect, it } from "vitest";
import { parseSkill, renderSkill } from "./load-skill";

describe("parseSkill", () => {
  it("reads the frontmatter and trims the body", () => {
    const doc = parseSkill(`---
name: filter
description: One line.
inputs: []
---

You build database filters.
`);

    expect(doc.name).toBe("filter");
    expect(doc.description).toBe("One line.");
    expect(doc.inputs).toEqual([]);
    expect(doc.body).toBe("You build database filters.");
  });

  /**
   * The router's mode list is assembled from these descriptions and asserted verbatim in
   * `registry.test.ts`, including the two-space indent on continuation lines. A folded scalar
   * (`>`) would silently join those lines with spaces and change the prompt, so the files use
   * literal blocks (`|-`). This is the test that catches it if one ever gets switched.
   */
  it("preserves newlines and continuation indents in a literal block description", () => {
    const doc = parseSkill(`---
name: cosine
description: |-
  cosine — anything with descriptive, subjective or functional intent. "a t-shirt for
    swimming", "something my dad would wear to a BBQ", "comfy red tee".
inputs: []
---
`);

    expect(doc.description).toBe(
      `cosine — anything with descriptive, subjective or functional intent. "a t-shirt for
  swimming", "something my dad would wear to a BBQ", "comfy red tee".`
    );
  });

  it("keeps interior blank lines in the body", () => {
    const doc = parseSkill(`---
name: guardrails
description: x
---

First paragraph.

Second paragraph.
`);

    expect(doc.body).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("returns an empty body for a description-only skill", () => {
    const doc = parseSkill(`---
name: attribute-variant
description: x
inputs: []
---
`);

    expect(doc.body).toBe("");
  });

  it("survives missing or wrongly-typed frontmatter rather than throwing", () => {
    // A malformed skill should fail the validation test loudly, not crash a live chat turn.
    const doc = parseSkill(`---
inputs: "not a list"
---
Body.
`);

    expect(doc.name).toBe("");
    expect(doc.description).toBe("");
    expect(doc.inputs).toEqual([]);
    expect(doc.body).toBe("Body.");
  });
});

describe("renderSkill", () => {
  it("substitutes every occurrence of a placeholder", () => {
    expect(renderSkill("Build {{n}} outfits, {{n}} distinct.", { n: "5" })).toBe("Build 5 outfits, 5 distinct.");
  });

  it("drops a line that is nothing but a placeholder resolving to empty", () => {
    // Reproduces the bundle prompt's `.filter(Boolean)`: the anchor and style-guide lines are
    // absent entirely when they don't apply, not left as blanks.
    expect(renderSkill("Before\n{{anchorLabel}}\nAfter", { anchorLabel: "" })).toBe("Before\nAfter");
  });

  it("keeps that line when the placeholder has a value", () => {
    expect(renderSkill("Before\n{{anchorLabel}}\nAfter", { anchorLabel: "Anchored." })).toBe("Before\nAnchored.\nAfter");
  });

  it("treats a missing key the same as an empty one", () => {
    expect(renderSkill("Before\n{{styleGuide}}\nAfter", {})).toBe("Before\nAfter");
  });

  it("keeps a line that has other text alongside an empty placeholder", () => {
    expect(renderSkill(`The shopper asked: "{{query}}"`, { query: "" })).toBe(`The shopper asked: ""`);
  });

  it("leaves genuine blank lines alone", () => {
    // Every prompt except the bundle one separates paragraphs this way.
    expect(renderSkill("First.\n\nSecond.", {})).toBe("First.\n\nSecond.");
  });
});
