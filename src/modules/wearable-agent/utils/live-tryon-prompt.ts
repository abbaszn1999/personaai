import type { Product } from "@/modules/commerce/types";
import { resolveGarmentSlot } from "./fit-metrics";

/**
 * Decart caps a try-on prompt at roughly 750 characters of English and rejects anything longer,
 * with enhancement on or off. Stay well under it so the wording of a long product name can't tip
 * a request into an error.
 */
export const LIVE_TRYON_PROMPT_MAX_CHARS = 600;

/** The product description is marketing copy, not a look at the picture: keep only its opening. */
const DESCRIPTION_MAX_CHARS = 220;

const HEADWEAR = /\b(hat|cap|beanie|headwear|bonnet|beret|fedora)\b/i;
const NECKLACE = /\b(necklace|pendant|choker)\b/i;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** First sentence of the description, cut at a word boundary if it still runs long. */
function descriptionLead(description: string): string {
  const text = plainText(description);
  if (!text) return "";
  const sentence = text.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? text;
  if (sentence.length <= DESCRIPTION_MAX_CHARS) return sentence.replace(/[.!?]+$/, "");
  const cut = sentence.slice(0, DESCRIPTION_MAX_CHARS);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[\s,;:.-]+$/, "");
}

/**
 * The opening of the sentence, in the wording Decart's VTON prompting guide uses: one action
 * ("Substitute" for a worn region, "Add" for something on top), naming the region it changes.
 */
function lead(product: Product): { phrase: string; replaces: boolean } {
  const slot = resolveGarmentSlot(product);
  const text = `${product.name} ${product.description}`;
  switch (slot) {
    case "top":
    case "outerwear":
      return { phrase: "Substitute the upper body garment with", replaces: true };
    case "bottom":
      return { phrase: "Substitute the lower body garment with", replaces: true };
    case "dress":
      return { phrase: "Substitute the outfit with", replaces: true };
    case "shoes":
      return { phrase: "Substitute the footwear with", replaces: true };
    default:
      if (HEADWEAR.test(text)) return { phrase: "Substitute the hat with", replaces: true };
      if (NECKLACE.test(product.name)) return { phrase: "Substitute the necklace with", replaces: true };
      // A bag, scarf, belt or similar sits on top of what the shopper already wears.
      return { phrase: "Add", replaces: false };
  }
}

/**
 * The text half of a live try-on `set()` call. The reference image is the source of truth for the
 * garment, so this names the item and the region and leaves it at that. It does not ask for
 * anything else, such as keeping the person's identity: Decart advises against unrelated requests.
 */
export function buildLiveTryOnPrompt(product: Product): string {
  const { phrase, replaces } = lead(product);
  const name = plainText(product.name);
  const detail = descriptionLead(product.description);
  const item = [name, detail].filter(Boolean).join(", ");
  const sentence = replaces ? `${phrase} ${item}.` : `${phrase} ${item} to the outfit.`;
  if (sentence.length <= LIVE_TRYON_PROMPT_MAX_CHARS) return sentence;
  // A very long product name: drop the description, then cut the name itself.
  const room = LIVE_TRYON_PROMPT_MAX_CHARS - phrase.length - (replaces ? 4 : 16);
  const shortName = name.length > room ? name.slice(0, Math.max(room, 20)).trim() : name;
  return replaces ? `${phrase} ${shortName}.` : `${phrase} ${shortName} to the outfit.`;
}
