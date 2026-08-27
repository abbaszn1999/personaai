import { describe, expect, it } from "vitest";
import { mergeRetrievalState, type RetrievalState } from "./retrieval-state";

const pinned: RetrievalState = {
  anchorId: "p-jacket",
  anchorPinned: true,
  bundleState: null,
  shownProductIds: ["p-jacket"],
};

const inferred: RetrievalState = { ...pinned, anchorPinned: false };

describe("mergeRetrievalState", () => {
  it("keeps a pinned anchor through a turn that resolved none", () => {
    // The reason this is a merge and not an assignment. Plenty of turns — a fresh search, a
    // question, a bundle step — resolve no anchor and report null, and dropping the pin on each
    // one would discard a selection the shopper made by clicking and can still see.
    const next = mergeRetrievalState(pinned, { anchorId: null, bundleState: null, shownProductIds: ["p-jacket"] });

    expect(next.anchorId).toBe("p-jacket");
    expect(next.anchorPinned).toBe(true);
  });

  it("drops an unpinned anchor on the same turn", () => {
    const next = mergeRetrievalState(inferred, { anchorId: null, bundleState: null, shownProductIds: [] });

    expect(next.anchorId).toBeNull();
    expect(next.anchorPinned).toBe(false);
  });

  it("moves the pin when the server resolved a different product", () => {
    // Only happens when the shopper named one outright, which is as explicit as the click was.
    const next = mergeRetrievalState(pinned, { anchorId: "p-coat", bundleState: null, shownProductIds: [] });

    expect(next.anchorId).toBe("p-coat");
    expect(next.anchorPinned).toBe(true);
  });

  it("lets the server overwrite the fields it owns outright", () => {
    const bundleState = { scope: ["tops"], locked: {} };
    const next = mergeRetrievalState(pinned, {
      anchorId: null,
      bundleState,
      shownProductIds: ["p-1", "p-2"],
    });

    expect(next.bundleState).toBe(bundleState);
    expect(next.shownProductIds).toEqual(["p-1", "p-2"]);
  });

  it("does not resurrect a pin after the shopper dismissed it", () => {
    // clearAnchor leaves the flag off and the id null; the next turn must not re-pin anything.
    const cleared: RetrievalState = { ...pinned, anchorId: null, anchorPinned: false };
    const next = mergeRetrievalState(cleared, { anchorId: null, bundleState: null, shownProductIds: [] });

    expect(next.anchorId).toBeNull();
    expect(next.anchorPinned).toBe(false);
  });

  it("never reports itself pinned to nothing", () => {
    const next = mergeRetrievalState(
      { ...pinned, anchorId: null },
      { anchorId: null, bundleState: null, shownProductIds: [] }
    );

    expect(next.anchorPinned).toBe(false);
  });
});
