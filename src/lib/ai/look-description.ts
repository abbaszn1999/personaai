import { getPlatformGeminiApiKey } from "@/lib/ai/gemini";
import { agentModel, callStructured } from "@/lib/agents/shared/structured-call";
import { sanitizeDescribedLookPrompt } from "@/modules/wearable-agent/utils/live-tryon-prompt";
import type { LookRequest } from "@/lib/live/look-request";

/**
 * Writes Decart's live try-on prompt from the avatar render itself.
 *
 * The reference picture Decart receives is the shopper's avatar already wearing the look, so the
 * most faithful prompt is a description of that very picture: whatever the avatar really has on,
 * in the wording Decart's VTON guide asks for (one "Substitute the outfit with ..." sentence of
 * visible garment details). Catalog titles and attributes can disagree with a render; the picture
 * cannot.
 */
const SYSTEM_PROMPT = `You write the text prompt for Decart's Lucy VTON, a live virtual try-on model. It receives a reference picture of a person already wearing an outfit, plus your sentence, and dresses the shopper on camera in exactly that outfit.

Look at the picture and describe only the clothing, footwear and worn accessories the person has on.

Rules:
- Output ONE sentence that starts exactly with "Substitute the outfit with" and lists every garment from head to toe. Example: "Substitute the outfit with a dark green hooded jacket, zipped closed, with large front pockets, slim black jeans and white low-top leather sneakers with a thin rubber sole."
- For each item give only what is visible: colour, fabric or texture, garment type, fit or silhouette, length, sleeves, neckline or collar, closures, pockets, pattern, visible logos or printed text.
- Never describe the person (face, hair, skin, body, pose), the background or the lighting.
- Never invent a detail you cannot see; when unsure, leave it out. Do not name a brand unless it is legible in the picture.
- Store item titles may be given only to help you tell what an item is. Never copy a detail from a title that the picture does not show.
- Ask for nothing else: no pose, identity, background or quality instructions, and no "Add ..." actions.
- At most 550 characters, plain English, no markdown, no line breaks.`;

const SCHEMA = {
  type: "object",
  properties: { prompt: { type: "string" } },
  required: ["prompt"],
};

/** A reply that is slow is a reply that is late for a live session; the caller falls back. */
const TIMEOUT_MS = 12_000;

/**
 * Returns a Decart-ready sentence, or null when the model's reply is not a clean garment-only
 * prompt (the caller then uses the catalog prompt).
 */
export async function describeLookForLive(look: LookRequest, signal?: AbortSignal): Promise<string | null> {
  const titles = look.itemNames.length > 0 ? look.itemNames.join("; ") : "none given";
  const { value } = await callStructured<{ prompt?: unknown }>({
    apiKey: getPlatformGeminiApiKey(),
    model: agentModel(),
    prefix: SYSTEM_PROMPT,
    userText: `Store item titles (only to identify items): ${titles}\n\nWrite the prompt for the outfit in the picture.`,
    image: { mimeType: look.mimeType, data: look.data },
    schema: SCHEMA,
    thinking: "off",
    timeoutMs: TIMEOUT_MS,
    label: "live-look-description",
    signal,
  });
  return sanitizeDescribedLookPrompt(value.prompt);
}
