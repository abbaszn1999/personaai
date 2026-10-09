import { beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();
vi.mock("@/lib/ai/gemini", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/gemini")>()),
  getPlatformGeminiClient: () => ({ models: { generateContent } }),
}));

import { classifyPersonaPaths, type PersonaPathCandidate } from "./classify-persona-paths";

const scope = {
  configured: true,
  enabledDeptIds: ["women"],
  enabledLeafKeys: ["women:top:t-shirt"],
  customLeaves: [],
  customCategories: [],
};
const candidates: PersonaPathCandidate[] = ["a", "b", "c", "d"].map((id) => ({
  id,
  path: `Women / Tees ${id}`,
  productCount: 10,
  sampleTitles: ["Cotton tee"],
}));

function answerFor(prompt: string) {
  const ids = [...prompt.matchAll(/^- id=(\w+);/gm)].map((match) => match[1]);
  return {
    text: JSON.stringify({
      verdicts: ids.map((id) => ({ id, action: "mapped", target_key: "women:top:t-shirt", reason: "Tees", confidence: 0.95 })),
    }),
    candidates: [{ finishReason: "STOP" }],
  };
}

describe("classifyPersonaPaths", () => {
  beforeEach(() => {
    generateContent.mockReset();
  });

  it("asks once for the whole list", async () => {
    generateContent.mockImplementation(async ({ contents }) => answerFor(contents[0].parts[0].text));

    const verdicts = await classifyPersonaPaths(candidates, scope, "Test store");

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(verdicts.filter((verdict) => verdict.mapping?.status === "mapped")).toHaveLength(4);
  });

  it("asks again in halves when the answer was cut off, instead of losing every verdict", async () => {
    generateContent
      .mockResolvedValueOnce({ text: '{"verdicts":[{"id":"a","act', candidates: [{ finishReason: "MAX_TOKENS" }] })
      .mockImplementation(async ({ contents }) => answerFor(contents[0].parts[0].text));

    const verdicts = await classifyPersonaPaths(candidates, scope, "Test store");

    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(verdicts.map((verdict) => verdict.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(verdicts.every((verdict) => verdict.mapping?.status === "mapped")).toBe(true);
  });

  it("passes the abort signal to the AI call", async () => {
    generateContent.mockImplementation(async ({ contents }) => answerFor(contents[0].parts[0].text));
    const controller = new AbortController();

    await classifyPersonaPaths(candidates, scope, "Test store", { signal: controller.signal });

    expect(generateContent.mock.calls[0][0].config.abortSignal).toBe(controller.signal);
  });
});
