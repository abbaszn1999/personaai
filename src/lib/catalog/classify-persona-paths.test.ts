import { describe, expect, it } from "vitest";
import { parsePersonaAutoMatch, type PersonaMatchTarget, type PersonaPathCandidate } from "./classify-persona-paths";

const candidates: PersonaPathCandidate[] = [
  { id: "tees", path: "Women / Tees", productCount: 10, sampleTitles: ["Boxy cotton tee"] },
  { id: "furniture", path: "Home / Furniture", productCount: 2, sampleTitles: ["Oak chair"] },
  { id: "unclear", path: "Sale", productCount: 30, sampleTitles: [] },
  { id: "huge", path: "Shoes & Bags", productCount: 2045, sampleTitles: ["Stiletto pump"] },
];
const targets: PersonaMatchTarget[] = [{
  key: "women:top:t-shirt",
  departmentId: "women",
  categoryId: "top",
  subCategory: "t-shirt",
  label: "Women > Top > T-shirt",
}];

describe("parsePersonaAutoMatch", () => {
  it("accepts allowed targets and explicit exclusions", () => {
    const verdicts = parsePersonaAutoMatch(JSON.stringify({
      verdicts: [
        { id: "tees", action: "mapped", target_key: "women:top:t-shirt", reason: "Titles are tees", confidence: 0.98 },
        { id: "furniture", action: "excluded", target_key: "", reason: "Not fashion", confidence: 1 },
        { id: "unclear", action: "unmapped", target_key: "", reason: "Insufficient evidence", confidence: 0.2 },
      ],
    }), candidates, targets);

    expect(verdicts[0].mapping).toEqual({
      status: "mapped",
      departmentId: "women",
      categoryId: "top",
      subCategory: "t-shirt",
      isAutoMatched: true,
    });
    expect(verdicts[1].mapping).toEqual(expect.objectContaining({ status: "excluded", isAutoMatched: true }));
    expect(verdicts[2].mapping).toBeNull();
  });

  it("rejects invented taxonomy keys and fills omitted inputs as unmapped", () => {
    const verdicts = parsePersonaAutoMatch(JSON.stringify({
      verdicts: [
        { id: "tees", action: "mapped", target_key: "invented:path", reason: "", confidence: 2 },
      ],
    }), candidates, targets);

    expect(verdicts).toHaveLength(candidates.length);
    expect(verdicts.every((verdict) => verdict.mapping === null)).toBe(true);
    expect(verdicts[0].confidence).toBe(1);
  });

  it("names the rejected key in the reason so a dropped mapping is not silent", () => {
    const [verdict] = parsePersonaAutoMatch(JSON.stringify({
      verdicts: [
        { id: "tees", action: "mapped", target_key: "kids-unisex:full-body:swimsuit", reason: "Kids swimwear.", confidence: 0.8 },
      ],
    }), candidates, targets);

    expect(verdict.mapping).toBeNull();
    expect(verdict.reason).toContain("kids-unisex:full-body:swimsuit");
    expect(verdict.reason).toContain("not an enabled Persona path");
  });

  it("holds a mapping on a large category back for review when confidence is short of certain", () => {
    const parsed = parsePersonaAutoMatch(JSON.stringify({
      verdicts: [
        { id: "huge", action: "mapped", target_key: "women:top:t-shirt", reason: "Dominant titles are tops.", confidence: 0.85 },
        { id: "tees", action: "mapped", target_key: "women:top:t-shirt", reason: "Titles are tees.", confidence: 0.85 },
      ],
    }), candidates, targets);

    const huge = parsed.find((verdict) => verdict.id === "huge")!;
    expect(huge.mapping).toBeNull();
    expect(huge.reason).toContain("Needs review");
    expect(huge.reason).toContain("2045 products");

    // The same confidence on a small category stays mapped — the floor is about blast radius.
    expect(parsed.find((verdict) => verdict.id === "tees")!.mapping).toMatchObject({ status: "mapped" });
  });

  it("maps a large category when the model is certain", () => {
    const verdicts = parsePersonaAutoMatch(JSON.stringify({
      verdicts: [
        { id: "huge", action: "mapped", target_key: "women:top:t-shirt", reason: "All tees.", confidence: 0.95 },
      ],
    }), candidates, targets);

    expect(verdicts.find((verdict) => verdict.id === "huge")!.mapping).toMatchObject({ status: "mapped" });
  });
});
