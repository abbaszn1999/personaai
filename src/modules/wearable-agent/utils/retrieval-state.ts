import type { BundleState } from "@/lib/retrieval/types";

/**
 * The cross-turn retrieval memory the client owns and echoes back to the stateless server.
 *
 * Extracted from the hook so the merge rule below can be tested without a browser environment —
 * it is the piece with actual logic in it, and the rest of the hook is state plumbing around it.
 */
export interface RetrievalState {
  anchorId: string | null;
  /** True when `anchorId` came from the shopper clicking Select rather than the server inferring
   *  it from their wording. */
  anchorPinned: boolean;
  bundleState: BundleState | null;
  shownProductIds: string[];
}

/** What one turn's `retrieval_state` event reports. No pin flag: the server never invents one, it
 *  only honours the one the client sent. */
export interface RetrievalStateUpdate {
  anchorId: string | null;
  bundleState: BundleState | null;
  shownProductIds: string[];
}

/**
 * Folds a turn's reported state into what the client holds.
 *
 * `bundleState` and `shownProductIds` are owned by the server and overwrite. `anchorId` does not,
 * and that asymmetry is the whole reason this function exists: plenty of turns resolve no anchor
 * and report null, and taking that at face value would discard a pin the shopper set by clicking
 * and can still see named above the composer.
 *
 * A non-null id always wins, pinned or not. The server only returns one it actually resolved, and
 * against a pin that means the shopper named a different product outright — at least as explicit
 * as the click that set the pin, so the pin moves with it rather than fighting it.
 */
export function mergeRetrievalState(current: RetrievalState, update: RetrievalStateUpdate): RetrievalState {
  const anchorId = update.anchorId ?? (current.anchorPinned ? current.anchorId : null);

  return {
    anchorId,
    anchorPinned: current.anchorPinned && anchorId !== null,
    bundleState: update.bundleState,
    shownProductIds: update.shownProductIds,
  };
}
