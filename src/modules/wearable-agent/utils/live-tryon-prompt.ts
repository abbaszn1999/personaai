import type { Product } from "@/modules/commerce/types";

/**
 * Decart caps a try-on prompt at roughly 750 characters of English and rejects anything longer,
 * with enhancement on or off. Stay well under it so a long list of long product names can't tip
 * a request into an error.
 */
export const LIVE_TRYON_PROMPT_MAX_CHARS = 600;

export const LIVE_TRYON_OPENING = "Substitute the outfit with";
const OPENING = LIVE_TRYON_OPENING;
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
 * Decart's VTON guide asks for concrete, *visible* garment details: colour, fabric, fit, length,
 * sleeves, neckline or collar, pattern, closures. Catalog attributes are merchant-defined keys
 * (some are internal, such as `merchant_id`, `fit_rows` or `fit_chest_cm`), so only a key made
 * entirely of these words is read as a visual detail. Listed in the order they are written.
 */
const DETAIL_WORDS: Record<string, number> = {
  color: 0, colour: 0, colors: 0, colours: 0,
  material: 1, materials: 1, fabric: 1, fabrics: 1,
  fit: 2, silhouette: 2,
  sleeve: 3, sleeves: 3,
  neck: 4, neckline: 4, collar: 4,
  length: 5,
  pattern: 6, print: 6,
  closure: 7,
  style: 8,
};
/** Words allowed in a detail key besides the ones above: `opt_collar_type` is a collar. */
const KEY_FILLER = new Set(["opt", "type", "name", "of"]);
const MAX_DETAILS_PER_ITEM = 4;
const DETAIL_MAX_CHARS = 30;

function detailRank(key: string): number | null {
  const words = key.toLowerCase().split(/[^a-z]+/).filter((word) => word && !KEY_FILLER.has(word));
  if (words.length === 0) return null;
  let rank: number | null = null;
  for (const word of words) {
    const wordRank = DETAIL_WORDS[word];
    if (wordRank === undefined) return null;
    rank = rank === null ? wordRank : Math.min(rank, wordRank);
  }
  return rank;
}

/** The garment type as a phrase: `polo-shirt` is "polo shirt". Generic leaves say nothing. */
function leafPhrase(leaf: string | undefined): string {
  const phrase = (leaf ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return phrase === "other" || phrase === "others" ? "" : phrase;
}

/**
 * What the picture can show about one product, beyond its title: its garment type when the title
 * leaves it out, then the visible details its catalog records. Only a single value counts. A
 * product sold in several colours or fits lists them all, and nothing says which one is in the
 * render, so naming one could contradict the picture the model is copying from.
 */
function visibleDetails(product: Product, name: string): string[] {
  const lowerName = name.toLowerCase();
  const ranked: Array<{ rank: number; value: string }> = [];

  const leaf = leafPhrase(product.garmentLeaf);
  if (leaf && !lowerName.includes(leaf)) ranked.push({ rank: -1, value: leaf });

  for (const [key, values] of Object.entries(product.attributes ?? {})) {
    const rank = detailRank(key);
    if (rank === null || !Array.isArray(values)) continue;
    const distinct = [...new Set(values.map((value) => plainText(String(value))).filter(Boolean))];
    if (distinct.length !== 1) continue;
    const value = distinct[0].toLowerCase();
    if (value.length > DETAIL_MAX_CHARS || !/[a-z]/.test(value)) continue;
    if (lowerName.includes(value) || ranked.some((entry) => entry.value === value)) continue;
    // "Fit" reads better with its label: "relaxed" alone is not a detail, "relaxed fit" is.
    const label = rank === 2 && !/\bfit\b/.test(value) ? `${value} fit` : value;
    ranked.push({ rank, value: label });
  }

  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_DETAILS_PER_ITEM)
    .map((entry) => entry.value);
}

interface PromptItem {
  name: string;
  detailed: string;
}

/**
 * The text half of a live try-on `set()` call. The reference picture is the shopper's avatar
 * already wearing the look, so the prompt names what the look is made of, in the wording of
 * Decart's VTON prompting guide ("Substitute the outfit with ..."), with each item's visible
 * details in brackets: "Navy Hoodie (cotton, relaxed fit)". Those details only reinforce what the
 * picture shows; they are never invented. The prompt asks for nothing else, such as keeping the
 * person's identity: Decart advises against unrelated requests.
 *
 * Returns an empty string when the look has no usable items.
 */
export function buildLookTryOnPrompt(products: Product[]): string {
  const items: PromptItem[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    const name = shortName(product.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const details = visibleDetails(product, name);
    items.push({ name, detailed: details.length > 0 ? `${name} (${details.join(", ")})` : name });
  }
  if (items.length === 0) return "";

  const sentence = (count: number, detailedCount: number) =>
    `${OPENING} ${joinNames(items.slice(0, count).map((item, index) => (index < detailedCount ? item.detailed : item.name)))}.`;

  // Every item must be named or it is never put on, so the details go first when the sentence is
  // too long (last items first), and only then whole items from the end. The first items are the
  // look's main pieces.
  for (let count = items.length; count > 1; count--) {
    for (let detailedCount = count; detailedCount >= 0; detailedCount--) {
      const candidate = sentence(count, detailedCount);
      if (candidate.length <= LIVE_TRYON_PROMPT_MAX_CHARS) return candidate;
    }
  }
  return sentence(1, 1).length <= LIVE_TRYON_PROMPT_MAX_CHARS ? sentence(1, 1) : sentence(1, 0);
}

/** Words that mean the model strayed from garments: Decart advises against unrelated requests. */
const OFF_TOPIC = /\b(face|faces|hair|skin|background|pose|posing|preserve|identity|lighting)\b/i;

/**
 * Checks a prompt a vision model wrote from the avatar picture before it goes to Decart. Returns the
 * cleaned sentence, or null when it is not a single garment-only "Substitute the outfit with ..."
 * sentence within the length Decart accepts, so the caller can fall back to the catalog prompt.
 * Trimming it to fit would risk cutting a garment off, so an over-long reply is refused instead.
 */
export function sanitizeDescribedLookPrompt(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
  if (text.length <= OPENING.length + 3 || text.length > LIVE_TRYON_PROMPT_MAX_CHARS) return null;
  if (!text.toLowerCase().startsWith(OPENING.toLowerCase())) return null;
  // One sentence: a full stop only at the very end (abbreviations like "No." never appear in a
  // garment list, and a second sentence is where a stray instruction would hide).
  const body = text.replace(/[.!]+$/, "");
  if (/[.!?\n]/.test(body)) return null;
  if (OFF_TOPIC.test(body)) return null;
  return `${OPENING}${body.slice(OPENING.length)}.`;
}

/** What the usage log records for a look preview: its items, kept to a sane length. */
export function lookUsageName(products: Product[]): string {
  const names = products.map((p) => shortName(p.name)).filter(Boolean);
  const label = names.length > 0 ? `Look: ${names.join(", ")}` : "Look";
  return label.length <= 200 ? label : `${label.slice(0, 197).trimEnd()}...`;
}
