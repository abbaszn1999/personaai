import type { Product } from "@/modules/commerce/types";

/**
 * Decart caps a try-on prompt at roughly 750 characters of English and rejects anything longer,
 * with enhancement on or off. Stay well under it so a long list of long product names can't tip
 * a request into an error.
 */
export const LIVE_TRYON_PROMPT_MAX_CHARS = 600;

const OPENING = "Substitute the outfit with";
/** A single name is never allowed past this, so one very long title can't crowd out the others. */
const NAME_MAX_CHARS = 90;

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

function shortName(name: string): string {
  const text = plainText(name).replace(/[.!?]+$/, "");
  if (text.length <= NAME_MAX_CHARS) return text;
  const cut = text.slice(0, NAME_MAX_CHARS);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 20)).replace(/[\s,;:.-]+$/, "");
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The text half of a live try-on `set()` call. The reference picture is the shopper's avatar
 * already wearing the look, so the prompt only names what the look is made of, in the wording of
 * Decart's VTON prompting guide ("Substitute the outfit with ..."). It asks for nothing else, such
 * as keeping the person's identity: Decart advises against unrelated requests.
 *
 * Returns an empty string when the look has no usable items.
 */
export function buildLookTryOnPrompt(products: Product[]): string {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    const name = shortName(product.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  if (names.length === 0) return "";

  // Drop items from the end until the sentence fits; the first items are the look's main pieces.
  for (let count = names.length; count > 1; count--) {
    const sentence = `${OPENING} ${joinNames(names.slice(0, count))}.`;
    if (sentence.length <= LIVE_TRYON_PROMPT_MAX_CHARS) return sentence;
  }
  return `${OPENING} ${names[0]}.`;
}

/** What the usage log records for a look preview: its items, kept to a sane length. */
export function lookUsageName(products: Product[]): string {
  const names = products.map((p) => shortName(p.name)).filter(Boolean);
  const label = names.length > 0 ? `Look: ${names.join(", ")}` : "Look";
  return label.length <= 200 ? label : `${label.slice(0, 197).trimEnd()}...`;
}
