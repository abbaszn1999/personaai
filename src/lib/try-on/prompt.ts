import type { GarmentCategory } from "@/modules/wearable-agent/utils/fit-metrics";

/**
 * The try-on prompt. It is the wording that was tested in the lab, with only the garment names
 * varying: each garment is named by its slot (the Persona category: top, bottom, outerwear, ...)
 * and by its Persona leaf (polo shirt, jeans, sneakers, ...).
 *
 * The words come from the fixed tables below, never from product titles, merchant category names
 * or anything a client types. A leaf that is not in the table is dropped and the garment is named
 * by its category alone, so no free text can reach the model. No colours, materials or other
 * visual descriptions are ever added: the production app has no vision step to supply them.
 */

export interface TryOnPromptGarment {
  /** The garment's slot, the Persona category it occupies. */
  slot: GarmentCategory;
  /** A Persona leaf id (`polo-shirt`, `jean`) or a canonical subcategory (`polo`, `chinos`). */
  leaf?: string | null;
}

/** How the slot reads in "replace only the person's ...", and in the category-only fallback. */
const SLOT_NOUN: Record<GarmentCategory, string> = {
  top: "top",
  bottom: "bottoms",
  outerwear: "outerwear",
  shoes: "shoes",
  dress: "full-body outfit",
  other: "garment",
};

interface LeafWord {
  word: string;
  /** Every slot this leaf can legitimately sit in. Persona and the canonical vocabulary disagree
   *  on a few (a cardigan is outerwear in one and a top in the other). */
  slots: GarmentCategory[];
}

const TOP: GarmentCategory[] = ["top"];
const BOTTOM: GarmentCategory[] = ["bottom"];
const OUTER: GarmentCategory[] = ["outerwear"];
const SHOES: GarmentCategory[] = ["shoes"];
const FULL: GarmentCategory[] = ["dress"];
const TOP_OR_OUTER: GarmentCategory[] = ["outerwear", "top"];

/** Persona leaf ids (every department, `persona-taxonomy.ts`) plus the canonical subcategories
 *  (`retrieval/taxonomy.ts`) that title-based indexing falls back on. Keys are lower case. */
const LEAF_WORDS: Record<string, LeafWord> = {
  // Tops
  "t-shirt": { word: "t-shirt", slots: TOP },
  shirt: { word: "shirt", slots: TOP },
  blouse: { word: "blouse", slots: TOP },
  camisole: { word: "camisole", slots: TOP },
  "tank-top": { word: "tank top", slots: TOP },
  "crop-top": { word: "crop top", slots: TOP },
  bodysuit: { word: "bodysuit", slots: TOP },
  knit: { word: "knitwear", slots: TOP },
  sweater: { word: "sweater", slots: TOP },
  hoodie: { word: "hoodie", slots: TOP },
  sweatshirt: { word: "sweatshirt", slots: TOP },
  tunic: { word: "tunic", slots: TOP },
  "activewear-top": { word: "activewear top", slots: TOP },
  "swim-top": { word: "swim top", slots: TOP },
  "sleep-top": { word: "pyjama top", slots: TOP },
  "pyjama-top": { word: "pyjama top", slots: TOP },
  bra: { word: "bra", slots: TOP },
  "polo-shirt": { word: "polo shirt", slots: TOP },
  polo: { word: "polo shirt", slots: TOP },
  // Bottoms
  trouser: { word: "trousers", slots: BOTTOM },
  trousers: { word: "trousers", slots: BOTTOM },
  jean: { word: "jeans", slots: BOTTOM },
  jeans: { word: "jeans", slots: BOTTOM },
  skirt: { word: "skirt", slots: BOTTOM },
  short: { word: "shorts", slots: BOTTOM },
  shorts: { word: "shorts", slots: BOTTOM },
  legging: { word: "leggings", slots: BOTTOM },
  leggings: { word: "leggings", slots: BOTTOM },
  culotte: { word: "culottes", slots: BOTTOM },
  "activewear-bottom": { word: "activewear bottoms", slots: BOTTOM },
  "swim-bottom": { word: "swim bottoms", slots: BOTTOM },
  "sleep-bottom": { word: "pyjama bottoms", slots: BOTTOM },
  "pyjama-bottoms": { word: "pyjama bottoms", slots: BOTTOM },
  chino: { word: "chinos", slots: BOTTOM },
  chinos: { word: "chinos", slots: BOTTOM },
  jogger: { word: "joggers", slots: BOTTOM },
  joggers: { word: "joggers", slots: BOTTOM },
  "swim-short": { word: "swim shorts", slots: BOTTOM },
  "swim-shorts": { word: "swim shorts", slots: BOTTOM },
  // Full-body
  dress: { word: "dress", slots: FULL },
  gown: { word: "gown", slots: FULL },
  jumpsuit: { word: "jumpsuit", slots: FULL },
  romper: { word: "romper", slots: FULL },
  kaftan: { word: "kaftan", slots: FULL },
  abaya: { word: "abaya", slots: FULL },
  swimsuit: { word: "swimsuit", slots: FULL },
  set: { word: "matching set", slots: FULL },
  "sleepwear-set": { word: "pyjama set", slots: FULL },
  suit: { word: "suit", slots: FULL },
  thobe: { word: "thobe", slots: FULL },
  overall: { word: "overalls", slots: FULL },
  "all-in-one": { word: "all-in-one", slots: FULL },
  sleepsuit: { word: "sleepsuit", slots: FULL },
  bathrobe: { word: "bathrobe", slots: FULL },
  nightdress: { word: "nightdress", slots: FULL },
  // Outerwear
  blazer: { word: "blazer", slots: OUTER },
  jacket: { word: "jacket", slots: OUTER },
  coat: { word: "coat", slots: OUTER },
  trench: { word: "trench coat", slots: OUTER },
  cardigan: { word: "cardigan", slots: TOP_OR_OUTER },
  vest: { word: "vest", slots: TOP_OR_OUTER },
  kimono: { word: "kimono", slots: OUTER },
  "activewear-jacket": { word: "activewear jacket", slots: OUTER },
  "suit-jacket": { word: "suit jacket", slots: OUTER },
  gilet: { word: "gilet", slots: OUTER },
  snowsuit: { word: "snowsuit", slots: OUTER },
  pramsuit: { word: "pramsuit", slots: OUTER },
  parka: { word: "parka", slots: OUTER },
  raincoat: { word: "raincoat", slots: OUTER },
  robe: { word: "robe", slots: OUTER },
  // Footwear
  heel: { word: "heels", slots: SHOES },
  heels: { word: "heels", slots: SHOES },
  flat: { word: "flats", slots: SHOES },
  flats: { word: "flats", slots: SHOES },
  sneaker: { word: "sneakers", slots: SHOES },
  sneakers: { word: "sneakers", slots: SHOES },
  boot: { word: "boots", slots: SHOES },
  boots: { word: "boots", slots: SHOES },
  sandal: { word: "sandals", slots: SHOES },
  sandals: { word: "sandals", slots: SHOES },
  loafer: { word: "loafers", slots: SHOES },
  loafers: { word: "loafers", slots: SHOES },
  mule: { word: "mules", slots: SHOES },
  wedge: { word: "wedges", slots: SHOES },
  slipper: { word: "slippers", slots: SHOES },
  slippers: { word: "slippers", slots: SHOES },
  sock: { word: "socks", slots: SHOES },
  "dress-shoe": { word: "dress shoes", slots: SHOES },
  espadrille: { word: "espadrilles", slots: SHOES },
  slide: { word: "slides", slots: SHOES },
  shoe: { word: "shoes", slots: SHOES },
  bootie: { word: "booties", slots: SHOES },
};

/**
 * The plain words for a leaf, or null when the leaf is missing, unknown, or belongs to a different
 * slot than the garment actually occupies (naming "jeans" for a top would contradict the slot).
 */
export function leafWord(leaf: string | null | undefined, slot: GarmentCategory): string | null {
  if (typeof leaf !== "string") return null;
  const entry = LEAF_WORDS[leaf.trim().toLowerCase()];
  if (!entry || !entry.slots.includes(slot)) return null;
  return entry.word;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The category in parentheses only where it adds information: tops and bottoms are the
 *  categories a leaf word ("jeans", "polo shirt") does not itself announce. */
function describeGarment(garment: TryOnPromptGarment, imageNumber: number): string {
  const noun = SLOT_NOUN[garment.slot];
  const word = leafWord(garment.leaf, garment.slot);
  if (!word) return `the ${noun} from image ${imageNumber}`;

  const root = garment.slot === "top" ? "top" : garment.slot === "bottom" ? "bottom" : null;
  const announcesCategory = root === null || word.includes(root);
  return announcesCategory
    ? `the ${word} from image ${imageNumber}`
    : `the ${word} (${noun}) from image ${imageNumber}`;
}

/**
 * Builds the try-on prompt. Image 1 is the person; `garments[i]` is image `i + 2`, so the order
 * of `garments` must match the order the images are sent in.
 */
export function buildTryOnPrompt(garments: TryOnPromptGarment[]): string {
  const nouns = [...new Set(garments.map((g) => SLOT_NOUN[g.slot]))];
  const replaced = garments.filter((g) => g.slot === "other").length > 1
    ? nouns.map((noun) => (noun === SLOT_NOUN.other ? "garments" : noun))
    : nouns;

  const named = garments.map((garment, index) => describeGarment(garment, index + 2));

  return [
    `Edit image 1: replace only the person's ${joinList(replaced)} with ${joinList(named)}.`,
    "Keep the person's face, body, pose and the magenta background unchanged.",
    "Ignore everything else worn in the other images.",
  ].join(" ");
}
