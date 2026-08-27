import type { GarmentCategory } from "@/modules/wearable-agent/utils/fit-metrics";

/**
 * The canonical category/subcategory vocabulary, versioned in code rather than stored in a
 * table — it changes with the retrieval logic that reads it, not independently of it.
 *
 * Every merchant's raw taxonomy is mapped onto this at sync time. That mapping is the whole
 * point: "sneakers", "trainers" and "shoes" arriving as three different values from three
 * different stores would make `where category = ...` unusable, and no amount of model
 * capability downstream compensates for a catalog that can't be filtered consistently.
 *
 * Deliberately shallow — two levels only. Colour, material, fit and formality are *not*
 * here; they live in each product's enriched description and are reached through cosine
 * similarity, because they are exactly the attributes merchants populate inconsistently or
 * not at all.
 */
export const CANONICAL_TAXONOMY = {
  tops: ["t-shirt", "shirt", "blouse", "polo", "sweater", "hoodie", "sweatshirt", "tank-top", "cardigan", "vest"],
  bottoms: ["jeans", "trousers", "chinos", "shorts", "skirt", "leggings", "joggers"],
  outerwear: ["jacket", "coat", "blazer", "parka", "raincoat", "gilet"],
  dresses: ["dress", "jumpsuit", "gown"],
  footwear: ["sneakers", "boots", "sandals", "loafers", "heels", "flats", "slippers"],
  sleepwear: ["pyjama-top", "pyjama-bottoms", "robe", "nightdress"],
  swimwear: ["swim-shorts", "swimsuit", "bikini"],
  underwear: ["briefs", "boxers", "bra", "socks", "tights"],
  accessories: ["hat", "cap", "scarf", "gloves", "belt", "sunglasses", "watch", "tie"],
  bags: ["backpack", "tote", "crossbody", "handbag", "wallet", "luggage"],
  jewellery: ["necklace", "bracelet", "earrings", "ring"],
  /** Explicit bucket for catalogued items that aren't wearable at all (fragrance, homeware).
   *  Better than leaving `category` null, which would read as "unmapped" rather than "known
   *  to be out of scope". */
  other: [],
} as const satisfies Record<string, readonly string[]>;

export type CanonicalCategory = keyof typeof CANONICAL_TAXONOMY;

export const CANONICAL_CATEGORIES = Object.keys(CANONICAL_TAXONOMY) as CanonicalCategory[];

export function isCanonicalCategory(value: unknown): value is CanonicalCategory {
  return typeof value === "string" && value in CANONICAL_TAXONOMY;
}

export function isCanonicalSubcategory(category: string, subcategory: string): boolean {
  if (!isCanonicalCategory(category)) return false;
  return (CANONICAL_TAXONOMY[category] as readonly string[]).includes(subcategory);
}

/** Every canonical subcategory, flattened — used to validate a model-generated filter that
 *  names a subcategory without naming its parent. */
export function findCategoryForSubcategory(subcategory: string): CanonicalCategory | null {
  for (const category of CANONICAL_CATEGORIES) {
    if ((CANONICAL_TAXONOMY[category] as readonly string[]).includes(subcategory)) return category;
  }
  return null;
}

/**
 * Renders the full tree for injection into a filter-building prompt.
 *
 * Injected live on every call rather than baked into a static prompt: the model must build
 * filters against the vocabulary that actually exists, and a filter naming a value that
 * isn't there returns nothing, which reads to a shopper as an empty catalog rather than a
 * bug.
 */
export function describeTaxonomy(): string {
  return CANONICAL_CATEGORIES.map((category) => {
    const subs = CANONICAL_TAXONOMY[category] as readonly string[];
    return subs.length > 0 ? `${category}: ${subs.join(", ")}` : `${category}: (no subcategories)`;
  }).join("\n");
}

/**
 * Slot mapping for try-on, which reasons about what a garment physically occupies rather
 * than what aisle it sits in. Keeping this as a pure function of the canonical taxonomy is
 * what lets `catalog_products` skip a stored `garment_slot` column entirely — one fewer
 * generated field to keep in sync with the item it describes.
 */
export function categoryToGarmentSlot(category: string | null, subcategory?: string | null): GarmentCategory {
  // Subcategory first: several categories split across slots, and the split is the whole
  // reason try-on can dress a pyjama set correctly rather than stacking two "sleepwear" items.
  switch (subcategory) {
    case "pyjama-top":
      return "top";
    case "pyjama-bottoms":
    case "swim-shorts":
      return "bottom";
    case "robe":
      return "outerwear";
    case "nightdress":
      return "dress";
    case "swimsuit":
      // Occupies the torso and hips together, so it conflicts with a top *and* a bottom —
      // which is exactly what the "dress" slot means to outfit merging. Not a claim that a
      // one-piece is formalwear.
      return "dress";
    case "vest":
    case "cardigan":
      return "top";
  }

  switch (category) {
    case "tops":
      return "top";
    case "bottoms":
      return "bottom";
    case "outerwear":
      return "outerwear";
    case "dresses":
      return "dress";
    case "footwear":
      return "shoes";
    default:
      // Accessories, bags, jewellery, underwear and anything unmapped stack freely rather
      // than replacing a worn garment.
      return "other";
  }
}

/** Synonyms a merchant might actually use, mapped onto one canonical subcategory. The
 *  canonical value itself is matched implicitly, so it never needs an entry here. */
const SUBCATEGORY_SYNONYMS: Record<string, string> = {
  tshirt: "t-shirt",
  "t shirt": "t-shirt",
  tee: "t-shirt",
  tees: "t-shirt",
  "graphic tee": "t-shirt",
  "button-down": "shirt",
  "button down": "shirt",
  "dress shirt": "shirt",
  shirts: "shirt",
  "polo shirt": "polo",
  jumper: "sweater",
  pullover: "sweater",
  knitwear: "sweater",
  knit: "sweater",
  hoodies: "hoodie",
  "hooded sweatshirt": "hoodie",
  crewneck: "sweatshirt",
  "tank top": "tank-top",
  vests: "vest",
  waistcoat: "vest",

  denim: "jeans",
  pants: "trousers",
  trouser: "trousers",
  slacks: "trousers",
  chino: "chinos",
  "cargo pants": "trousers",
  sweatpants: "joggers",
  "track pants": "joggers",
  skirts: "skirt",

  jackets: "jacket",
  "bomber jacket": "jacket",
  "denim jacket": "jacket",
  windbreaker: "jacket",
  overcoat: "coat",
  trenchcoat: "coat",
  "trench coat": "coat",
  blazers: "blazer",
  "sport coat": "blazer",
  anorak: "parka",
  mac: "raincoat",
  bodywarmer: "gilet",
  "puffer vest": "gilet",

  dresses: "dress",
  "maxi dress": "dress",
  "midi dress": "dress",
  playsuit: "jumpsuit",
  romper: "jumpsuit",
  overalls: "jumpsuit",

  trainers: "sneakers",
  sneaker: "sneakers",
  plimsolls: "sneakers",
  "running shoes": "sneakers",
  boot: "boots",
  sandal: "sandals",
  "flip flops": "sandals",
  loafer: "loafers",
  moccasins: "loafers",
  "slip-ons": "loafers",
  "slip ons": "loafers",
  derby: "loafers",
  brogues: "loafers",
  oxfords: "loafers",
  "high heels": "heels",
  pumps: "heels",
  stilettos: "heels",
  "ballet flats": "flats",
  mules: "flats",
  slipper: "slippers",

  pyjamas: "pyjama-top",
  pajamas: "pyjama-top",
  "pyjama set": "pyjama-top",
  "pajama top": "pyjama-top",
  "pajama pants": "pyjama-bottoms",
  "pyjama pants": "pyjama-bottoms",
  "lounge pants": "pyjama-bottoms",
  "dressing gown": "robe",
  bathrobe: "robe",
  nightgown: "nightdress",
  nightie: "nightdress",

  "swim trunks": "swim-shorts",
  "board shorts": "swim-shorts",
  "bathing suit": "swimsuit",
  "one-piece": "swimsuit",

  underpants: "briefs",
  knickers: "briefs",
  boxer: "boxers",
  bras: "bra",
  bralette: "bra",
  sock: "socks",
  stockings: "tights",

  beanie: "hat",
  "bucket hat": "hat",
  "baseball cap": "cap",
  scarves: "scarf",
  glove: "gloves",
  mittens: "gloves",
  belts: "belt",
  shades: "sunglasses",
  watches: "watch",
  necktie: "tie",
  "bow tie": "tie",

  rucksack: "backpack",
  "tote bag": "tote",
  "shoulder bag": "crossbody",
  "cross body": "crossbody",
  purse: "handbag",
  "hand bag": "handbag",
  billfold: "wallet",
  suitcase: "luggage",

  necklaces: "necklace",
  pendant: "necklace",
  chain: "necklace",
  bangle: "bracelet",
  bracelets: "bracelet",
  earring: "earrings",
  studs: "earrings",
  rings: "ring",
};

/** Synonyms that only identify a category, with no subcategory precision. */
const CATEGORY_SYNONYMS: Record<string, CanonicalCategory> = {
  top: "tops",
  tops: "tops",
  shirts: "tops",
  knitwear: "tops",
  bottom: "bottoms",
  bottoms: "bottoms",
  outerwear: "outerwear",
  coats: "outerwear",
  "jackets & coats": "outerwear",
  dress: "dresses",
  dresses: "dresses",
  shoes: "footwear",
  footwear: "footwear",
  sleepwear: "sleepwear",
  nightwear: "sleepwear",
  loungewear: "sleepwear",
  swimwear: "swimwear",
  swim: "swimwear",
  underwear: "underwear",
  lingerie: "underwear",
  socks: "underwear",
  hosiery: "underwear",
  accessories: "accessories",
  bags: "bags",
  "bags & luggage": "bags",
  jewellery: "jewellery",
  jewelry: "jewellery",
};

/** Longest-first so "running shoes" wins over "shoes" and "t-shirt" over "shirt". Without
 *  this ordering a substring match resolves to whichever synonym happens to be checked
 *  first, which is a coin flip that silently mis-categorises whole collections. */
const SUBCATEGORY_MATCHERS = buildMatchers();

function buildMatchers(): Array<{ needle: string; subcategory: string }> {
  const entries: Array<{ needle: string; subcategory: string }> = [];

  for (const [category, subs] of Object.entries(CANONICAL_TAXONOMY)) {
    void category;
    for (const sub of subs as readonly string[]) {
      entries.push({ needle: sub, subcategory: sub });
      // Canonical values are hyphenated; merchant labels usually aren't.
      if (sub.includes("-")) entries.push({ needle: sub.replace(/-/g, " "), subcategory: sub });
    }
  }

  for (const [synonym, sub] of Object.entries(SUBCATEGORY_SYNONYMS)) {
    entries.push({ needle: synonym, subcategory: sub });
  }

  return entries.sort((a, b) => b.needle.length - a.needle.length);
}

function normalize(label: string): string {
  return label
    .toLowerCase()
    .replace(/[_/|]/g, " ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CanonicalMapping {
  category: CanonicalCategory;
  subcategory?: string;
}

/**
 * Maps one raw merchant label ("Men's Running Shoes", "SS24 / Knitwear") onto the canonical
 * vocabulary. Returns null when nothing matches — deliberately, rather than guessing, since a
 * wrong category is worse than an absent one: an absent category degrades to cosine over a
 * wider set, while a wrong one filters the right products out of reach entirely.
 */
export function mapToCanonical(rawLabel: string): CanonicalMapping | null {
  const normalized = normalize(rawLabel);
  if (!normalized) return null;

  for (const { needle, subcategory } of SUBCATEGORY_MATCHERS) {
    if (!normalized.includes(needle)) continue;
    const category = findCategoryForSubcategory(subcategory);
    if (category) return { category, subcategory };
  }

  const categoryEntries = Object.entries(CATEGORY_SYNONYMS).sort((a, b) => b[0].length - a[0].length);
  for (const [synonym, category] of categoryEntries) {
    if (normalized.includes(synonym)) return { category };
  }

  if (isCanonicalCategory(normalized)) return { category: normalized };

  return null;
}
