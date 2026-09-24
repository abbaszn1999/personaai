import sharp from "sharp";
import {
  editPrunaImage,
  MAX_TRY_ON_GARMENTS,
  PrunaApiError,
  prunaTryOn,
  uploadPrunaFile,
} from "@/lib/ai/pruna";
import { flattenOntoChromaKey, stripBackgroundToTransparent } from "@/lib/ai/background-removal";
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
  return `/avatars/backgrounds/backdrop-${index + 1}.webp`;
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
  if (stylesToUse.length === 0) return;

  const bodyInstruction = buildIdentityAndBodyInstruction(input);

  // Uploaded once and shared by every variation: the reference photo is identical across the
  // batch, so re-uploading it per style would cost four round trips for one file. An upload
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
    console.error("[persona-agent generateAvatarVariationsStream] photo upload failed", err);
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
            prompt: `${bodyInstruction} Full-body standing studio pose, ${style.styleHint}.`,
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
      console.error("[persona-agent generateAvatarVariationsStream] a variation failed", err);
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
  imageUrl: string;
}

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
 * Uploads one garment reference, transcoded to JPEG.
 *
 * The transcode is the point: catalog images could be passed to Pruna by their public URL and
 * skip this upload entirely, but most storefronts serve WebP and many block hotlinking, so
 * handing over the merchant's URL makes the render's success depend on the merchant's CDN
 * policy. Normalising the bytes here trades one upload for a reference the model is certain to
 * be able to read.
 */
async function uploadGarmentReference(imageUrl: string, index: number): Promise<string> {
  const source = await readImageBytes(imageUrl);
  const jpeg = await sharp(source).rotate().jpeg({ quality: 92 }).toBuffer();
  return uploadPrunaFile(jpeg, `garment-${index}.jpg`, "image/jpeg");
}

/**
 * Collapses a kept-vs-added diff into the single outfit to render.
 *
 * Try-on takes the whole outfit at once rather than a description of what changed, so the diff
 * the agent reasons in is flattened here. `added` wins on a slot collision: replacing the
 * shoes means the new shoes are worn, not both pairs — and Pruna rejects two references of the
 * same category in one request, so letting a stale item survive would fail the call outright.
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
): Promise<{ imageUrl: string; garmentCount: number }> {
  const garments = mergeOutfitGarments(input.kept, input.added);
  if (garments.length === 0) {
    throw new PersonaAgentError("At least one garment is required for a try-on render.");
  }

  try {
    const avatarBytes = await readImageBytes(input.avatarImageUrl);
    const [personImageUrl, garmentImageUrls] = await Promise.all([
      flattenOntoChromaKey(avatarBytes.toString("base64")).then((plated) =>
        uploadPrunaFile(plated, "avatar.png", "image/png")
      ),
      Promise.all(garments.map((g, index) => uploadGarmentReference(g.imageUrl, index))),
    ]);

    const generated = await prunaTryOn({ personImageUrl, garmentImageUrls });
    const stripped = await stripBackgroundToTransparent(
      generated.image.toString("base64"),
      generated.mimeType
    );

    return {
      imageUrl: `data:${stripped.mimeType};base64,${stripped.imageBase64}`,
      garmentCount: garments.length,
    };
  } catch (err) {
    if (err instanceof PersonaAgentError) throw err;
    const message =
      err instanceof PrunaApiError ? err.message : "Failed to generate the try-on render. Please try again.";
    throw new PersonaAgentError(message);
  }
}
