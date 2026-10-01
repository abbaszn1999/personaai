import type { TurnAttribution } from "@/modules/commerce/types";
import type { AgentEvent, AgentName, AgentTrigger } from "./types";

/**
 * Reads a turn's own event stream and names what produced it. Derived from the events rather
 * than reported by each agent, so a handoff (Attribute → Persona, Bundle → Persona) is credited
 * to the agent that actually showed the products.
 */
export function createAttributionCollector(trigger: AgentTrigger | null) {
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
          ? trigger
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
