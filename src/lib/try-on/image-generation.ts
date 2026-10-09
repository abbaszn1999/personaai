import sharp from "sharp";
import { editPrunaImage, PrunaApiError, uploadPrunaFile } from "@/lib/ai/pruna";
import { editGeminiImage, GeminiImageError } from "@/lib/ai/gemini-image";
import { flattenOntoChromaKey, stripBackgroundToTransparent } from "@/lib/ai/background-removal";
import { estimateTryOnCostNanos, geminiImageCostNanos } from "@/lib/billing/pricing";
import { buildTryOnPrompt } from "@/lib/try-on/prompt";
import { AVATAR_STYLE_LABELS } from "@/modules/wearable-agent/constants";
import type { AvatarVariation } from "@/modules/wearable-agent/types";
import type { GarmentCategory } from "@/modules/wearable-agent/utils/fit-metrics";

export class PersonaAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersonaAgentError";
  }
}

/**
 * Matches the 3-slide "Choose your avatar" carousel and the 3 fixed backdrop plates it uses — a
 * fixed product/layout decision (like the 2K image size), not an env-tunable model parameter.
 */
export const DEFAULT_AVATAR_VARIATION_COUNT = 3;

const AVATAR_ASPECT_RATIO = "3:4";

/**
 * Each variation gets a genuinely different outfit so the 3 results aren't 3 copies of the same
 * look. Casual, sport and formal are deliberately three distinct registers (earlier sets with
 * a blazer, a suit and an evening look read as several near-identical navy suits). This order is
 * also the order of the carousel slides.
 */
const AVATAR_STYLES = [
  {
    label: AVATAR_STYLE_LABELS[0],
    styleHint:
      "a relaxed everyday casual outfit in neutral tones: a plain well-fitting crew-neck sweater or t-shirt, straight-leg trousers or jeans, and clean white sneakers",
  },
  {
    label: AVATAR_STYLE_LABELS[1],
    styleHint:
      "a sporty athletic outfit: a fitted performance top, matching training joggers or track pants, and running sneakers",
  },
  {
    label: AVATAR_STYLE_LABELS[2],
    styleHint:
      "a classic formal suit: a navy two-piece suit with a white dress shirt, a tie, and black leather dress shoes",
  },
] as const;

/** Each fixed backdrop plate pairs 1:1 with the avatar style at the same index. */
function backdropPathForIndex(index: number): string {
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
  outfit: string
): string {
  // A child is described by age, height and weight — nobody has a child's chest and waist to hand,
  // and "age" is what tells the model to draw a child's proportions rather than a small adult's.
  const body =
    input.ageYears !== undefined
      ? `The subject is a child aged ${input.ageYears === 0 ? "under 1 year" : `${input.ageYears} year${input.ageYears === 1 ? "" : "s"}`}, so render a child's face shape and proportions, not a small adult. The body must reflect these measurements: ${input.heightCm} cm tall, ${input.weightKg} kg, shoe size EU ${input.shoeSizeEu} — not a generic average body.`
      : `The body must reflect these measurements: ${input.heightCm} cm tall, ${input.weightKg} kg, chest ${input.chestCm} cm, waist ${input.waistCm} cm, shoe size EU ${input.shoeSizeEu} — not a generic average body.`;

  return [
    "Create a full-body studio avatar of the person in the reference photo.",
    "IDENTITY: Use the reference photo only to know who this person is. Keep their exact face and facial structure, skin tone, hair and hairstyle, and facial hair identical, with no beautification, slimming, smoothing or ageing. It must be recognisably the same person.",
    "IGNORE everything else in the reference photo: its pose, any hand or arm position (for example a hand on the chin, cheek or face), head tilt, crop and framing, clothing, eyeglasses, sunglasses, watches, jewelry and every other accessory, lighting and coloured light, background, and colour grading.",
    "POSE (identical for every avatar): standing upright and perfectly straight, facing the camera head-on and symmetrical, head level with the chin parallel to the floor, eyes looking straight into the lens, a calm natural expression with a very slight smile. Both arms hang naturally straight down at the sides with the hands relaxed and fully visible beside the thighs — empty hands, nothing held, no hand touching the face or body. Feet flat on the floor, about shoulder-width apart, toes pointing forward.",
    "FRAMING: the whole body from the top of the head to the soles of both shoes, nothing cropped, centered, with a small margin above the head and below the feet. Straight-on camera at chest height, no tilt and no wide-angle distortion, like a clean e-commerce catalog photo.",
    `BODY: ${body}`,
    `OUTFIT: dressed in ${outfit}. Nothing else is worn or carried: no eyeglasses or sunglasses (bare face, even if the person wears glasses in the reference), no hat or cap, no watch, bracelet, necklace, earrings, rings, scarf, belt buckle logos, bag, headphones or any other accessory.`,
    "LIGHTING: soft, even, neutral white studio light with realistic skin texture. The image must be completely clean and clear: no coloured lights, no rim light, no reflections, glare, shine, highlights or light leaks, no colour cast, glow, stains or blotches, and no pink, red, blue or magenta tint or light spill on the skin, hair, clothing or background — even if the reference photo has coloured lighting, reflections or shine on the face, discard all of it and render the face and skin evenly and naturally lit.",
    "BACKGROUND: a single flat, uniform, seamless solid #FF00FF (pure magenta) covering 100% of the space around the subject, with no gradients, shadows, floor, props or texture.",
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
  if (stylesToUse.length === 0) return;

  // Uploaded once and shared by every variation: the reference photo is identical across the
  // batch, so re-uploading it per style would cost one round trip per style for one file. An upload
  // failure here is fatal to the whole batch by definition — there is nothing to generate
  // from — so it's reported as a per-variation error for each style rather than thrown, to
  // keep the streaming contract (callers treat a thrown error as "the request broke").
  let photoUrl: string;
  try {
    photoUrl = await uploadPrunaFile(
      Buffer.from(input.photoBase64, "base64"),
      "face.jpg",
      input.photoMimeType
    );
  } catch (err) {
    console.error("[try-on generateAvatarVariationsStream] photo upload failed", err);
    const message =
      err instanceof PrunaApiError ? err.message : "Couldn't upload your photo. Please try again.";
    for (const style of stylesToUse) {
      yield { type: "variation_error", label: style.label, message };
    }
    return;
  }

  const pending = new Map<number, { label: string; promise: Promise<AvatarVariation> }>(
    stylesToUse.map((style, index) => [
      index,
      {
        label: style.label,
        promise: (async (): Promise<AvatarVariation> => {
          const generated = await editPrunaImage({
            prompt: buildAvatarPrompt(input, style.styleHint),
            imageUrls: [photoUrl],
            aspectRatio: AVATAR_ASPECT_RATIO,
          });
          const stripped = await stripBackgroundToTransparent(
            generated.image.toString("base64"),
            generated.mimeType
          );

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
      console.error("[try-on generateAvatarVariationsStream] a variation failed", err);
      yield {
        type: "variation_error",
        label: slot.label,
        message: err instanceof PrunaApiError ? err.message : "This variation failed to generate.",
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

/** Reads a `data:` URL or a remote image URL into raw bytes. */
async function readImageBytes(urlOrDataUrl: string): Promise<Buffer> {
  const dataUrlMatch = /^data:[^;]+;base64,(.+)$/.exec(urlOrDataUrl);
  if (dataUrlMatch) {
    return Buffer.from(dataUrlMatch[1], "base64");
  }

  const res = await fetch(urlOrDataUrl);
  if (!res.ok) {
    throw new PersonaAgentError(`Couldn't load a reference image (${res.status}).`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Fetches one garment reference and transcodes it to JPEG.
 *
 * The transcode is the point: most storefronts serve WebP and many block hotlinking, so the
 * model is sent the bytes rather than the merchant's URL, and the render's success does not
 * depend on the merchant's CDN policy. It also applies EXIF rotation, so the model sees the
 * garment the way a shopper does.
 */
async function loadGarmentReference(imageUrl: string): Promise<Buffer> {
  const source = await readImageBytes(imageUrl);
  return sharp(source).rotate().jpeg({ quality: 92 }).toBuffer();
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
 * The avatar is re-keyed onto its magenta plate on the way in and cut back out on the way
 * out; see flattenOntoChromaKey for why a stored transparent PNG can't be sent as-is.
 */
export async function generateTryOnImage(
  input: GenerateTryOnImageInput
): Promise<{ imageUrl: string; garmentCount: number; costNanos: number }> {
  const garments = mergeOutfitGarments(input.kept, input.added);
  if (garments.length === 0) {
    throw new PersonaAgentError("At least one garment is required for a try-on render.");
  }

  try {
    const avatarBytes = await readImageBytes(input.avatarImageUrl);
    const [person, garmentJpegs] = await Promise.all([
      flattenOntoChromaKey(avatarBytes.toString("base64")),
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

    const stripped = await stripBackgroundToTransparent(
      generated.image.toString("base64"),
      generated.mimeType
    );

    // The real cost comes from the token counts Google returned for this exact call. Only a
    // response that omitted them falls back to the estimate, so a render is never free.
    const costNanos = generated.usage
      ? geminiImageCostNanos(generated.usage)
      : estimateTryOnCostNanos(garments.length);

    return {
      imageUrl: `data:${stripped.mimeType};base64,${stripped.imageBase64}`,
      garmentCount: garments.length,
      costNanos,
    };
  } catch (err) {
    if (err instanceof PersonaAgentError || err instanceof GeminiImageError) throw err;
    console.error("[try-on generateTryOnImage] failed", err);
    throw new PersonaAgentError("Failed to generate the try-on render. Please try again.");
  }
}
