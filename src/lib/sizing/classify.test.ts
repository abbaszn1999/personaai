import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreConnectionRow } from "@/lib/db/store-connections";

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  listSizingCoverage: vi.fn(),
  setBrandType: vi.fn(async () => true),
}));

vi.mock("@/lib/ai/gemini", () => ({
  getPlatformGeminiClient: () => ({ models: { generateContent: mocks.generateContent } }),
  GeminiApiError: class extends Error {},
}));
vi.mock("@/lib/db/sizing-coverage", () => ({
  listSizingCoverage: mocks.listSizingCoverage,
  setBrandType: mocks.setBrandType,
}));

const { parseClassification, runBrandClassification } = await import("./classify");

const connection = {
  id: "connection-1",
  storeName: "Example Store",
  storeUrl: "https://example.test",
} as StoreConnectionRow;

function coverage(brandKey: string, brandName: string | null) {
  return { brandKey, brandName, brandType: "unclassified" };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setBrandType.mockResolvedValue(true);
});

describe("runBrandClassification", () => {
  it("sends every distinct named brand in one request and applies both returned arrays", async () => {
    mocks.listSizingCoverage.mockResolvedValue([
      coverage("nike", "Nike"),
      coverage("nike", "Nike"), // same brand in a second sizing category
      coverage("adidas", "Adidas"),
      coverage("local", "Local Streetwear Co"),
      coverage("", null),
    ]);
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({
        global_brands: ["Nike", "Adidas"],
        private_brands: ["Local Streetwear Co"],
      }),
    });

    const result = await runBrandClassification(connection);

    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    const prompt = mocks.generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(prompt.match(/- Nike/g)).toHaveLength(1);
    expect(prompt).toContain("- Adidas");
    expect(prompt).toContain("- Local Streetwear Co");
    expect(prompt).not.toContain("null");

    expect(mocks.setBrandType).toHaveBeenCalledWith("connection-1", "", "none", null);
    expect(mocks.setBrandType).toHaveBeenCalledWith("connection-1", "nike", "global", "Nike");
    expect(mocks.setBrandType).toHaveBeenCalledWith("connection-1", "adidas", "global", "Adidas");
    expect(mocks.setBrandType).toHaveBeenCalledWith(
      "connection-1",
      "local",
      "private",
      null
    );
    expect(result).toEqual({ classified: 3, global: 2, private: 1, none: 1 });
  });

  it("does not call Gemini when every sized product has a null brand", async () => {
    mocks.listSizingCoverage.mockResolvedValue([coverage("", null)]);

    const result = await runBrandClassification(connection);

    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(result).toEqual({ classified: 0, global: 0, private: 0, none: 1 });
  });

  it("does not reclassify brands whose verdict was already persisted", async () => {
    mocks.listSizingCoverage.mockResolvedValue([
      { ...coverage("nike", "Nike"), brandType: "global" },
      { ...coverage("local", "Local Label"), brandType: "private" },
    ]);

    const result = await runBrandClassification(connection);

    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(mocks.setBrandType).not.toHaveBeenCalled();
    expect(result).toEqual({ classified: 0, global: 0, private: 0, none: 0 });
  });

  it("fails the run instead of publishing a partial classification", async () => {
    mocks.listSizingCoverage.mockResolvedValue([
      coverage("nike", "Nike"),
      coverage("adidas", "Adidas"),
    ]);
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({ global_brands: ["Nike"], private_brands: [] }),
    });

    await expect(runBrandClassification(connection)).rejects.toThrow(
      "Brand classification omitted or duplicated 1 of 2 brand(s)."
    );
    expect(mocks.setBrandType).not.toHaveBeenCalled();
  });

  it("fails instead of advancing when a classification cannot be persisted", async () => {
    mocks.listSizingCoverage.mockResolvedValue([coverage("local", "Local Label")]);
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({ global_brands: [], private_brands: ["Local Label"] }),
    });
    mocks.setBrandType.mockResolvedValue(false);

    await expect(runBrandClassification(connection)).rejects.toThrow(
      "Could not save classifications for 1 brand(s): Local Label."
    );
  });
});

describe("parseClassification", () => {
  const names = ["Nike", "Adidas", "Local Streetwear Co"];

  it("maps the two arrays back to catalog order", () => {
    expect(
      parseClassification(
        JSON.stringify({
          global_brands: ["Adidas", "Nike"],
          private_brands: ["Local Streetwear Co"],
        }),
        names
      )
    ).toEqual([
      { brandType: "global" },
      { brandType: "global" },
      { brandType: "private" },
    ]);
  });

  it("matches harmless casing and whitespace changes but keeps the store's exact name", () => {
    expect(
      parseClassification(
        JSON.stringify({ global_brands: ["  nike  "], private_brands: [] }),
        ["Nike"]
      )
    ).toEqual([{ brandType: "global" }]);
  });

  it("leaves a brand unanswered when it is missing from both arrays", () => {
    expect(
      parseClassification(
        JSON.stringify({ global_brands: ["Nike"], private_brands: [] }),
        ["Nike", "Adidas"]
      )
    ).toEqual([{ brandType: "global" }, null]);
  });

  it("rejects a brand placed in both arrays instead of choosing one silently", () => {
    expect(
      parseClassification(
        JSON.stringify({ global_brands: ["Nike"], private_brands: ["Nike"] }),
        ["Nike"]
      )
    ).toEqual([null]);
  });

  it("rejects a brand repeated within one array", () => {
    expect(
      parseClassification(
        JSON.stringify({ global_brands: ["Nike", "Nike"], private_brands: [] }),
        ["Nike"]
      )
    ).toEqual([null]);
  });

  it("returns no verdicts for malformed output", () => {
    expect(parseClassification("not json", names)).toEqual([null, null, null]);
    expect(parseClassification(JSON.stringify({ brands: [] }), names)).toEqual([null, null, null]);
  });
});
