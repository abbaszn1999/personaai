import { describe, expect, it } from "vitest";
import { parsePersonaAutoMatch, type PersonaMatchTarget, type PersonaPathCandidate } from "./classify-persona-paths";

const candidates: PersonaPathCandidate[] = [
  { id: "tees", path: "Women / Tees", productCount: 10, sampleTitles: ["Boxy cotton tee"] },
  { id: "furniture", path: "Home / Furniture", productCount: 2, sampleTitles: ["Oak chair"] },
  { id: "unclear", path: "Sale", productCount: 30, sampleTitles: [] },
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

    expect(verdicts).toHaveLength(3);
    expect(verdicts.every((verdict) => verdict.mapping === null)).toBe(true);
    expect(verdicts[0].confidence).toBe(1);
  });
});
