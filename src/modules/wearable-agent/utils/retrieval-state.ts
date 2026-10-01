import type { LastSearch } from "@/lib/agents/types";

/**
 * The cross-turn memory the client owns and echoes back to the stateless server: which products
 * are on screen (ordinals resolve against them) and the search that produced them (refinements
 * inherit it).
 */
export interface RetrievalState {
  shownProductIds: string[];
  lastSearch: LastSearch | null;
}

export const EMPTY_RETRIEVAL_STATE: RetrievalState = { shownProductIds: [], lastSearch: null };

/** Accepts whatever was persisted — including the pre-agent-split shape — and returns today's. */
export function normalizeRetrievalState(raw: unknown): RetrievalState {
  if (!raw || typeof raw !== "object") return EMPTY_RETRIEVAL_STATE;
  const value = raw as { shownProductIds?: unknown; lastSearch?: unknown };
  const shownProductIds = Array.isArray(value.shownProductIds)
    ? value.shownProductIds.filter((id): id is string => typeof id === "string")
    : [];
  const lastSearch =
    value.lastSearch && typeof value.lastSearch === "object" && typeof (value.lastSearch as LastSearch).path === "string"
      ? (value.lastSearch as LastSearch)
      : null;
  return { shownProductIds, lastSearch };
}
