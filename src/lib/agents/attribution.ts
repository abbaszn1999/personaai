import type { TurnAttribution } from "@/modules/commerce/types";
import type { AgentEvent, AgentName } from "./types";

/**
 * Reads a turn's own event stream and names what produced it. Derived from the events rather
 * than reported by each agent, so a turn is credited to the agent that actually showed the
 * products. Looks built around an attached anchor ("Complete the look") are "complete_look";
 * a turn on an attached look is a "look_follow_up".
 */
export function createAttributionCollector(anchored = false) {
  let agent: AgentName | null = null;
  let searchAction: "filter" | "cosine" | null = null;
  let path: string | null = null;
  let query: string | null = null;
  let showedProducts = false;
  const lookIds: string[] = [];

  return {
    observe(event: AgentEvent): void {
      switch (event.type) {
        case "agent":
          agent = event.agent;
          break;
        case "product_recommendations":
          showedProducts = event.productIds.length > 0;
          break;
        case "bundle":
          for (const look of event.bundles) if (!lookIds.includes(look.id)) lookIds.push(look.id);
          break;
        case "retrieval_state":
          if (event.lastSearch) {
            searchAction = event.lastSearch.action;
            path = event.lastSearch.path;
            query = event.lastSearch.query || null;
          }
          break;
      }
    },

    result(): TurnAttribution | null {
      if (!agent) return null;
      const action =
        agent === "bundle"
          ? anchored
            ? "complete_look"
            : "look_follow_up"
          : showedProducts && searchAction
            ? searchAction
            : agent === "attribute"
              ? "attribute_answer"
              : "answer";
      return { agent, action, path, query, lookIds };
    },
  };
}

const ACTION_TOPIC_LABELS: Record<string, string> = {
  filter: "Product browse",
  cosine: "Product search",
  answer: "Style advice",
  complete_look: "Complete the look",
  look_follow_up: "Look follow-up",
  attribute_answer: "Product details",
};

/**
 * Short label for the Analytics "Top topics" list. Prefers the catalog path the shopper
 * browsed (leaf segment), otherwise a readable name for the turn's action.
 */
export function topicFromAttribution(attribution: TurnAttribution | null | undefined): string | null {
  if (!attribution) return null;
  if (attribution.path) {
    const leaf = attribution.path
      .split(">")
      .map((part) => part.trim())
      .filter(Boolean)
      .pop();
    const label = leaf || attribution.path.trim();
    return label ? label.slice(0, 80) : null;
  }
  const fromAction = ACTION_TOPIC_LABELS[attribution.action] ?? attribution.action.trim();
  return fromAction ? fromAction.slice(0, 80) : null;
}

/** Accepts attribution from an untrusted client and keeps only well-formed, bounded fields. */
export function parseAttribution(raw: unknown): TurnAttribution | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.agent !== "persona" && value.agent !== "bundle" && value.agent !== "attribute") return null;
  if (typeof value.action !== "string" || !value.action) return null;
  const text = (field: unknown, max: number) => (typeof field === "string" && field ? field.slice(0, max) : null);
  return {
    agent: value.agent,
    action: value.action.slice(0, 40),
    path: text(value.path, 300),
    query: text(value.query, 300),
    lookIds: Array.isArray(value.lookIds)
      ? value.lookIds.filter((id): id is string => typeof id === "string").slice(0, 5).map((id) => id.slice(0, 80))
      : [],
  };
}
