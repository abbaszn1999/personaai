import { loadSkill } from "../load-skill";
import type { WearableChatContext } from "./types";
import type { AnchorState } from "@/lib/retrieval/types";
import type { Product } from "@/modules/commerce/types";

/**
 * Everything known about one item, rendered for the top-level chat model so it can answer a
 * question about it without a tool call — see `tool-policy.md`. Price isn't on `AnchorState`
 * itself, so it's looked up off `knownProducts` (the same rendered product the shopper was
 * already shown) when available.
 *
 * Deliberately generic: this never names which attributes a store happens to carry — it only
 * ever renders whatever keys are actually present in `item.attributes`, because that set is
 * defined by each merchant's own catalog, not by this app. Shared by the single pinned anchor
 * and every item of a discussed bundle, so both get the same grounding.
 */
function formatItemContext(item: AnchorState, knownProducts: Product[]): string {
  const known = knownProducts.find((product) => product.id === item.externalId);
  const lines = [`Title: ${item.title}`];
  if (item.brand) lines.push(`Brand: ${item.brand}`);
  if (known) lines.push(`Price: ${known.currency} ${known.price}`);
  if (item.enrichedDescription) lines.push(`Description: ${item.enrichedDescription}`);

  const attributeEntries = Object.entries(item.attributes ?? {}).filter(([, values]) => values.length > 0);
  for (const [key, values] of attributeEntries) {
    lines.push(`${key}: ${values.join(", ")}`);
  }

  return lines.join("\n");
}

function formatAnchorContext(context: WearableChatContext): string | null {
  if (!context.anchor) return null;
  return formatItemContext(context.anchor, context.knownProducts);
}

/** One block per item of the bundle the shopper is currently discussing (see
 *  "Discuss this bundle"), so the model can answer about any of them or resolve a free-text
 *  swap ("replace the pants") without a fresh search. Empty when nothing is being discussed. */
function formatDiscussedBundleContext(context: WearableChatContext): string | null {
  if (context.discussedBundleItems.length === 0) return null;

  return context.discussedBundleItems
    .map((item) => `[${item.garmentCategory ?? "item"}]\n${formatItemContext(item, context.knownProducts)}`)
    .join("\n\n");
}

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

/** Builds the system message for one chat turn — guardrails + tool policy (both fixed) plus
 *  this turn's live context (profile, outfit, store, known preferences). */
export function buildSystemPrompt(context: WearableChatContext): string {
  const anchorContext = formatAnchorContext(context);
  const discussedBundleContext = formatDiscussedBundleContext(context);

  return [
    loadSkill("persona/skills/guardrails.md").body,
    "",
    loadSkill("persona/skills/tool-policy.md").body,
    "",
    `The connected store has roughly ${context.storeProductCount} products. Synced categories: ${formatCategoryHints(context)}.`,
    `Shopper's body profile: ${formatProfileLine(context)}.`,
    `Current outfit being built: ${context.outfitItems.length > 0 ? context.outfitItems.map((p) => p.name).join(", ") : "empty"}.`,
    `Preferences captured so far: ${formatKnownIntake(context)}.`,
    ...(anchorContext ? ["", `Everything known about the item currently being discussed:\n${anchorContext}`] : []),
    ...(discussedBundleContext
      ? [
          "",
          `Everything known about every item in the bundle currently being discussed (a request to replace one, e.g. "different pants", refers to one of these):\n${discussedBundleContext}`,
        ]
      : []),
    "Keep replies concise and conversational (2-4 sentences), like a real stylist texting a client.",
  ].join("\n");
}
