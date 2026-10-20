import { describe, expect, it } from "vitest";
import { topicFromAttribution } from "./attribution";
import type { TurnAttribution } from "@/modules/commerce/types";

function attr(partial: Partial<TurnAttribution>): TurnAttribution {
  return {
    agent: "persona",
    action: "answer",
    path: null,
    query: null,
    lookIds: [],
    ...partial,
  };
}

describe("topicFromAttribution", () => {
  it("returns null without attribution", () => {
    expect(topicFromAttribution(null)).toBeNull();
    expect(topicFromAttribution(undefined)).toBeNull();
  });

  it("uses the catalog path leaf when present", () => {
    expect(topicFromAttribution(attr({ path: "men > outerwear > jacket", action: "filter" }))).toBe("jacket");
  });

  it("falls back to a readable action label", () => {
    expect(topicFromAttribution(attr({ action: "complete_look" }))).toBe("Complete the look");
    expect(topicFromAttribution(attr({ action: "cosine" }))).toBe("Product search");
  });

  it("uses the raw action when no friendly label exists", () => {
    expect(topicFromAttribution(attr({ action: "custom_turn" }))).toBe("custom_turn");
  });
});
