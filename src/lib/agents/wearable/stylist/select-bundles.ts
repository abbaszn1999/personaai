import { MediaResolution, type Part } from "@google/genai";
import { encodeImageForVision, getGeminiClient } from "@/lib/ai/gemini";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import { loadSkill, renderSkill } from "../load-skill";

/**
 * The stylist: given pre-narrowed candidates per category, decides which of them belong in the
 * same outfit.
 *
 * Its own agent rather than part of persona's bundle mode because the judgement is separable
 * from the conversation around it. Persona decides *which* categories still need filling and
 * what to do with the result; this decides only what goes with what. It deliberately knows
 * nothing about retrieval state, hard rules or the shopper's turn history — the caller passes
 * everything in and enforces its own rules on the way out.
 */

/** How many distinct combinations to ask for. A single "best" answer is a recommendation the
 *  shopper can only accept or reject; several give them an actual choice. */
export const BUNDLE_OPTIONS = 5;

const BUNDLE_MODEL = process.env.GEMINI_CHAT_MODEL ?? "gemini-3.6-flash";

/**
 * Set explicitly rather than inherited. This is the main cost and latency dial for a call
 * carrying ~100 images, and leaving it at the default quietly makes the most expensive call in
 * the system more expensive than it needs to be. Medium is enough to judge colour, texture and
 * silhouette coherence, which is all this call is being asked to do.
 */
const BUNDLE_MEDIA_RESOLUTION = MediaResolution.MEDIA_RESOLUTION_MEDIUM;
/** Prevents one bundle turn from opening hundreds of simultaneous connections to a merchant
 * image host. Candidate count is unchanged; only image-download concurrency is bounded. */
const IMAGE_FETCH_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++;
        results[index] = await mapper(values[index]);
      }
    })
  );
  return results;
}

/**
 * Defined here rather than alongside persona's `buildCandidatePools` so the dependency runs
 * caller-to-callee: persona imports the stylist's input type, not the other way round.
 */
export interface BundleCandidatePool {
  category: string;
  candidates: CatalogCandidate[];
}

/** A proposal, before the caller applies its own merchant rules. */
export interface StyledBundle {
  items: CatalogCandidate[];
  rationale: string;
}

export interface SelectBundlesInput {
  query: string;
  /** The merchant's soft taste guidance. Leans the choices; never excludes anything. */
  styleGuide: string | null;
  apiKey: string;
  pools: BundleCandidatePool[];
  /** Already chosen, and present in every returned bundle. */
  anchor: CatalogCandidate | null;
}

const bundleSchema = {
  type: "object",
  properties: {
    bundles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "string" },
            description: "One label per category, exactly as written in brackets, e.g. tops-0.",
          },
          rationale: { type: "string", description: "One or two sentences on why these work together." },
        },
        required: ["items", "rationale"],
      },
    },
  },
};

interface VisionBundle {
  items: string[];
  rationale: string;
}

/**
 * The two conditional lines of the prompt.
 *
 * Composed here rather than written into `style-bundle.md` because each is present or absent
 * depending on the turn, and the renderer only drops a line that is nothing but a placeholder.
 * Their wording belongs with the rest of the prompt; this is the seam that syntax forces.
 */
function anchorLine(anchor: CatalogCandidate): string {
  return `Already chosen and fixed — every outfit must be built around it: "${anchor.title}". Its image is first.`;
}

function styleGuideLine(styleGuide: string): string {
  return `The store's aesthetic, which should lean your choices: ${styleGuide}`;
}

/** The bracketed label the model refers to each candidate by, and which maps its answer back. */
function label(pool: BundleCandidatePool, index: number): string {
  return `${pool.category}-${index}`;
}

export function buildVisionPrompt(input: SelectBundlesInput): string {
  const catalogue = input.pools
    .map((pool) => {
      const lines = pool.candidates
        .map(
          (candidate, index) =>
            `  [${label(pool, index)}] ${candidate.title}${candidate.brand ? ` — ${candidate.brand}` : ""}${candidate.price !== null ? ` — ${candidate.price}` : ""}`
        )
        .join("\n");
      return `${pool.category}:\n${lines}`;
    })
    .join("\n\n");

  return renderSkill(loadSkill("stylist/skills/style-bundle.md").body, {
    query: input.query,
    anchorLabel: input.anchor ? anchorLine(input.anchor) : "",
    styleGuide: input.styleGuide ? styleGuideLine(input.styleGuide) : "",
    catalogue,
    bundleOptions: String(BUNDLE_OPTIONS),
  });
}

/**
 * Proposes complete outfits from the candidate pools.
 *
 * Returns the model's proposals resolved back to real candidates, and nothing more — no
 * merchant rules are applied here. Enforcing those is the caller's job, because they belong to
 * the store rather than to the styling judgement, and mixing the two would let a rule change
 * look like a styling regression.
 */
export async function selectBundles(input: SelectBundlesInput): Promise<StyledBundle[]> {
  const labelled: Array<{ label: string; candidate: CatalogCandidate }> = input.pools.flatMap((pool) =>
    pool.candidates.map((candidate, index) => ({ label: label(pool, index), candidate }))
  );

  // Bounded concurrency keeps the merchant origin responsive for the shopper's own preview
  // requests. The shared image cache means successful downloads still feed both Gemini and UI.
  const imageUrls = [
    ...(input.anchor?.imageUrl ? [input.anchor.imageUrl] : []),
    ...labelled.map((entry) => entry.candidate.imageUrl),
  ].filter((url): url is string => Boolean(url));
  const images = await mapWithConcurrency(
    imageUrls,
    IMAGE_FETCH_CONCURRENCY,
    (url) => encodeImageForVision(url)
  );

  const parts: Part[] = [{ text: buildVisionPrompt(input) }];
  for (const image of images) {
    if (image) parts.push({ inlineData: image });
  }

  try {
    const ai = getGeminiClient(input.apiKey);
    const response = await ai.models.generateContent({
      model: BUNDLE_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        mediaResolution: BUNDLE_MEDIA_RESOLUTION,
        responseMimeType: "application/json",
        responseJsonSchema: bundleSchema,
      },
    });

    const parsed = JSON.parse(response.text ?? "{}") as { bundles?: VisionBundle[] };
    const byLabel = new Map(labelled.map((entry) => [entry.label, entry.candidate]));

    return (parsed.bundles ?? [])
      .map((bundle) => {
        const items = bundle.items
          .map((name) => byLabel.get(name))
          .filter((candidate): candidate is CatalogCandidate => candidate !== undefined);
        return { items: input.anchor ? [input.anchor, ...items] : items, rationale: bundle.rationale };
      })
      // A bundle missing a category is an incomplete outfit, not a minimal one — the model
      // hallucinated or dropped a label, and showing it would look like the agent forgot.
      .filter((bundle) => bundle.items.length >= input.pools.length);
  } catch (err) {
    console.error("[stylist selectBundles]", err);
    return [];
  }
}
