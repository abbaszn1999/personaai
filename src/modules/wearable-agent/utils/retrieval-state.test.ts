import { describe, expect, it } from "vitest";
import { normalizeRetrievalState } from "./retrieval-state";

describe("normalizeRetrievalState", () => {
  it("keeps shown ids and a well-formed last search", () => {
    const lastSearch = {
      action: "filter" as const,
      path: "women > bottom > trouser",
      brands: [],
      priceMin: null,
      priceMax: 80,
      attributes: [{ key: "color", values: ["Black"] }],
      query: "",
    };
    expect(normalizeRetrievalState({ shownProductIds: ["a", "b"], lastSearch })).toEqual({
      shownProductIds: ["a", "b"],
      lastSearch,
    });
  });

  it("drops the legacy anchor and bundle fields", () => {
    expect(
      normalizeRetrievalState({ anchorId: "x", anchorPinned: true, bundleState: { scope: [] }, shownProductIds: ["a"] })
    ).toEqual({ shownProductIds: ["a"], lastSearch: null });
  });

  it("returns an empty state for garbage", () => {
    expect(normalizeRetrievalState(null)).toEqual({ shownProductIds: [], lastSearch: null });
    expect(normalizeRetrievalState({ shownProductIds: "nope", lastSearch: 4 })).toEqual({
      shownProductIds: [],
      lastSearch: null,
    });
  });
});
