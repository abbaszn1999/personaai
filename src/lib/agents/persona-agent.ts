import { fetchImageAsBase64, generateGeminiImage, GeminiApiError, type GeminiImagePart } from "@/lib/ai/gemini";
import { stripBackgroundToTransparent } from "@/lib/ai/background-removal";
import type { AvatarVariation } from "@/modules/wearable-agent/types";
import type { GarmentCategory } from "@/modules/wearable-agent/utils/fit-metrics";

export class PersonaAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersonaAgentError";
  }
}

/**
 * Matches the 4-card "Choose your avatar" UI and the 4 fixed backdrop plates — a fixed
 * product/layout decision (like the 2K image size), not an env-tunable model parameter.
 */
export const DEFAULT_AVATAR_VARIATION_COUNT = 4;

const AVATAR_ASPECT_RATIO = "3:4";

/** Each variation gets a genuinely different outfit so the 4 results aren't 4 copies of the same look. */
const AVATAR_STYLES = [
  { label: "Tailored Blazer", styleHint: "wearing a tailored blazer look with clean, structured lines" },
  { label: "Classic Suit", styleHint: "wearing a classic suit look, sharp and formal" },
  { label: "Relaxed Casual", styleHint: "wearing a relaxed, neutral-tone casual look" },
  { label: "Elegant Fitted", styleHint: "wearing an elegant, fitted evening-appropriate look" },
] as const;

/** Each fixed backdrop plate pairs 1:1 with the avatar style at the same index. */
function backdropPathForIndex(index: number): string {
  return `/avatars/backgrounds/backdrop-${index + 1}.png`;
}

/**
 * Non-negotiables, in priority order: (1) exact face match, (2) precise body proportions,
 * (3) the fixed chroma-key backdrop every generation is rendered against.
 */
function buildIdentityAndBodyInstruction(input: {
  heightCm: number;
  weightKg: number;
  chestCm: number;
  waistCm: number;
  shoeSizeEu: number;
}): string {
  return [
    "This must be the exact same person as the reference photo — identical facial features, identity, skin tone, and hair, with zero beautification or alteration.",
    `The body must precisely reflect these measurements: ${input.heightCm}cm tall, ${input.weightKg}kg, chest ${input.chestCm}cm, waist ${input.waistCm}cm, shoe size EU ${input.shoeSizeEu} — not a generic average body.`,
    "Render entirely against a single flat, uniform, seamless background of solid color #FF00FF (pure magenta), covering 100% of the space around the subject, with no gradients, shadows, or texture in the background.",
  ].join(" ");
}

export interface GenerateAvatarVariationsInput {
  photoBase64: string;
  photoMimeType: string;
  heightCm: number;
  weightKg: number;
  chestCm: number;
  waistCm: number;
  shoeSizeEu: number;
}

/**
 * Generates up to `count` avatar variations in parallel, each in a different outfit style,
 * each paired with a fixed backdrop plate by its position in the batch. Runs every image
 * through {@link stripBackgroundToTransparent} to isolate the subject. One failed call
 * doesn't sink the whole batch — only successful results are returned.
 */
export async function generateAvatarVariations(
  input: GenerateAvatarVariationsInput,
  count: number = DEFAULT_AVATAR_VARIATION_COUNT
): Promise<AvatarVariation[]> {
  const successes: AvatarVariation[] = [];
  let firstFailureMessage: string | null = null;

  for await (const event of generateAvatarVariationsStream(input, count)) {
    if (event.type === "variation") {
      successes.push(event.variation);
    } else if (!firstFailureMessage) {
      firstFailureMessage = event.message;
    }
  }

  if (successes.length === 0) {
    throw new PersonaAgentError(firstFailureMessage ?? "Failed to generate any avatar variations. Please try again.");
  }

  return successes;
}

export type AvatarVariationStreamEvent =
  | { type: "variation"; variation: AvatarVariation }
  | { type: "variation_error"; label: string; message: string };

/**
 * Same generation as {@link generateAvatarVariations}, but yields each variation the moment
 * it finishes instead of waiting for the whole (parallel) batch — each Gemini call can easily
 * take 30s-2min+ depending on load, so a caller that streams these as SSE events can show real
 * progress and keep the connection alive, rather than one silent multi-minute request that
 * some proxies/tunnels will just kill before it ever resolves. Yields in completion order, not
 * request order — whichever finishes first is yielded first.
 */
export async function* generateAvatarVariationsStream(
  input: GenerateAvatarVariationsInput,
  count: number = DEFAULT_AVATAR_VARIATION_COUNT
): AsyncGenerator<AvatarVariationStreamEvent> {
  const clampedCount = Math.max(0, Math.min(count, DEFAULT_AVATAR_VARIATION_COUNT));
  const stylesToUse = AVATAR_STYLES.slice(0, clampedCount);
  const bodyInstruction = buildIdentityAndBodyInstruction(input);

  const pending = new Map<number, { label: string; promise: Promise<AvatarVariation> }>(
    stylesToUse.map((style, index) => [
      index,
      {
        label: style.label,
        promise: (async (): Promise<AvatarVariation> => {
          const parts: GeminiImagePart[] = [
            { type: "text", text: `${bodyInstruction} Full-body standing studio pose, ${style.styleHint}.` },
            { type: "image", data: input.photoBase64, mimeType: input.photoMimeType },
          ];

          const generated = await generateGeminiImage(parts, { aspectRatio: AVATAR_ASPECT_RATIO });
          const stripped = await stripBackgroundToTransparent(generated.imageBase64, generated.mimeType);

          return {
            id: crypto.randomUUID(),
            label: style.label,
            imageUrl: `data:${stripped.mimeType};base64,${stripped.imageBase64}`,
            backdropUrl: backdropPathForIndex(index),
          };
        })(),
      },
    ])
  );

  while (pending.size > 0) {
    const entries = [...pending.entries()];
    // Races only to find out which slot settled first — the actual result/error is read from
    // that slot's own (already-settled) promise right after, so nothing here can throw.
    const settledKey = await Promise.race(
      entries.map(([key, slot]) => slot.promise.then(() => key, () => key))
    );
    const slot = pending.get(settledKey);
    if (!slot) continue; // Defensive — a key can't legitimately be missing here.
    pending.delete(settledKey);

    try {
      const variation = await slot.promise;
      yield { type: "variation", variation };
    } catch (err) {
      console.error("[persona-agent generateAvatarVariationsStream] a variation failed", err);
      yield {
        type: "variation_error",
        label: slot.label,
        message: err instanceof GeminiApiError ? err.message : "This variation failed to generate.",
      };
    }
  }
}

/** A garment reference for prompt-building — carries its AI-classified slot so the prompt
 *  can name exactly what's being replaced vs kept, instead of just stacking photos. */
export interface TryOnGarmentRef {
  name: string;
  slot: GarmentCategory;
  imageUrl: string;
}

export interface GenerateTryOnImageInput {
  avatarImageUrl: string;
  /** Garments already on the avatar that must stay visually unchanged this render. */
  kept: TryOnGarmentRef[];
  /** New or replacement garments — only these get sent as reference images. */
  added: TryOnGarmentRef[];
}

/** Resolves a `data:` URL or a remote image URL into a Gemini reference-image part. */
async function resolveImageToPart(urlOrDataUrl: string): Promise<GeminiImagePart> {
  const dataUrlMatch = /^data:([^;]+);base64,(.+)$/.exec(urlOrDataUrl);
  if (dataUrlMatch) {
    return { type: "image", data: dataUrlMatch[2], mimeType: dataUrlMatch[1] };
  }
  const { data, mimeType } = await fetchImageAsBase64(urlOrDataUrl);
  return { type: "image", data, mimeType };
}

function describeGarments(garments: TryOnGarmentRef[]): string {
  return garments.map((g) => `${g.name} (${g.slot})`).join(", ");
}

const IDENTITY_INSTRUCTION =
  "This must be the exact same person as the reference photo — identical facial features, identity, skin tone, and hair, with zero beautification or alteration.";
const BACKDROP_INSTRUCTION =
  "Render entirely against a single flat, uniform, seamless background of solid color #FF00FF (pure magenta), covering 100% of the space around the subject, with no gradients, shadows, or texture in the background.";

/**
 * Builds the try-on instruction from an explicit kept-vs-added diff instead of just handing
 * Gemini a pile of garment photos and hoping it infers what changed. Pure/deterministic so
 * it's unit-testable without a live Gemini call — see persona-agent.test.ts.
 *
 * - No `kept` items (first-ever dress, or re-rendering with no established prior look):
 *   dress the person fully from the reference images, same as the original behavior.
 * - `kept` items but nothing new (`added` empty — e.g. re-requesting an already-worn item):
 *   explicitly ask for an unchanged render rather than sending a malformed "replace" clause.
 * - Otherwise: name exactly what's currently worn, replace only the slot(s) of the new
 *   item(s), and keep everything else exactly as shown in the avatar photo.
 */
export function buildTryOnPrompt(kept: TryOnGarmentRef[], added: TryOnGarmentRef[]): string {
  if (kept.length === 0) {
    return [
      IDENTITY_INSTRUCTION,
      "Dress the person in the exact garment(s) shown in the reference image(s) — reproduce their exact color, pattern, fabric texture, and silhouette faithfully, not an approximation — while keeping the person's face, body proportions, and pose completely unchanged.",
      BACKDROP_INSTRUCTION,
    ].join(" ");
  }

  const keptDescription = describeGarments(kept);

  if (added.length === 0) {
    return [
      IDENTITY_INSTRUCTION,
      `Render the person exactly as they currently appear in the avatar photo, wearing ${keptDescription}, unchanged.`,
      BACKDROP_INSTRUCTION,
    ].join(" ");
  }

  const addedSlots = [...new Set(added.map((a) => a.slot))].join(", ");
  const addedDescription = describeGarments(added);

  return [
    IDENTITY_INSTRUCTION,
    `The person is currently wearing: ${keptDescription}.`,
    `Replace ONLY the ${addedSlots} with the new garment(s) shown in the reference image(s) — ${addedDescription} — reproducing their exact color, pattern, fabric texture, and silhouette faithfully, not an approximation.`,
    `Keep ${keptDescription} and everything else exactly as shown in the avatar photo, unchanged.`,
    BACKDROP_INSTRUCTION,
  ].join(" ");
}

/**
 * Dresses the shopper's avatar according to an explicit kept-vs-added diff, keeping face,
 * body proportions, and pose unchanged, against the same fixed chroma-key backdrop as the
 * avatar. Only `added` garments are sent as reference images — `kept` garments are described
 * in the prompt as already visible on the avatar photo itself, not re-sent as photos.
 */
export async function generateTryOnImage(input: GenerateTryOnImageInput): Promise<{ imageUrl: string }> {
  if (input.kept.length === 0 && input.added.length === 0) {
    throw new PersonaAgentError("At least one garment is required for a try-on render.");
  }

  try {
    const avatarPart = await resolveImageToPart(input.avatarImageUrl);
    const garmentParts = await Promise.all(input.added.map((g) => resolveImageToPart(g.imageUrl)));

    const prompt = buildTryOnPrompt(input.kept, input.added);

    const parts: GeminiImagePart[] = [{ type: "text", text: prompt }, avatarPart, ...garmentParts];
    const generated = await generateGeminiImage(parts, { aspectRatio: AVATAR_ASPECT_RATIO });
    const stripped = await stripBackgroundToTransparent(generated.imageBase64, generated.mimeType);

    return { imageUrl: `data:${stripped.mimeType};base64,${stripped.imageBase64}` };
  } catch (err) {
    if (err instanceof PersonaAgentError) throw err;
    const message = err instanceof GeminiApiError ? err.message : "Failed to generate the try-on render. Please try again.";
    throw new PersonaAgentError(message);
  }
}
