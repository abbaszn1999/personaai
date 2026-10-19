import sharp from "sharp";
import { AVATAR_LIMITS, editGeminiImage, GeminiImageError } from "@/lib/ai/gemini-image";
import { flattenOntoChromaKey, stripBackgroundToTransparent } from "@/lib/ai/background-removal";
import { estimateAvatarCostNanos, estimateTryOnCostNanos, geminiImageCostNanos } from "@/lib/billing/pricing";
import { PersonaAgentError } from "@/lib/try-on/errors";
import { loadGarmentReference, readImageBytes } from "@/lib/try-on/image-source";
import { tryOnRenderGate } from "@/lib/try-on/render-gate";
import { buildTryOnPrompt } from "@/lib/try-on/prompt";
import { AVATAR_BACKGROUNDS, loadAvatarBackground } from "@/lib/try-on/avatar-backgrounds";
import { AVATAR_STYLE_LABELS } from "@/modules/wearable-agent/constants";
import type { AvatarVariation } from "@/modules/wearable-agent/types";
import type { GarmentCategory } from "@/modules/wearable-agent/utils/fit-metrics";

export { PersonaAgentError };

/**
 * Matches the 3-slide "Choose your avatar" carousel and the 3 fixed backdrop plates it uses — a
 * fixed product/layout decision (like the 2K image size), not an env-tunable model parameter.
 */
export const DEFAULT_AVATAR_VARIATION_COUNT = 3;

const AVATAR_ASPECT_RATIO = "3:4";

/**
 * Each variation gets a genuinely different outfit so the 3 results aren't 3 copies of the same
 * look: a sweater with trousers, a t-shirt with shorts, and a t-shirt with trousers. All three are
 * plain everyday basics so a try-on later replaces them cleanly. The first stays a sweater, not
 * "sweater or t-shirt", so it can never come out looking like the third. This order is also the
 * order of the carousel slides.
 */
const AVATAR_STYLES = [
  {
    label: AVATAR_STYLE_LABELS[0],
    styleHint:
      "a relaxed everyday casual outfit in neutral tones: a plain well-fitting crew-neck sweater, straight-leg trousers or jeans, and clean white sneakers",
  },
  {
    label: AVATAR_STYLE_LABELS[1],
    styleHint:
      "a simple summer outfit: a plain well-fitting short-sleeved crew-neck t-shirt in a neutral tone, plain casual shorts ending just above the knee, and clean white sneakers",
  },
  {
    label: AVATAR_STYLE_LABELS[2],
    styleHint:
      "a simple everyday outfit: a plain well-fitting short-sleeved crew-neck t-shirt in a neutral tone, straight-leg trousers like the casual outfit, and clean white sneakers",
  },
] as const;

/**
 * Not used: avatars no longer sit on a plate. Kept, with the plates under public/avatars/backgrounds
 * and the cut-out code in lib/ai/background-removal.ts, in case plates come back. Each plate would
 * pair 1:1 with the avatar style at the same index.
 */
export function backdropPathForIndex(index: number): string {
  return `/avatars/backgrounds/backdrop-${index + 1}.webp`;
}

/**
 * The shopper's upload is whatever they had to hand — a close-up, a hand on the chin, coloured
 * party lighting — and an edit model happily copies all of that into the result. The prompt is
 * therefore split into labelled sections that make the reference photo a source of *identity
 * only*, then fix everything else (pose, framing, lighting, background) to the same values for
 * every shopper and every style, so the avatars are interchangeable and a try-on later lays
 * a garment over the same stance each time.
 *
 * Priority, highest first: (1) exact face match, (2) one standard pose and framing, (3) body
 * proportions from the measurements, (4) the outfit, (5) neutral light and the fixed chroma-key
 * backdrop every generation is rendered against.
 */
export function buildAvatarPrompt(
  input: {
    heightCm: number;
    weightKg: number;
    chestCm?: number;
    waistCm?: number;
    ageYears?: number;
    shoeSizeEu: number;
  },
  outfit: string,
  backdropName: string = AVATAR_BACKGROUNDS[0].name
): string {
  // A child is described by age, height and weight — nobody has a child's chest and waist to hand,
  // and "age" is what tells the model to draw a child's proportions rather than a small adult's.
  const body =
    input.ageYears !== undefined
      ? `The subject is a child aged ${input.ageYears === 0 ? "under 1 year" : `${input.ageYears} year${input.ageYears === 1 ? "" : "s"}`}, so render a child's face shape and proportions, not a small adult. The body must reflect these measurements: ${input.heightCm} cm tall, ${input.weightKg} kg, shoe size EU ${input.shoeSizeEu} — not a generic average body.`
      : `The body must reflect these measurements: ${input.heightCm} cm tall, ${input.weightKg} kg, chest ${input.chestCm} cm, waist ${input.waistCm} cm, shoe size EU ${input.shoeSizeEu} — not a generic average body.`;

  return [
    "Create a full-body studio avatar of the person in the first reference photo, standing in front of the studio backdrop shown in the second reference image.",
    "IDENTITY: Use the first reference photo only to know who this person is. Keep their exact face and facial structure, skin tone, hair and hairstyle, and facial hair identical, with no beautification, slimming, smoothing or ageing. It must be recognisably the same person.",
    "IGNORE everything else in the first reference photo: its pose, any hand or arm position (for example a hand on the chin, cheek or face), head tilt, crop and framing, clothing, eyeglasses, sunglasses, watches, jewelry and every other accessory, lighting and coloured light, and colour grading. Its background is discarded completely (see BACKGROUND).",
    `BACKGROUND (as important as the face): the entire background of the final image is the ${backdropName} studio backdrop from the second reference image, copied exactly as it is — the same colour, the same lighting and the same floor, filling the whole frame behind and around the person. The wall, room or scene behind the person in the first photo must not appear anywhere. Do not recolour, lighten, darken, blur or replace it, and add no props, objects, text or patterns. Only a soft natural shadow under the feet falls on its floor. Its colour must not tint or cast any light onto the person.`,
    "POSE (identical for every avatar): standing upright and perfectly straight, facing the camera head-on and symmetrical, head level with the chin parallel to the floor, eyes looking straight into the lens, a calm natural expression with a very slight smile. Both arms hang naturally straight down at the sides with the hands relaxed and fully visible beside the thighs — empty hands, nothing held, no hand touching the face or body. Feet flat on the floor, about shoulder-width apart, toes pointing forward.",
    "FRAMING: the whole body from the top of the head to the soles of both shoes, nothing cropped, centered, with a small margin above the head and below the feet. Straight-on camera at chest height, no tilt and no wide-angle distortion, like a clean e-commerce catalog photo.",
    `BODY: ${body}`,
    `OUTFIT: dressed in ${outfit}. Nothing else is worn or carried: no eyeglasses or sunglasses (bare face, even if the person wears glasses in the reference), no hat or cap, absolutely no wristwatch, smartwatch or fitness band on either wrist (both wrists completely bare, even if the person wears one in the reference), no bracelet, necklace, earrings, rings, scarf, belt buckle logos, bag, headphones or any other accessory.`,
    "LIGHTING: soft, even, neutral white studio light with realistic skin texture. The image must be completely clean and clear: no coloured lights, no rim light, no reflections, glare, shine, highlights or light leaks, no colour cast, glow, stains or blotches — even if the reference photo has coloured lighting, reflections or shine on the face, discard all of it and render the face and skin evenly and naturally lit.",
  ].join("\n\n");
}

export interface GenerateAvatarVariationsInput {
  photoBase64: string;
  photoMimeType: string;
  heightCm: number;
  weightKg: number;
  /** Adults give chest and waist; the three kids departments give `ageYears` instead. */
  chestCm?: number;
  waistCm?: number;
  ageYears?: number;
  shoeSizeEu: number;
}

/**
 * Generates up to `count` avatar variations in parallel, each in a different outfit style,
 * each rendered as an opaque photo in front of its own {@link AVATAR_BACKGROUNDS} image. One
 * failed call doesn't sink the whole batch — only successful results are returned.
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
  /** `costNanos` is what Google billed for this render; the caller charges it. It is kept off
   *  `variation`, which goes to the browser. */
  | { type: "variation"; variation: AvatarVariation; costNanos: number }
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
  if (stylesToUse.length === 0) return;

  // Decoded once and shared by every variation: the reference photo is identical across the
  // batch. It is re-encoded as an upright JPEG whatever the shopper uploaded (EXIF rotation applied,
  // capped at 1536px) so the model always receives a format it reads and a sensible size. A photo
  // that can't be read is fatal to the whole batch by definition — there is nothing to generate
  // from — so it's reported as a per-variation error for each style rather than thrown, to
  // keep the streaming contract (callers treat a thrown error as "the request broke").
  let photo: Buffer;
  try {
    photo = await sharp(Buffer.from(input.photoBase64, "base64"))
      .rotate()
      .resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch (err) {
    console.error("[try-on generateAvatarVariationsStream] photo could not be read", err);
    const message = "Couldn't read your photo. Please try a different JPEG or PNG.";
    for (const style of stylesToUse) {
      yield { type: "variation_error", label: style.label, message };
    }
    return;
  }

  // All the requests are created here, up front, so the styles render at the same time.
  const pending = new Map<number, { label: string; promise: Promise<{ variation: AvatarVariation; costNanos: number }> }>(
    stylesToUse.map((style, index) => [
      index,
      {
        label: style.label,
        promise: (async () => {
          const background = AVATAR_BACKGROUNDS[index];
          // The photo is image 1 and the backdrop image 2: the prompt's numbering and this
          // array's order are one contract.
          const generated = await editGeminiImage({
            prompt: buildAvatarPrompt(input, style.styleHint, background.name),
            images: [
              { data: photo, mimeType: "image/jpeg" },
              { data: loadAvatarBackground(background), mimeType: "image/jpeg" },
            ],
            aspectRatio: AVATAR_ASPECT_RATIO,
            limits: AVATAR_LIMITS,
          });
          // The real cost comes from the token counts Google returned for this exact call. Only a
          // response that omitted them falls back to the estimate, so an avatar is never free.
          const costNanos = generated.usage ? geminiImageCostNanos(generated.usage) : estimateAvatarCostNanos();
          // The render is used as it came back, background included: no cut-out, no backdrop plate.
          return {
            variation: {
              id: crypto.randomUUID(),
              label: style.label,
              imageUrl: `data:${generated.mimeType};base64,${generated.image.toString("base64")}`,
            },
            costNanos,
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
      const { variation, costNanos } = await slot.promise;
      yield { type: "variation", variation, costNanos };
    } catch (err) {
      console.error("[try-on generateAvatarVariationsStream] a variation failed", err);
      yield {
        type: "variation_error",
        label: slot.label,
        message: err instanceof GeminiImageError ? err.message : "This variation failed to generate.",
      };
    }
  }
}

/** A garment reference for prompt-building — carries its AI-classified slot so the prompt
 *  can name exactly what's being replaced vs kept, instead of just stacking photos. */
export interface TryOnGarmentRef {
  name: string;
  slot: GarmentCategory;
  /** The garment's Persona leaf id, used only to name it in the prompt. */
  leaf?: string;
  imageUrl: string;
}

/**
 * The most garment references one render takes. The prompt names every garment by its image
 * number and each image costs input tokens, so this is a quality and cost bound rather than an
 * API limit; a real outfit is four or five pieces.
 */
export const MAX_TRY_ON_GARMENTS = 10;

export interface GenerateTryOnImageInput {
  avatarImageUrl: string;
  /** Garments already on the avatar that must stay visually unchanged this render. */
  kept: TryOnGarmentRef[];
  /** New or replacement garments — only these get sent as reference images. */
  added: TryOnGarmentRef[];
}

/**
 * Whether the image has any see-through pixel, i.e. it is a cut-out saved by the earlier
 * transparent-avatar pipeline. An opaque PNG that merely carries an alpha channel (every pixel
 * fully opaque) is not one, so the channel's minimum is checked rather than its existence.
 */
export async function hasTransparentPixels(bytes: Buffer): Promise<boolean> {
  const image = sharp(bytes);
  const { hasAlpha } = await image.metadata();
  if (!hasAlpha) return false;
  const { channels } = await image.stats();
  return channels.length >= 4 && channels[channels.length - 1].min < 250;
}

/**
 * Collapses a kept-vs-added diff into the single outfit to render.
 *
 * Try-on takes the whole outfit at once rather than a description of what changed, so the diff
 * the agent reasons in is flattened here. `added` wins on a slot collision: replacing the
 * shoes means the new shoes are worn, not both pairs — and the prompt names one garment per
 * category, so a stale item surviving would leave the model two answers for one slot.
 *
 * Pure and deterministic, so it's unit-testable without a live prediction.
 */
export function mergeOutfitGarments(
  kept: TryOnGarmentRef[],
  added: TryOnGarmentRef[]
): TryOnGarmentRef[] {
  const addedSlots = new Set(added.map((g) => g.slot));
  return [...kept.filter((g) => !addedSlots.has(g.slot)), ...added].slice(0, MAX_TRY_ON_GARMENTS);
}

/**
 * Dresses the shopper's avatar in their current outfit.
 *
 * Renders the full outfit against the *stored* avatar every time instead of editing the
 * previous render. Both halves of that matter: try-on preserves everything outside the
 * garment regions, so re-dressing the original avatar keeps one identity and pose for the
 * whole session, and it makes each render a pure function of the outfit — there is no
 * generation-on-generation chain for face drift and compression artifacts to accumulate
 * along, which is what a "keep the rest unchanged" instruction was previously working against.
 *
 * Avatars are opaque photos with their background baked in, and the render is an edit of that
 * photo: the prompt tells the model to keep the background unchanged, and the result is returned
 * as it comes back, with no cut-out.
 *
 * The one exception is an avatar saved before that change, a transparent cut-out meant to sit on
 * a backdrop plate. It still goes through the old path (re-keyed onto a magenta plate on the way
 * in, cut back out on the way out; see flattenOntoChromaKey for why a transparent PNG can't be
 * sent as-is), so those shoppers' avatars keep working next to their plate.
 */
export async function generateTryOnImage(
  input: GenerateTryOnImageInput
): Promise<{ imageUrl: string; garmentCount: number; costNanos: number }> {
  const garments = mergeOutfitGarments(input.kept, input.added);
  if (garments.length === 0) {
    throw new PersonaAgentError("At least one garment is required for a try-on render.");
  }

  // Everything memory-heavy happens inside the gate; see render-gate.ts.
  return tryOnRenderGate().run(() => renderTryOn(input, garments));
}

async function renderTryOn(
  input: GenerateTryOnImageInput,
  garments: TryOnGarmentRef[]
): Promise<{ imageUrl: string; garmentCount: number; costNanos: number }> {
  try {
    const avatarBytes = await readImageBytes(input.avatarImageUrl);
    const legacyCutout = await hasTransparentPixels(avatarBytes);
    const [person, garmentJpegs] = await Promise.all([
      legacyCutout
        ? flattenOntoChromaKey(avatarBytes.toString("base64"))
        : sharp(avatarBytes).rotate().png().toBuffer(),
      Promise.all(garments.map((g) => loadGarmentReference(g.imageUrl))),
    ]);

    // The person is always image 1 and garment i is image i + 2: the prompt's numbering and this
    // array's order are one contract.
    const generated = await editGeminiImage({
      prompt: buildTryOnPrompt(garments.map((g) => ({ slot: g.slot, leaf: g.leaf }))),
      images: [
        { data: person, mimeType: "image/png" },
        ...garmentJpegs.map((data) => ({ data, mimeType: "image/jpeg" })),
      ],
    });

    const rendered = legacyCutout
      ? await stripBackgroundToTransparent(generated.image.toString("base64"), generated.mimeType).then(
          (stripped) => ({ mimeType: stripped.mimeType as string, base64: stripped.imageBase64 })
        )
      : { mimeType: generated.mimeType, base64: generated.image.toString("base64") };

    // The real cost comes from the token counts Google returned for this exact call. Only a
    // response that omitted them falls back to the estimate, so a render is never free.
    const costNanos = generated.usage
      ? geminiImageCostNanos(generated.usage)
      : estimateTryOnCostNanos(garments.length);

    return {
      imageUrl: `data:${rendered.mimeType};base64,${rendered.base64}`,
      garmentCount: garments.length,
      costNanos,
    };
  } catch (err) {
    if (err instanceof PersonaAgentError || err instanceof GeminiImageError) throw err;
    console.error("[try-on generateTryOnImage] failed", err);
    throw new PersonaAgentError("Failed to generate the try-on render. Please try again.", "internal");
  }
}
