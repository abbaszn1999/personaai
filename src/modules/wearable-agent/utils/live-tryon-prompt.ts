import type { Product } from "@/modules/commerce/types";

/**
 * The text half of a live try-on `set()` call. The reference picture is the shopper's avatar
 * already wearing the look, so the prompt is the same for every look: put on exactly what the
 * person in that picture is wearing. It uses the wording of Decart's VTON prompting guide
 * ("Substitute the outfit with ...") and asks for that one thing only, because Decart advises
 * against unrelated requests.
 */
export const LIVE_TRYON_PROMPT =
  "Substitute the outfit with the complete outfit worn by the person in the reference image, reproducing every garment and the footwear exactly in color, fabric, fit, length, pattern and detail.";

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

/** What the usage log records for a look preview: its items, kept to a sane length. */
export function lookUsageName(products: Product[]): string {
  const names = products.map((p) => shortName(p.name)).filter(Boolean);
  const label = names.length > 0 ? `Look: ${names.join(", ")}` : "Look";
  return label.length <= 200 ? label : `${label.slice(0, 197).trimEnd()}...`;
}
