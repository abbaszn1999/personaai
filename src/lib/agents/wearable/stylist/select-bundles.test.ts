import { afterEach, describe, expect, it, vi } from "vitest";
import * as gemini from "@/lib/ai/gemini";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import { buildVisionPrompt, selectBundles, type SelectBundlesInput } from "./select-bundles";

function candidate(id: string, overrides: Partial<CatalogCandidate> = {}): CatalogCandidate {
  return {
    externalId: id,
    title: `Item ${id}`,
    brand: "Acme",
    price: 20,
    imageUrl: `https://example.test/${id}.jpg`,
    ...overrides,
  } as CatalogCandidate;
}

function input(overrides: Partial<SelectBundlesInput> = {}): SelectBundlesInput {
  return {
    query: "something for a BBQ",
    styleGuide: null,
    apiKey: "test-key",
    anchor: null,
    pools: [
      { category: "tops", candidates: [candidate("t1"), candidate("t2")] },
      { category: "bottoms", candidates: [candidate("b1")] },
    ],
    ...overrides,
  };
}

/** Stands in for the vision call, returning whatever labels the test wants back. */
function mockVision(bundles: Array<{ items: string[]; rationale: string }>) {
  vi.spyOn(gemini, "encodeImageForVision").mockResolvedValue({ data: "AAA", mimeType: "image/jpeg" });
  const generateContent = vi.fn().mockResolvedValue({ text: JSON.stringify({ bundles }) });
  vi.spyOn(gemini, "getGeminiClient").mockReturnValue({ models: { generateContent } } as never);
  return generateContent;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildVisionPrompt", () => {
  it("labels every candidate by category and index", () => {
    const prompt = buildVisionPrompt(input());

    expect(prompt).toContain("[tops-0] Item t1 — Acme — 20");
    expect(prompt).toContain("[tops-1] Item t2 — Acme — 20");
    expect(prompt).toContain("[bottoms-0] Item b1 — Acme — 20");
  });

  it("omits the anchor and style-guide lines entirely when neither applies", () => {
    // Absent, not blank. The prompt this replaced used `.filter(Boolean)`, so collapsing those
    // two lines away is what keeps the wording identical to before the markdown move. The only
    // blank lines left are the ones the catalogue puts between its own category blocks.
    const lines = buildVisionPrompt(input()).split("\n");

    expect(lines[0]).toBe(`The shopper asked: "something for a BBQ"`);
    expect(lines[1]).toBe("Candidates, one image each, in the order the images appear after this text:");
  });

  it("includes both optional lines when they apply", () => {
    const prompt = buildVisionPrompt(input({ anchor: candidate("a1"), styleGuide: "muted, coastal" }));

    expect(prompt).toContain(`Already chosen and fixed — every outfit must be built around it: "Item a1". Its image is first.`);
    expect(prompt).toContain("The store's aesthetic, which should lean your choices: muted, coastal");
  });

  it("asks for the configured number of outfits", () => {
    expect(buildVisionPrompt(input())).toContain("Build 5 DISTINCT complete outfits.");
  });
});

describe("selectBundles", () => {
  it("resolves the model's labels back to candidates", async () => {
    mockVision([{ items: ["tops-0", "bottoms-0"], rationale: "Works together." }]);

    const [bundle] = await selectBundles(input());

    expect(bundle.items.map((item) => item.externalId)).toEqual(["t1", "b1"]);
    expect(bundle.rationale).toBe("Works together.");
  });

  it("puts the anchor first in every bundle", async () => {
    mockVision([{ items: ["tops-0", "bottoms-0"], rationale: "x" }]);

    const [bundle] = await selectBundles(input({ anchor: candidate("a1") }));

    expect(bundle.items.map((item) => item.externalId)).toEqual(["a1", "t1", "b1"]);
  });

  it("drops a bundle that is missing a category", async () => {
    // A hallucinated or dropped label makes an incomplete outfit, which would read as the agent
    // forgetting a category rather than choosing a smaller set.
    mockVision([
      { items: ["tops-0"], rationale: "incomplete" },
      { items: ["tops-1", "bottoms-0"], rationale: "complete" },
    ]);

    const bundles = await selectBundles(input());

    expect(bundles).toHaveLength(1);
    expect(bundles[0].rationale).toBe("complete");
  });

  it("ignores labels that match no candidate", async () => {
    mockVision([{ items: ["tops-0", "bottoms-0", "hats-9"], rationale: "x" }]);

    const [bundle] = await selectBundles(input());

    expect(bundle.items.map((item) => item.externalId)).toEqual(["t1", "b1"]);
  });

  it("applies no merchant rules of its own", async () => {
    // Hard rules are the caller's to enforce (see persona's assembleBundles). If that ever moved
    // in here, a rule change would start looking like a styling regression.
    mockVision([{ items: ["tops-0", "bottoms-0"], rationale: "x" }]);

    await expect(selectBundles(input())).resolves.toHaveLength(1);
  });

  it("returns nothing rather than throwing when the vision call fails", async () => {
    vi.spyOn(gemini, "encodeImageForVision").mockResolvedValue({ data: "AAA", mimeType: "image/jpeg" });
    vi.spyOn(gemini, "getGeminiClient").mockReturnValue({
      models: { generateContent: vi.fn().mockRejectedValue(new Error("boom")) },
    } as never);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(selectBundles(input())).resolves.toEqual([]);
  });

  it("sends the anchor image ahead of the candidate images", async () => {
    const generateContent = mockVision([{ items: ["tops-0", "bottoms-0"], rationale: "x" }]);

    await selectBundles(input({ anchor: candidate("a1") }));

    // The prompt tells the model the anchor's image is first, so the ordering is load-bearing.
    const parts = generateContent.mock.calls[0][0].contents[0].parts;
    expect(parts[0].text).toContain("Its image is first.");
    expect(parts.filter((part: { inlineData?: unknown }) => part.inlineData)).toHaveLength(4);
  });
});
