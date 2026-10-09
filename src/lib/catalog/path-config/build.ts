import { createHash } from "node:crypto";
import { CUSTOM_OPTION_ATTRIBUTE_PREFIX, PIPELINE_ATTRIBUTE_KEYS } from "@/lib/catalog/acs/map-product";
import type { AcsProduct } from "@/lib/catalog/acs/types";
import { FIT_INDEX_ATTRIBUTES } from "@/lib/sizing/fit-index";
import {
  PATH_CONFIG_VERSION,
  type PathConfigAttribute,
  type PathConfigBrand,
  type PathConfigNode,
  type PathConfigNodeLevel,
  type PathConfigTier,
  type PersonaPathConfig,
} from "./types";

const PERSONA_ROOT = "persona";
const SEPARATOR = " > ";

/** Attributes that are bookkeeping rather than something a shopper filters on. */
const EXCLUDED_ATTRIBUTE_KEYS = new Set<string>([...PIPELINE_ATTRIBUTE_KEYS, "source_category_ids"]);

/** Above this many distinct values an attribute is free text (a description column, an id), not a
 *  vocabulary. Listing it would bloat the prompt with values nobody filters on. */
const MAX_VOCABULARY_SIZE = 150;

const NATIVE_FIELDS: Array<{ key: string; field: string; read: (product: AcsProduct) => string[] | undefined }> = [
  { key: "color", field: "colors", read: (product) => product.colorInfo?.colors },
  { key: "material", field: "materials", read: (product) => product.materials },
  { key: "pattern", field: "patterns", read: (product) => product.patterns },
  { key: "gender", field: "genders", read: (product) => product.genders },
];

interface NodeAccumulator {
  path: string;
  level: PathConfigNodeLevel;
  department: string;
  category: string | null;
  leaf: string | null;
  productIds: Set<string>;
  prices: number[];
  brands: Map<string, number>;
  text: Map<string, { field: string; source: "native" | "custom"; values: Map<string, string> }>;
  numbers: Map<string, { field: string; min: number; max: number }>;
  sizes: Set<string>;
  titleWords: Map<string, number>;
}

/** Words that describe nothing about a garment, in the languages catalogs are written in. */
const TITLE_STOPWORDS = new Set([
  "and", "the", "for", "with", "men", "mens", "man", "women", "womens", "woman", "unisex", "kids", "boys", "girls",
  "new", "collection", "size", "pack", "piece", "set", "item", "product", "style", "basic", "basics", "fit",
  "pour", "avec", "homme", "femme", "les", "des", "une", "sans",
  "رجالي", "حريمي", "نسائي", "للرجال", "مقاس", "جديد",
]);
const MAX_LEAF_WORDS = 15;

function titleTokens(title: string): string[] {
  return [
    ...new Set(
      title
        .toLowerCase()
        .normalize("NFC")
        .split(/[^\p{L}]+/u)
        .filter((token) => token.length >= 3 && !TITLE_STOPWORDS.has(token))
    ),
  ];
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Whether a size chart reached this product: a sizing group plus at least one indexed fit value.
 * Every shopper has measurements, and every search is fit-filtered on them, so a product without
 * one can never be shown — counting it would advertise stock, brands and prices nobody can see.
 */
export function isSizedProduct(product: AcsProduct): boolean {
  const attributes = product.attributes ?? {};
  if (!attributes.fit_group?.text?.some((value) => value.trim())) return false;
  return FIT_INDEX_ATTRIBUTES.some((key) => (attributes[key]?.text?.length ?? 0) > 0);
}

/** `persona > women > bottom > trouser` → its department / category / leaf nodes. */
function personaNodesOf(categories: readonly string[]): Array<{ path: string; level: PathConfigNodeLevel; segments: string[] }> {
  const nodes = new Map<string, { path: string; level: PathConfigNodeLevel; segments: string[] }>();
  for (const entry of categories) {
    const segments = entry.split(SEPARATOR).map((segment) => segment.trim());
    if (segments[0] !== PERSONA_ROOT || segments.length < 2) continue;
    const tail = segments.slice(1, 4);
    for (let depth = 1; depth <= tail.length; depth++) {
      const slice = tail.slice(0, depth);
      const path = slice.join(SEPARATOR);
      const level: PathConfigNodeLevel = depth === 1 ? "department" : depth === 2 ? "category" : "leaf";
      nodes.set(path, { path, level, segments: slice });
    }
  }
  return [...nodes.values()];
}

function attributeLabel(key: string, taken: ReadonlySet<string>): string {
  const stripped = key.startsWith(CUSTOM_OPTION_ATTRIBUTE_PREFIX) ? key.slice(CUSTOM_OPTION_ATTRIBUTE_PREFIX.length) : key;
  if (stripped && !taken.has(stripped)) return stripped;
  return taken.has(key) ? `custom_${key}` : key;
}

const ARABIC_LETTER = /[\u0600-\u06FF]/g;
const LATIN_LETTER = /[A-Za-zÀ-ÖØ-öø-ÿ]/g;
/** Words and letters that only French product titles carry, against an English baseline. */
const FRENCH_MARKER =
  /[éèêàçùûôîœ]|\b(?:homme|femme|enfant|chemise|pantalon|robe|veste|manteau|chaussures?|pull|jupe|baskets?|coton|lin|laine|cuir|pour|avec|sans|manches?|longues?|courtes?|noire?|blanche?|bleue?|rouge|taille)\b/i;
/** Below this share of titles a script is not one the catalog is written in. */
const LANGUAGE_SHARE = 0.25;

/**
 * The language a store writes its product titles in, from the titles themselves: Arabic by
 * script, French by the words and accents English titles never carry, otherwise English. Two
 * languages when each is a real share of the catalog. Null for no titles.
 */
export function detectCatalogLanguage(titles: readonly string[]): string | null {
  let arabic = 0;
  let latin = 0;
  let french = 0;
  for (const title of titles) {
    const arabicLetters = title.match(ARABIC_LETTER)?.length ?? 0;
    const latinLetters = title.match(LATIN_LETTER)?.length ?? 0;
    if (arabicLetters === 0 && latinLetters === 0) continue;
    if (arabicLetters >= latinLetters) arabic += 1;
    else {
      latin += 1;
      if (FRENCH_MARKER.test(title)) french += 1;
    }
  }
  const total = arabic + latin;
  if (total === 0) return null;
  const latinLanguage = latin > 0 && french / latin >= 0.5 ? "French" : "English";
  const languages: string[] = [];
  if (latin / total >= LANGUAGE_SHARE) languages.push(latinLanguage);
  if (arabic / total >= LANGUAGE_SHARE) languages.push("Arabic");
  return languages.join(" and ");
}

/** Tertiles over the in-stock price list. Boundaries are whole currency units so the rendered
 *  text is short and stable; each tier still counts exactly the products inside it. */
export function computePriceTiers(prices: readonly number[]): PathConfigTier[] {
  const sorted = prices.filter((price) => Number.isFinite(price) && price > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)))];
  const low = Math.floor(sorted[0]);
  const high = Math.ceil(sorted[sorted.length - 1]);
  const cutA = Math.round(at(1 / 3));
  const cutB = Math.round(at(2 / 3));

  const bounds: Array<[PathConfigTier["label"], number, number]> =
    high - low < 3 || cutA >= cutB
      ? [["A", low, high]]
      : [
          ["A", low, cutA],
          ["B", cutA, cutB],
          ["C", cutB, high],
        ];

  return bounds
    .map(([label, min, max], index) => ({
      label,
      min,
      max,
      count: sorted.filter((price) =>
        index === 0 ? price >= min && price <= max : price > min && price <= max
      ).length,
    }))
    .filter((tier) => tier.count > 0);
}

function newAccumulator(path: string, level: PathConfigNodeLevel, segments: string[]): NodeAccumulator {
  return {
    path,
    level,
    department: segments[0],
    category: segments[1] ?? null,
    leaf: segments[2] ?? null,
    productIds: new Set(),
    prices: [],
    brands: new Map(),
    text: new Map(),
    numbers: new Map(),
    sizes: new Set(),
    titleWords: new Map(),
  };
}

/**
 * The leaf's most used title words that say something a filter cannot: not a brand, colour,
 * size or the garment's own name, and used by at least two products.
 */
function leafWords(node: NodeAccumulator): string[] {
  const known = new Set<string>();
  const addWords = (value: string) => value.toLowerCase().split(/[^\p{L}]+/u).forEach((word) => word && known.add(word));
  for (const brand of node.brands.keys()) addWords(brand);
  for (const entry of node.text.values()) for (const value of entry.values.values()) addWords(value);
  for (const size of node.sizes) addWords(size);
  if (node.leaf) addWords(node.leaf.replace(/-/g, " "));
  return [...node.titleWords.entries()]
    .filter(([word, count]) => count >= 2 && !known.has(word) && !known.has(word.replace(/s$/, "")))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_LEAF_WORDS)
    .map(([word]) => word);
}

function addText(
  node: NodeAccumulator,
  key: string,
  field: string,
  source: "native" | "custom",
  values: readonly string[]
) {
  let entry = node.text.get(key);
  if (!entry) {
    entry = { field, source, values: new Map() };
    node.text.set(key, entry);
  }
  // Keyed by exact spelling, not case-folded: ACS matches filter values exactly, so "Black" and
  // "BLACK" are different values and both must stay reachable.
  for (const raw of values) {
    const value = clean(raw);
    if (value) entry.values.set(value, value);
  }
}

function finalizeNode(node: NodeAccumulator): PathConfigNode {
  const brands: PathConfigBrand[] = [...node.brands.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const attributes: PathConfigAttribute[] = [];
  for (const [key, entry] of node.text) {
    if (entry.values.size === 0 || entry.values.size > MAX_VOCABULARY_SIZE) continue;
    attributes.push({
      key,
      field: entry.field,
      source: entry.source,
      kind: "text",
      values: [...entry.values.values()].sort((a, b) => a.localeCompare(b)),
    });
  }
  for (const [key, entry] of node.numbers) {
    if (node.text.has(key)) continue;
    attributes.push({ key, field: entry.field, source: "custom", kind: "number", range: { min: entry.min, max: entry.max } });
  }
  // Native fields first, in a fixed order, then custom ones alphabetically — stable output.
  const nativeOrder = NATIVE_FIELDS.map((field) => field.key);
  attributes.sort((a, b) => {
    const ai = nativeOrder.indexOf(a.key);
    const bi = nativeOrder.indexOf(b.key);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.key.localeCompare(b.key);
  });

  const prices = node.prices;
  return {
    path: node.path,
    level: node.level,
    department: node.department,
    category: node.category,
    leaf: node.leaf,
    inStock: node.productIds.size,
    priceRange: prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    tiers: computePriceTiers(prices),
    brands,
    attributes,
    sizes: [...node.sizes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    ...(node.level === "leaf" ? { words: leafWords(node) } : {}),
  };
}

/**
 * Summarises one store's ACS documents into its path config.
 *
 * Only in-stock, sized `PRIMARY` documents with an image count: variants would double-count
 * products, and an out-of-stock, unsized or imageless product is not something any agent can show.
 * Every leaf and every brand is kept — nothing is capped — because a value missing from the config
 * is a value the agent can never filter on.
 */
export function buildPathConfig(products: readonly AcsProduct[]): PersonaPathConfig {
  const nodes = new Map<string, NodeAccumulator>();
  const currencies = new Map<string, number>();
  const inStockIds = new Set<string>();
  const titles: string[] = [];

  const customKeys = new Set<string>();
  for (const product of products) {
    for (const key of Object.keys(product.attributes ?? {})) {
      if (!EXCLUDED_ATTRIBUTE_KEYS.has(key)) customKeys.add(key);
    }
  }
  const labels = new Map<string, string>();
  const nativeKeys = new Set(NATIVE_FIELDS.map((field) => field.key));
  for (const key of [...customKeys].sort()) {
    labels.set(key, attributeLabel(key, new Set([...nativeKeys, ...labels.values()])));
  }

  for (const product of products) {
    if ((product.type ?? "PRIMARY") !== "PRIMARY") continue;
    if (product.availability !== "IN_STOCK") continue;
    // Nothing without an image or a size chart is ever shown, so it must not set a floor or a brand either.
    if (!product.images?.some((image) => image.uri)) continue;
    if (!isSizedProduct(product)) continue;

    const personaNodes = personaNodesOf(product.categories ?? []);
    if (personaNodes.length === 0) continue;
    if (!inStockIds.has(product.id) && product.title) titles.push(product.title);
    inStockIds.add(product.id);

    const price = product.priceInfo?.price;
    if (product.priceInfo?.currencyCode) {
      currencies.set(product.priceInfo.currencyCode, (currencies.get(product.priceInfo.currencyCode) ?? 0) + 1);
    }
    const brand = product.brands?.[0] ? clean(product.brands[0]) : "";

    for (const { path, level, segments } of personaNodes) {
      let node = nodes.get(path);
      if (!node) {
        node = newAccumulator(path, level, segments);
        nodes.set(path, node);
      }
      if (node.productIds.has(product.id)) continue;
      node.productIds.add(product.id);
      if (level === "leaf" && product.title) {
        for (const token of titleTokens(product.title)) node.titleWords.set(token, (node.titleWords.get(token) ?? 0) + 1);
      }
      if (typeof price === "number" && Number.isFinite(price) && price > 0) node.prices.push(price);
      if (brand) node.brands.set(brand, (node.brands.get(brand) ?? 0) + 1);
      for (const size of product.sizes ?? []) {
        const label = clean(size);
        if (label) node.sizes.add(label);
      }

      for (const native of NATIVE_FIELDS) {
        const values = native.read(product);
        if (values?.length) addText(node, native.key, native.field, "native", values);
      }
      for (const [key, attribute] of Object.entries(product.attributes ?? {})) {
        if (EXCLUDED_ATTRIBUTE_KEYS.has(key)) continue;
        const label = labels.get(key) ?? key;
        if (attribute.text?.length) addText(node, label, `attributes.${key}`, "custom", attribute.text);
        else if (attribute.numbers?.length) {
          const finite = attribute.numbers.filter((value) => Number.isFinite(value));
          if (finite.length === 0) continue;
          const current = node.numbers.get(label);
          node.numbers.set(label, {
            field: `attributes.${key}`,
            min: Math.min(current?.min ?? Infinity, ...finite),
            max: Math.max(current?.max ?? -Infinity, ...finite),
          });
        }
      }
    }
  }

  const currency = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    version: PATH_CONFIG_VERSION,
    currency,
    catalogLanguage: detectCatalogLanguage(titles),
    inStock: inStockIds.size,
    nodes: [...nodes.values()].map(finalizeNode).sort((a, b) => a.path.localeCompare(b.path)),
  };
}

/** Covers the config as well as its text: validation reads fields (sizes) the text never shows. */
export function pathConfigFingerprint(renderedText: string, taxonomyVersion: number, config: PersonaPathConfig): string {
  return createHash("sha256")
    .update(`${PATH_CONFIG_VERSION}:${taxonomyVersion}:${renderedText}:${JSON.stringify(config)}`)
    .digest("hex");
}
