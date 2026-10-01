import { GeminiChatError } from "@/lib/ai/gemini-chat";
import { createAttributionCollector } from "./attribution";
import { runAttribute } from "./attribute/agent";
import { runBundle } from "./bundle/agent";
import { runPersona } from "./persona/agent";
import type { AgentContext, AgentEvent } from "./types";

function selectAgent(ctx: AgentContext): AsyncGenerator<AgentEvent> | null {
  if (ctx.trigger || ctx.attachment?.kind === "look") return runBundle(ctx);
  if (ctx.attachment?.kind === "item") return runAttribute(ctx, ctx.attachment.productId);
  if (!ctx.message) return null;
  return runPersona(ctx);
}

/**
 * Which agent owns the turn. A plain if-statement over what the shopper clicked — never a model
 * call, never inferred from their wording:
 *
 *   "Complete the look" clicked → Bundle
 *   a look attached             → Bundle
 *   an item attached            → Attribute
 *   otherwise                   → Persona
 */
export async function* dispatchTurn(ctx: AgentContext): AsyncGenerator<AgentEvent> {
  const attribution = createAttributionCollector(ctx.trigger);
  try {
    const agent = selectAgent(ctx);
    if (!agent) {
      yield { type: "error", message: "Type a message to get started." };
    } else {
      for await (const event of agent) {
        attribution.observe(event);
        yield event;
      }
      const result = attribution.result();
      if (result) yield { type: "attribution", attribution: result };
    }
  } catch (error) {
    console.error("[agents dispatch]", error);
    yield {
      type: "error",
      message:
        error instanceof GeminiChatError && error.isRateLimit
          ? error.message
          : "The style assistant hit an unexpected error. Please try again.",
    };
  }
  yield { type: "done" };
}
