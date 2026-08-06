import { INTENT_ROUTING_PROMPT } from "./skills/intent-routing";
import { PERSONA_GUARDRAILS_PROMPT } from "./skills/persona-guardrails";
import type { UnwearableChatContext } from "./types";

/** Merchants can sync multiple categories that share a display name (with different ids) —
 *  group them so the model sees one clean entry per name instead of confusing
 *  duplicate-looking lines, and can pass either the name or any of the listed ids to
 *  `search_catalog`'s `category` argument (it resolves all matching ids). */
function formatCategoryHints(context: UnwearableChatContext): string {
  if (context.categories.length === 0) return "none synced yet — search the whole catalog with free text";

  const byName = new Map<string, string[]>();
  for (const c of context.categories) {
    const ids = byName.get(c.name) ?? [];
    ids.push(c.id);
    byName.set(c.name, ids);
  }

  return [...byName.entries()].map(([name, ids]) => `${name} (id${ids.length > 1 ? "s" : ""}: ${ids.join(", ")})`).join(", ");
}

function formatKnownIntake(context: UnwearableChatContext): string {
  const known = [
    context.intake.useCase ? `use case: ${context.intake.useCase}` : null,
    context.intake.priority ? `priority: ${context.intake.priority}` : null,
    context.intake.budget ? `budget: ${context.intake.budget}` : null,
  ].filter((v): v is string => v !== null);
  return known.length > 0 ? known.join(", ") : "none captured yet";
}

/** Builds the system message for one chat turn — persona/guardrails + intent-routing policy
 *  (both fixed) plus this turn's live context (store, known preferences). */
export function buildSystemPrompt(context: UnwearableChatContext): string {
  return [
    PERSONA_GUARDRAILS_PROMPT,
    "",
    INTENT_ROUTING_PROMPT,
    "",
    `The connected store has roughly ${context.storeProductCount} products. Synced categories: ${formatCategoryHints(context)}.`,
    `Preferences captured so far: ${formatKnownIntake(context)}.`,
    "Keep replies concise and conversational (2-4 sentences), like a knowledgeable friend texting product advice.",
  ].join("\n");
}
