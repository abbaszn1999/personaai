import { createHash } from "node:crypto";
import { CUSTOM_OPTION_ATTRIBUTE_PREFIX, PIPELINE_ATTRIBUTE_KEYS } from "@/lib/catalog/acs/map-product";
import type { AcsCustomAttribute, AcsProduct } from "@/lib/catalog/acs/types";
import { FIT_INDEX_ATTRIBUTES } from "@/lib/sizing/fit-index";
import { comparableValue } from "./lookup";
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

/**
 * Upper bounds for tiers A and B when one price holds both thirds (72 of 108 polos at 19): the real
 * price points closest to a third and two thirds of the products, so the tiers read "below the
 * usual price", "the usual price" and "above it" rather than one band covering everything.
 */
function clusteredCuts(sorted: readonly number[], low: number, high: number): { cutA: number | null; cutB: number | null } {
  const points = [...new Set(sorted.map((price) => Math.round(price)))].filter((point) => point >= low && point < high);
  const upTo = (point: number) => sorted.filter((price) => price <= point).length;
  const closest = (target: number, above: number) => {
    let best: { point: number; distance: number } | null = null;
    for (const point of points) {
      if (point <= above) continue;
      const distance = Math.abs(upTo(point) - target);
      if (!best || distance < best.distance) best = { point, distance };
    }
    return best?.point ?? null;
  };
  const cutA = closest(sorted.length / 3, -Infinity);
  return { cutA, cutB: cutA === null ? null : closest((2 * sorted.length) / 3, cutA) };
}

const MIN_TIER_PRODUCTS = 2;
const MIN_TIER_SHARE = 0.12;

/** Tertiles over the in-stock price list. Boundaries are whole currency units so the rendered
 *  text is short and stable; each tier still counts exactly the products inside it. */
export function computePriceTiers(prices: readonly number[]): PathConfigTier[] {
  const sorted = prices.filter((price) => Number.isFinite(price) && price > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)))];
  const low = Math.floor(sorted[0]);
  const high = Math.ceil(sorted[sorted.length - 1]);
  let cutA: number | null = Math.round(at(1 / 3));
  let cutB: number | null = Math.round(at(2 / 3));
  if (cutA >= cutB) ({ cutA, cutB } = clusteredCuts(sorted, low, high));

  const bands: Array<[number, number]> =
    high - low < 3 || cutA === null
      ? [[low, high]]
      : cutB === null
        ? [
            [low, cutA],
            [cutA, high],
          ]
        : [
            [low, cutA],
            [cutA, cutB],
            [cutB, high],
          ];

  const countIn = (min: number, max: number, first: boolean) =>
    sorted.filter((price) => (first ? price >= min : price > min) && price <= max).length;
  const counted = bands
    .map(([min, max], index) => ({ min, max, count: countIn(min, max, index === 0) }))
    .filter((band) => band.count > 0);

  // "Cheap" reads the top of tier A and "premium" the bottom of tier C, so a band holding a sliver
  // of the products (3 of 77 polos) would turn either word into a search for almost nothing.
  const minCount = Math.max(MIN_TIER_PRODUCTS, Math.ceil(sorted.length * MIN_TIER_SHARE));
  while (counted.length > 1 && counted[0].count < minCount) {
    const [thin, next] = counted.splice(0, 2);
    counted.unshift({ min: thin.min, max: next.max, count: thin.count + next.count });
  }
  while (counted.length > 1 && counted[counted.length - 1].count < minCount) {
    const thin = counted.pop()!;
    const previous = counted.pop()!;
    counted.push({ min: previous.min, max: thin.max, count: previous.count + thin.count });
  }

  const labels: PathConfigTier["label"][] = ["A", "B", "C"];
  return counted.map((band, index) => ({ label: labels[index], ...band }));
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

export interface BuildPathConfigOptions {
  /** The brand a store label belongs to beyond its spelling, from the store's own brand grouping
   *  ("Tom Tailor Men" is "tom tailor"). Null leaves the label on its own. */
  brandFamily?: (brand: string) => string | null;
}

/**
 * Which brand labels are one brand: the same name however it is cased or punctuated, or labels the
 * store's brand grouping files under one key. Each label maps to its family's id.
 */
function brandFamilies(labels: Iterable<string>, brandFamily: BuildPathConfigOptions["brandFamily"]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  const join = (left: string, right: string) => {
    for (const key of [left, right]) if (!parent.has(key)) parent.set(key, key);
    const [a, b] = [find(left), find(right)].sort();
    if (a !== b) parent.set(b, a);
  };
  const unique = [...new Set(labels)];
  for (const label of unique) {
    join(`label:${label}`, `spelling:${comparableValue(label)}`);
    const family = brandFamily?.(label);
    if (family) join(`label:${label}`, `family:${family}`);
  }
  return new Map(unique.map((label) => [label, find(`label:${label}`)]));
}

/** One entry per brand family on the node, named by its most stocked spelling. */
function familyBrands(counts: ReadonlyMap<string, number>, families: ReadonlyMap<string, string>): PathConfigBrand[] {
  const grouped = new Map<string, Array<[string, number]>>();
  for (const [label, count] of counts) {
    const family = families.get(label) ?? label;
    grouped.set(family, [...(grouped.get(family) ?? []), [label, count]]);
  }
  return [...grouped.values()]
    .map((members) => {
      members.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      return {
        name: members[0][0],
        count: members.reduce((sum, [, count]) => sum + count, 0),
        spellings: members.map(([label]) => label),
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function finalizeNode(node: NodeAccumulator, families: ReadonlyMap<string, string>): PathConfigNode {
  const brands = familyBrands(node.brands, families);

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
export function buildPathConfig(products: readonly AcsProduct[], options: BuildPathConfigOptions = {}): PersonaPathConfig {
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
  const families = brandFamilies(
    [...nodes.values()].flatMap((node) => [...node.brands.keys()]),
    options.brandFamily,
  );
  return {
    version: PATH_CONFIG_VERSION,
    currency,
    catalogLanguage: detectCatalogLanguage(titles),
    inStock: inStockIds.size,
    nodes: [...nodes.values()].map((node) => finalizeNode(node, families)).sort((a, b) => a.path.localeCompare(b.path)),
  };
}

const FIT_VALUE_ATTRIBUTES: ReadonlySet<string> = new Set(FIT_INDEX_ATTRIBUTES);

/**
 * What `buildPathConfig` reads off one document, kept per store in the ACS mirror so the config is
 * rebuilt from the database instead of a walk through every store's catalog. Null for a variant,
 * which the config never counts. A fit value list shrinks to its first value: the config only asks
 * whether a size chart reached the product.
 */
export function pathConfigDocument(product: AcsProduct): AcsProduct | null {
  if ((product.type ?? "PRIMARY") !== "PRIMARY") return null;
  const attributes: Record<string, AcsCustomAttribute> = {};
  for (const [key, attribute] of Object.entries(product.attributes ?? {})) {
    if (FIT_VALUE_ATTRIBUTES.has(key)) {
      const first = attribute.text?.find((value) => value.trim());
      if (first) attributes[key] = { text: [first] };
    } else if (key === "fit_group" || !EXCLUDED_ATTRIBUTE_KEYS.has(key)) {
      attributes[key] = attribute;
    }
  }
  const image = product.images?.find((entry) => entry.uri);
  return {
    id: product.id,
    type: "PRIMARY",
    title: product.title,
    categories: product.categories ?? [],
    ...(product.brands ? { brands: product.brands } : {}),
    ...(product.priceInfo ? { priceInfo: product.priceInfo } : {}),
    ...(product.availability ? { availability: product.availability } : {}),
    ...(image ? { images: [image] } : {}),
    ...(product.colorInfo ? { colorInfo: product.colorInfo } : {}),
    ...(product.sizes ? { sizes: product.sizes } : {}),
    ...(product.materials ? { materials: product.materials } : {}),
    ...(product.patterns ? { patterns: product.patterns } : {}),
    ...(product.genders ? { genders: product.genders } : {}),
    attributes,
  };
}

/** Covers the config as well as its text: validation reads fields (sizes) the text never shows. */
export function pathConfigFingerprint(renderedText: string, taxonomyVersion: number, config: PersonaPathConfig): string {
  return createHash("sha256")
    .update(`${PATH_CONFIG_VERSION}:${taxonomyVersion}:${renderedText}:${JSON.stringify(config)}`)
    .digest("hex");
}
