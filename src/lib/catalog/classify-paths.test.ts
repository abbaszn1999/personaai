import { describe, expect, it, vi } from "vitest";
import { parsePathClassification } from "./classify-paths";
import { parseGrouping } from "./group-collections";

describe("parsePathClassification", () => {
  it("reads a parent and its reason off each entry", () => {
    const text = JSON.stringify({
      paths: [
        { parent: "tops", reason: "Sample is t-shirts and blouses" },
        { parent: "footwear", reason: "Trainers and boots" },
      ],
    });

    expect(parsePathClassification(text, 2)).toEqual([
      { parent: "tops", mixed: false, reason: "Sample is t-shirts and blouses" },
      { parent: "footwear", mixed: false, reason: "Trainers and boots" },
    ]);
  });

  it("keeps a mixed verdict as a reason without a parent", () => {
    // The distinction the keyword matcher could not express, and the one that matters most on a
    // shallow taxonomy: this path cannot be mapped, rather than we could not tell.
    const text = JSON.stringify({
      paths: [{ parent: "mixed", reason: "Holds t-shirts, jeans and coats" }],
    });

    expect(parsePathClassification(text, 1)).toEqual([
      { parent: null, mixed: true, reason: "Holds t-shirts, jeans and coats" },
    ]);
  });

  it("drops an unknown verdict entirely rather than mapping it", () => {
    const text = JSON.stringify({ paths: [{ parent: "unknown", reason: "Handbags only" }] });

    expect(parsePathClassification(text, 1)).toEqual([null]);
  });

  it("refuses a parent that is not one of the five", () => {
    // A model inventing "swimwear" — a group this vocabulary retired — must not reach the map,
    // where it would be written as a sizing group nothing downstream can measure.
    const text = JSON.stringify({ paths: [{ parent: "swimwear", reason: "Bikinis" }] });

    expect(parsePathClassification(text, 1)).toEqual([null]);
  });

  it("keeps the answers it could parse when one entry is malformed", () => {
    const text = JSON.stringify({
      paths: [{ parent: "tops", reason: "Tees" }, null, { parent: "bottoms", reason: "Jeans" }],
    });

    const verdicts = parsePathClassification(text, 3);

    expect(verdicts[0]?.parent).toBe("tops");
    expect(verdicts[1]).toBeNull();
    expect(verdicts[2]?.parent).toBe("bottoms");
  });

  it("pads a short response rather than shifting later paths onto earlier answers", () => {
    // Positional matching is the whole contract, so a response covering two of three paths must
    // leave the third unanswered — never slide an answer up into it.
    const text = JSON.stringify({ paths: [{ parent: "tops", reason: "a" }] });

    expect(parsePathClassification(text, 3)).toEqual([
      { parent: "tops", mixed: false, reason: "a" },
      null,
      null,
    ]);
  });

  it("ignores entries past the number of paths asked about", () => {
    const text = JSON.stringify({
      paths: [
        { parent: "tops", reason: "a" },
        { parent: "bottoms", reason: "b" },
      ],
    });

    expect(parsePathClassification(text, 1)).toHaveLength(1);
  });

  it("returns all nulls for a response that is not JSON", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(parsePathClassification("sorry, I cannot help with that", 2)).toEqual([null, null]);
  });
});

describe("parseGrouping", () => {
  it("reads a department and sub-group off each entry", () => {
    const text = JSON.stringify({
      collections: [{ department: "Women", sub_group: "Tops" }],
    });

    expect(parseGrouping(text, 1)).toEqual([{ department: "Women", subGroup: "Tops" }]);
  });

  it("leaves a collection unplaced when the model empties both levels", () => {
    // How a promotion opts out: "Summer Sale" is not a branch of anything, so it stays in the bank.
    const text = JSON.stringify({ collections: [{ department: "", sub_group: "" }] });

    expect(parseGrouping(text, 1)).toEqual([null]);
  });

  it("drops a half-placed collection rather than inventing the missing level", () => {
    const text = JSON.stringify({ collections: [{ department: "Women", sub_group: "" }] });

    expect(parseGrouping(text, 1)).toEqual([null]);
  });

  it("trims whitespace so two spellings of a department do not split it", () => {
    const text = JSON.stringify({
      collections: [
        { department: "Women ", sub_group: "Tops" },
        { department: "Women", sub_group: "Tops " },
      ],
    });

    expect(parseGrouping(text, 2)).toEqual([
      { department: "Women", subGroup: "Tops" },
      { department: "Women", subGroup: "Tops" },
    ]);
  });

  it("returns all nulls when the response carries no collections array", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(parseGrouping(JSON.stringify({ result: "ok" }), 2)).toEqual([null, null]);
  });
});
