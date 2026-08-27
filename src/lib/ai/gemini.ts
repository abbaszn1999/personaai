import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { getCachedProductImage } from "@/lib/images/product-image";

/** Default output resolution; override per-deployment via GEMINI_IMAGE_SIZE. */
const DEFAULT_IMAGE_SIZE = "1K";

const DEFAULT_MODEL = "gemini-3-pro-image-preview";

/** Writes the enriched description. Deliberately a different model from the embedding one:
 *  a model that describes an image well is not the same tool as a model that places it in a
 *  vector space, and using one for both jobs makes the description's quality unmeasurable. */
const ENRICHMENT_MODEL = process.env.GEMINI_ENRICHMENT_MODEL ?? "gemini-3.6-flash";

const EMBEDDING_MODEL = "gemini-embedding-2";

/** MRL-truncated from the model's native size. 768 half-precision dims is ~1.5 KB per
 *  product — roughly 9 MB for a 6,000-SKU catalog — while retaining almost all of the
 *  retrieval quality of the full-width vector. */
const EMBEDDING_DIMENSIONS = 768;

/** Downscale ceiling for images sent to the embedding endpoint. The model sees a compressed
 *  representation regardless, so full-resolution photos buy nothing and cost bandwidth. */
const EMBEDDING_IMAGE_MAX_PX = 768;

export class GeminiApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "GeminiApiError";
  }
}

/**
 * True when a call failed because the account has no quota or credit left, rather than because
 * anything was wrong with the request.
 *
 * Callers that retry per item need this distinction: an exhausted account fails *every* item
 * identically, so counting those failures against a per-item attempt limit retires the entire
 * workload over a billing problem that has nothing to do with the items themselves.
 *
 * The SDK does not surface a stable code on every path, so this matches the status when present
 * and falls back to the serialised error body.
 */
export function isQuotaExhaustedError(err: unknown): boolean {
  if (err instanceof GeminiApiError && err.status === 429) return true;
  if (!(err instanceof Error)) return false;
  const message = err.message;
  return (
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("credits are depleted") ||
    /"code"\s*:\s*429/.test(message) ||
    message.includes("quota")
  );
}

export type GeminiImagePart = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

/**
 * Clients are cached per API key, never as a single module-level singleton — chat runs on each
 * merchant's own BYO key, so one shared client would send one merchant's requests under
 * another's credentials. Bounded and LRU-evicted so a large tenant count can't grow it without
 * limit.
 */
const clientCache = new Map<string, GoogleGenAI>();
const MAX_CACHED_CLIENTS = 50;

export function getGeminiClient(apiKey: string): GoogleGenAI {
  if (!apiKey) {
    throw new GeminiApiError("No Gemini API key was provided.");
  }

  const cached = clientCache.get(apiKey);
  if (cached) {
    // Re-insert to move this key to the most-recently-used end of the iteration order.
    clientCache.delete(apiKey);
    clientCache.set(apiKey, cached);
    return cached;
  }

  const client = new GoogleGenAI({ apiKey });
  clientCache.set(apiKey, client);

  if (clientCache.size > MAX_CACHED_CLIENTS) {
    const oldest = clientCache.keys().next().value;
    if (oldest !== undefined) clientCache.delete(oldest);
  }

  return client;
}

/** The platform's own key: try-on image generation plus index-time enrichment and embedding. */
export function getPlatformGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiApiError("Gemini API key is not configured (GEMINI_API_KEY).");
  }
  return getGeminiClient(apiKey);
}

/**
 * Calls Nano Banana Pro (Gemini 3 Pro Image) via the stable `models.generateContent` API with
 * a mix of text and reference-image parts, and returns the single generated image.
 *
 * Deliberately uses `models.generateContent`, not the newer `interactions.create` API — the
 * Interactions API is still Beta ("subject to breaking changes" per its own docs) and in
 * practice rejects `response_format.delivery: "inline"` for images with a 400 even though the
 * SDK types and docs both list it as valid. `generateContent` is the same stable surface every
 * official example/guide for this model actually uses.
 */
export async function generateGeminiImage(
  input: GeminiImagePart[],
  opts?: { aspectRatio?: string }
): Promise<{ imageBase64: string; mimeType: string }> {
  const ai = getPlatformGeminiClient();
  const model = process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL;
  const imageSize = process.env.GEMINI_IMAGE_SIZE ?? DEFAULT_IMAGE_SIZE;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: input.map((part) =>
            part.type === "text" ? { text: part.text } : { inlineData: { data: part.data, mimeType: part.mimeType } }
          ),
        },
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: opts?.aspectRatio,
          imageSize,
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data);

    if (!imagePart?.inlineData?.data) {
      throw new GeminiApiError("Gemini did not return an image for this request.");
    }

    return {
      imageBase64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType ?? "image/png",
    };
  } catch (err) {
    if (err instanceof GeminiApiError) throw err;
    const message = err instanceof Error ? err.message : "Gemini image generation failed.";
    throw new GeminiApiError(message);
  }
}

/** Fetches a remote image (e.g. a product photo) and base64-encodes it for use as a Gemini reference image. */
export async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new GeminiApiError(`Failed to fetch reference image (${res.status}): ${url}`, res.status);
  }
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { data: buffer.toString("base64"), mimeType };
}

/**
 * Fetches a product photo and transcodes it to downscaled JPEG.
 *
 * Not optional: the embedding endpoint accepts **PNG and JPEG only**, which is narrower than
 * `generateContent` — the same WebP URL that enrichment reads happily is rejected here. Most
 * modern storefronts (Shopify included) serve WebP by default, so without this step
 * essentially every product would silently fail to embed.
 *
 * Returns null rather than throwing, so a single unreachable or corrupt image degrades that
 * product to a text-only vector instead of failing its whole batch.
 */
async function fetchImageAsJpeg(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const source = Buffer.from(await res.arrayBuffer());
    const jpeg = await sharp(source)
      .rotate()
      .resize({ width: EMBEDDING_IMAGE_MAX_PX, height: EMBEDDING_IMAGE_MAX_PX, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

    return { data: jpeg.toString("base64"), mimeType: "image/jpeg" };
  } catch (err) {
    console.error("[gemini fetchImageAsJpeg]", url, err);
    return null;
  }
}

/**
 * Downscale target for candidate images sent to the bundle vision call.
 *
 * `generateContent`'s real inline-request cap is 100MB, not the 20MB this comment used to
 * assume — verified directly against Google's current docs for this exact endpoint, which the
 * January 2026 increase applies to. At that ceiling, request size stops being the binding
 * constraint; the model's own ~3,000-images-per-prompt limit is. That headroom is spent on
 * more candidate images per category (see `CANDIDATES_PER_CATEGORY` in
 * `persona/modes/bundle/run.ts`) rather than on higher per-image resolution — judging colour,
 * texture and silhouette coherence across ~100 candidates needs more images in frame, not
 * sharper ones, so this stays at a size chosen for headroom, not fidelity.
 */
const VISION_IMAGE_MAX_PX = 512;

const VISION_IMAGE_QUALITY = 70;

/** Encoded images keyed by URL. A shopper refining a bundle sees the same catalog images
 *  repeatedly, and re-fetching plus re-encoding 100 photos on every refinement turn is the
 *  difference between a responsive follow-up and a visibly slow one. */
const visionImageCache = new Map<string, { data: string; mimeType: string }>();
const MAX_CACHED_VISION_IMAGES = 500;

/** Fetches and downscales one product photo for a vision prompt. Returns null on failure so a
 *  single bad image costs one candidate rather than the whole call. */
export async function encodeImageForVision(url: string): Promise<{ data: string; mimeType: string } | null> {
  const cached = visionImageCache.get(url);
  if (cached) {
    visionImageCache.delete(url);
    visionImageCache.set(url, cached);
    return cached;
  }

  try {
    // Shared with `/api/product-image`: when the stylist has already fetched a merchant image,
    // the shopper's preview is served from memory instead of hitting the struggling origin
    // again. The extra resize keeps the vision payload at its intentionally smaller setting.
    const source = await getCachedProductImage(url);
    if (!source) return null;
    const jpeg = await sharp(source.body)
      .rotate()
      .resize({ width: VISION_IMAGE_MAX_PX, height: VISION_IMAGE_MAX_PX, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: VISION_IMAGE_QUALITY })
      .toBuffer();

    const encoded = { data: jpeg.toString("base64"), mimeType: "image/jpeg" };
    visionImageCache.set(url, encoded);

    if (visionImageCache.size > MAX_CACHED_VISION_IMAGES) {
      const oldest = visionImageCache.keys().next().value;
      if (oldest !== undefined) visionImageCache.delete(oldest);
    }

    return encoded;
  } catch (err) {
    console.error("[gemini encodeImageForVision]", url, err);
    return null;
  }
}

export interface ProductEnrichmentInput {
  title: string;
  /** The merchant's own description, passed through so the model works from stated facts
   *  rather than guessing them off a compressed photo. */
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  imageUrl?: string | null;
}

const ENRICHMENT_INSTRUCTIONS = [
  "You are writing the searchable description for one product in a fashion catalog.",
  "Write ONE dense paragraph of 60-120 words covering, in natural prose:",
  "- colour and exact shade, and any pattern",
  "- material and texture, and how it appears to drape or hold shape",
  "- cut, silhouette, fit, and length",
  "- construction details a shopper would notice (closures, hardware, pockets, stitching, trims)",
  "- what the item is actually for: occasion, season, formality, and what it would be worn with",
  "Rules:",
  "- Use the supplied title and description as facts. Never contradict them.",
  "- Describe only what you can see or what is stated. Never invent a brand story, a price, or a material you cannot support.",
  "- No marketing language, no bullet points, no headings, no preamble. Return the paragraph only.",
].join("\n");

/**
 * Turns a product image plus its merchant text into one rich description.
 *
 * This exists because thin source data is the norm, not the exception, and it is exactly
 * where retrieval fails today: a belt whose entire description is "Signature metal and enamel
 * moon clasp / Width 3.5 cm / Leather" gives semantic search almost nothing to rank against.
 * The enriched paragraph is what the vector is actually built from.
 *
 * Deliberately returns prose rather than extracted attributes. Enumerated tags would need a
 * column each, would be filterable only where the model was confident, and would flatten the
 * distinctions ("the exact shade of grey, the cut, the drape") that make visual search worth
 * doing at all.
 */
export async function analyzeProductImage(input: ProductEnrichmentInput): Promise<string> {
  const ai = getPlatformGeminiClient();

  const facts = [
    `Title: ${input.title}`,
    input.brand ? `Brand: ${input.brand}` : null,
    input.category ? `Category: ${input.category}` : null,
    input.description?.trim() ? `Merchant description: ${input.description.trim().slice(0, 1200)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

  if (input.imageUrl) {
    // Enrichment reads the merchant's image as served — unlike embedding, `generateContent`
    // accepts WebP, so there's no need to transcode on this path.
    try {
      const image = await fetchImageAsBase64(input.imageUrl);
      parts.push({ inlineData: image });
    } catch (err) {
      console.error("[gemini analyzeProductImage image fetch]", input.imageUrl, err);
    }
  }

  parts.push({ text: `${ENRICHMENT_INSTRUCTIONS}\n\nProduct facts:\n${facts}` });

  try {
    const response = await ai.models.generateContent({
      model: ENRICHMENT_MODEL,
      contents: [{ role: "user", parts }],
    });

    const text = response.text?.trim();
    if (!text) {
      throw new GeminiApiError(`Enrichment returned no description for "${input.title}".`);
    }
    return text;
  } catch (err) {
    if (err instanceof GeminiApiError) throw err;
    const message = err instanceof Error ? err.message : "Product enrichment failed.";
    // Carry the status through so callers can tell an exhausted account from a bad product.
    throw new GeminiApiError(message, isQuotaExhaustedError(err) ? 429 : undefined);
  }
}

export interface ProductEmbeddingInput {
  title: string;
  enrichedDescription: string;
  brand?: string | null;
  category?: string | null;
  subcategory?: string | null;
  imageUrl?: string | null;
}

/**
 * `gemini-embedding-2` does not accept a `task_type` — unlike `gemini-embedding-001`, the
 * task has to be expressed as a text prefix, and Google is explicit that the convention must
 * match on both sides or the vectors aren't comparable. Documents use the title/text
 * structure; queries use the search-result prefix. Getting this wrong degrades ranking
 * silently, which is the same failure class as a stale vector: nothing errors, results are
 * just quietly worse.
 */
function toDocumentText(input: ProductEmbeddingInput): string {
  const body = [
    input.brand ? `Brand: ${input.brand}.` : null,
    input.category ? `Category: ${[input.category, input.subcategory].filter(Boolean).join(" / ")}.` : null,
    input.enrichedDescription,
  ]
    .filter(Boolean)
    .join(" ");

  return `title: ${input.title} | text: ${body}`;
}

export function toQueryText(statement: string): string {
  return `task: search result | query: ${statement}`;
}

/**
 * Builds the single fused vector for a product: image and enriched text embedded together
 * into one aggregated embedding, not two vectors averaged after the fact.
 *
 * Excluded from the input deliberately: price, stock, SKU and ids (numbers embed poorly and
 * price is a filter column, so it would only add noise), and the merchant's raw marketing
 * copy (boilerplate repeated across a whole catalog dilutes what makes each item distinct).
 */
export async function embedProductFused(input: ProductEmbeddingInput): Promise<number[]> {
  const ai = getPlatformGeminiClient();

  const contents: Array<string | { inlineData: { data: string; mimeType: string } }> = [toDocumentText(input)];

  if (input.imageUrl) {
    const image = await fetchImageAsJpeg(input.imageUrl);
    if (image) contents.push({ inlineData: image });
  }

  return runEmbedding(ai, contents, `product "${input.title}"`);
}

/**
 * Embeds a cosine query statement on the merchant's key, since it is a per-shopper-turn call.
 * Text-only, and prefixed to match how documents were embedded.
 */
export async function embedQueryStatement(statement: string, apiKey: string): Promise<number[]> {
  const ai = getGeminiClient(apiKey);
  return runEmbedding(ai, [toQueryText(statement)], "query statement");
}

async function runEmbedding(
  ai: GoogleGenAI,
  contents: Array<string | { inlineData: { data: string; mimeType: string } }>,
  label: string
): Promise<number[]> {
  try {
    // Multiple entries in `contents` produce ONE aggregated embedding; wrapping each in its
    // own Content object would return a separate vector per input instead, which is the
    // opposite of the fusion this depends on.
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents,
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });

    const values = response.embeddings?.[0]?.values;
    if (!values || values.length !== EMBEDDING_DIMENSIONS) {
      throw new GeminiApiError(`Embedding for ${label} returned ${values?.length ?? 0} dims, expected ${EMBEDDING_DIMENSIONS}.`);
    }

    return values;
  } catch (err) {
    if (err instanceof GeminiApiError) throw err;
    const message = err instanceof Error ? err.message : `Embedding failed for ${label}.`;
    throw new GeminiApiError(message);
  }
}
