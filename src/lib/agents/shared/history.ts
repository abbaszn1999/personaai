import type { ChatMessage } from "@/modules/commerce/types";
import type { ConversationTurn } from "@/lib/retrieval/types";

const ASSISTANT_CHARS = 240;

/** Turns before the current message, oldest first, limited to real conversation. */
export function toConversationTurns(history: readonly ChatMessage[]): ConversationTurn[] {
  return history
    .filter((message): message is ChatMessage & { role: "user" | "assistant" } =>
      (message.role === "user" || message.role === "assistant") && message.content.trim().length > 0
    )
    .map((message) => ({ role: message.role, content: message.content }));
}

/**
 * The last `turns` exchanges as prompt text. The shopper's side is kept verbatim — it is what the
 * agent must read — and the assistant's is shortened, since its long replies mostly narrate cards
 * the shopper already saw.
 */
export function renderHistory(history: readonly ConversationTurn[], turns: number): string {
  const recent = history.slice(-turns * 2);
  if (recent.length === 0) return "(no earlier messages)";
  return recent
    .map((turn) => {
      if (turn.role === "user") return `Shopper: ${turn.content.trim()}`;
      const text = turn.content.replace(/\s+/g, " ").trim();
      return `Assistant: ${text.length > ASSISTANT_CHARS ? `${text.slice(0, ASSISTANT_CHARS)}…` : text}`;
    })
    .join("\n");
}
