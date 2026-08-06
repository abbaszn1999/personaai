import { INTENT_ROUTING_PROMPT } from "./skills/intent-routing";
import { PERSONA_GUARDRAILS_PROMPT } from "./skills/persona-guardrails";
import type { WearableChatContext } from "./types";

function formatProfileLine(context: WearableChatContext): string {
  const { profile } = context;
  if (!profile.heightCm || !profile.weightKg) return "not yet provided";

  const parts = [`${Math.round(profile.heightCm)}cm tall`, `${Math.round(profile.weightKg)}kg`];
  if (profile.chestCm) parts.push(`chest ${Math.round(profile.chestCm)}cm`);
  if (profile.waistCm) parts.push(`waist ${Math.round(profile.waistCm)}cm`);
  if (profile.shoeSizeEu) parts.push(`shoe size EU ${profile.shoeSizeEu}`);
  return parts.join(", ");
}

/** Merchants can sync multiple categories that share a display name (e.g. "Jackets" scoped to
 *  both Men and Women, with different ids) — group them so the model sees one clean entry per
 *  name instead of confusing duplicate-looking lines, and can pass either the name or any of
 *  the listed ids to `search_catalog`'s `category` argument (it resolves all matching ids). */
function formatCategoryHints(context: WearableChatContext): string {
  if (context.categories.length === 0) return "none synced yet — search the whole catalog with free text";

  const byName = new Map<string, string[]>();
  for (const c of context.categories) {
    const ids = byName.get(c.name) ?? [];
    ids.push(c.id);
    byName.set(c.name, ids);
  }

  return [...byName.entries()].map(([name, ids]) => `${name} (id${ids.length > 1 ? "s" : ""}: ${ids.join(", ")})`).join(", ");
}

function formatKnownIntake(context: WearableChatContext): string {
  const known = [
    context.intake.occasion ? `occasion: ${context.intake.occasion}` : null,
    context.intake.style ? `style: ${context.intake.style}` : null,
    context.intake.budget ? `budget: ${context.intake.budget}` : null,
  ].filter((v): v is string => v !== null);
  return known.length > 0 ? known.join(", ") : "none captured yet";
}

/** Builds the system message for one chat turn — persona/guardrails + intent-routing policy
 *  (both fixed) plus this turn's live context (profile, outfit, store, known preferences). */
export function buildSystemPrompt(context: WearableChatContext): string {
  return [
    PERSONA_GUARDRAILS_PROMPT,
    "",
    INTENT_ROUTING_PROMPT,
    "",
    `The connected store has roughly ${context.storeProductCount} products. Synced categories: ${formatCategoryHints(context)}.`,
    `Shopper's body profile: ${formatProfileLine(context)}.`,
    `Current outfit being built: ${context.outfitItems.length > 0 ? context.outfitItems.map((p) => p.name).join(", ") : "empty"}.`,
    `Preferences captured so far: ${formatKnownIntake(context)}.`,
    "Keep replies concise and conversational (2-4 sentences), like a real stylist texting a client.",
  ].join("\n");
}
