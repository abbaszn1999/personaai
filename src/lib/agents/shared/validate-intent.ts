import {
  comparableAttributeValue,
  comparableValue,
  findNode,
  floorPrice,
  normalizePath,
  unisexCounterpart,
} from "@/lib/catalog/path-config/lookup";
import type { PathConfigAttribute, PathConfigNode, PersonaPathConfig } from "@/lib/catalog/path-config/types";
import { QUALIFIER_TOKENS } from "@/lib/sizing/brand-mapping";
import { sizeLabelCandidates } from "@/lib/sizing/size-label-forms";
import type { ResolvedAttribute, SearchSpec } from "./acs-translator";
import type { AttributeConstraint } from "../types";

/** A search as a model wrote it — every field still unverified. */
export interface RawSearchIntent {
  path: string;
  /** Up to two further leaves searched together with `path`. */
  also_paths?: string[] | null;
  brands?: string[] | null;
  exclude_brands?: string[] | null;
  exclude_attributes?: AttributeConstraint[] | null;
  price_min?: number | null;
  price_max?: number | null;
  attributes?: AttributeConstraint[] | null;
  /** Only sizes the shopper named in their own words. */
  sizes?: string[] | null;
  exclude_ids?: string[] | null;
}

export type ValidationResult =
  | { ok: true; spec: SearchSpec; node: PathConfigNode; counterpart: PathConfigNode | null }
  | { ok: false; problems: string[] };

const squash = comparableValue;

/** Every stored spelling of each value, keyed by its comparison form. */
function spellingsBySquash(values: Iterable<string>, compare: (value: string) => string = squash): Map<string, string[]> {
  const bySquash = new Map<string, string[]>();
  for (const value of values) {
    const key = compare(value);
    const spellings = bySquash.get(key) ?? [];
    if (!spellings.includes(value)) spellings.push(value);
    bySquash.set(key, spellings);
  }
  return bySquash;
}

/** Stocked nodes whose path shares a word with the one the model asked for — the hint a
 *  corrective retry needs. */
export function suggestPaths(config: PersonaPathConfig, rawPath: string, limit = 6): string[] {
  const words = normalizePath(rawPath)
    .split(/[\s>-]+/)
    .filter((word) => word.length > 2);
  if (words.length === 0) return [];
  return config.nodes
    .filter((node) => node.inStock > 0 && words.some((word) => node.path.includes(word)))
    .sort((a, b) => b.inStock - a.inStock)
    .slice(0, limit)
    .map((node) => node.path);
}

function findAttribute(nodes: PathConfigNode[], key: string): PathConfigAttribute | null {
  const wanted = squash(key);
  for (const node of nodes) {
    const match = node.attributes.find((attribute) => squash(attribute.key) === wanted);
    if (match) return match;
  }
  return null;
}

function textValuesOf(nodes: PathConfigNode[], key: string): string[] {
  const wanted = squash(key);
  const values = new Set<string>();
  for (const node of nodes) {
    for (const attribute of node.attributes) {
      if (squash(attribute.key) === wanted) attribute.values?.forEach((value) => values.add(value));
    }
  }
  return [...values];
}

/** `"30..34"`, `"..34"`, `"30.."`, `"32"` → bounds. */
export function parseNumericValue(raw: string): { min: number | null; max: number | null } | null {
  const text = raw.trim();
  const bounds = text.match(/^(-?\d+(?:\.\d+)?)?\s*\.\.\s*(-?\d+(?:\.\d+)?)?$/);
  if (bounds && (bounds[1] || bounds[2])) {
    return { min: bounds[1] ? Number(bounds[1]) : null, max: bounds[2] ? Number(bounds[2]) : null };
  }
  const single = Number(text);
  return Number.isFinite(single) && text !== "" ? { min: single, max: single } : null;
}

function resolveAttributes(
  nodes: PathConfigNode[],
  constraints: AttributeConstraint[],
  problems: string[]
): ResolvedAttribute[] {
  const resolved: ResolvedAttribute[] = [];
  for (const constraint of constraints) {
    const values = (constraint.values ?? []).map((value) => value.trim()).filter(Boolean);
    if (!constraint.key?.trim() || values.length === 0) continue;

    const attribute = findAttribute(nodes, constraint.key);
    if (!attribute) {
      const known = [...new Set(nodes.flatMap((node) => node.attributes.map((entry) => entry.key)))];
      problems.push(
        `attribute "${constraint.key}" does not exist on ${nodes[0].path}${known.length ? ` (available: ${known.join(", ")})` : ""}`
      );
      continue;
    }

    if (attribute.kind === "number") {
      const bounds = parseNumericValue(values[0]);
      if (!bounds) {
        problems.push(`attribute "${attribute.key}" is numeric; write it as "min..max", got "${values[0]}"`);
        continue;
      }
      resolved.push({ key: attribute.key, field: attribute.field, kind: "number", ...bounds });
      continue;
    }

    const vocabulary = textValuesOf(nodes, attribute.key);
    const compare = (value: string) => comparableAttributeValue(attribute, value);
    const bySquash = spellingsBySquash(vocabulary, compare);
    const canonical: string[] = [];
    for (const value of values) {
      const match = bySquash.get(compare(value));
      if (match) canonical.push(...match);
      else problems.push(`${attribute.key} "${value}" is not stocked on ${nodes[0].path} (stocked: ${vocabulary.join(", ")})`);
    }
    if (canonical.length > 0) {
      resolved.push({ key: attribute.key, field: attribute.field, kind: "text", values: [...new Set(canonical)] });
    }
  }
  return resolved;
}

/** The brand without a trailing audience word: "Moustache Men" is "Moustache". */
function withoutAudienceWord(brand: string): string | null {
  const words = brand.trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length < 2 || !QUALIFIER_TOKENS.has(words.at(-1)!.toLowerCase())) return null;
  return words.slice(0, -1).join(" ");
}

function addSpellings(index: Map<string, Set<string>>, key: string, spellings: readonly string[]): void {
  const entry = index.get(key) ?? new Set<string>();
  for (const spelling of spellings) entry.add(spelling);
  index.set(key, entry);
}

/**
 * Every stored spelling of each brand named. One brand is often written several ways ("MOUSTACHE
 * MEN", "Moustache Men", a misspelt "moutache men", "tom tailor" beside "Tom Tailor Men") and the
 * ACS brand filter is an exact match, so all of them are sent. A brand matches by any of its
 * spellings, or without the audience word, since the department already says whose clothes these are.
 */
function resolveBrands(nodes: PathConfigNode[], brands: string[], problems: string[]): string[] {
  const exact = new Map<string, Set<string>>();
  const loose = new Map<string, Set<string>>();
  for (const node of nodes) {
    for (const brand of node.brands) {
      const spellings = brand.spellings?.length ? brand.spellings : [brand.name];
      for (const spelling of spellings) {
        addSpellings(exact, squash(spelling), spellings);
        const bare = withoutAudienceWord(spelling);
        if (bare) addSpellings(loose, squash(bare), spellings);
      }
    }
  }
  const canonical: string[] = [];
  for (const brand of brands) {
    if (!brand?.trim()) continue;
    const match = exact.get(squash(brand)) ?? loose.get(squash(brand));
    if (match) canonical.push(...match);
    else problems.push(`brand "${brand}" has nothing in stock on ${nodes[0].path}`);
  }
  return [...new Set(canonical)];
}

/** Ruled-out brands, every stored spelling. One the path doesn't stock is already excluded, so it
 *  is dropped rather than sent back as a problem. */
function resolveExcludedBrands(nodes: PathConfigNode[], brands: string[]): string[] {
  return resolveBrands(nodes, brands, []);
}

/** Ruled-out text values in the store's spelling; numeric keys and unknown values are dropped. */
function resolveExcludedAttributes(
  nodes: PathConfigNode[],
  constraints: AttributeConstraint[]
): Extract<ResolvedAttribute, { kind: "text" }>[] {
  return resolveAttributes(nodes, constraints, []).filter(
    (attribute): attribute is Extract<ResolvedAttribute, { kind: "text" }> => attribute.kind === "text"
  );
}

const MAX_ALSO_PATHS = 2;

/** Size words shoppers type in Arabic letters, as the alpha sizes they mean. */
const ARABIC_SIZE_WORDS: Record<string, string> = {
  "اكس سمول": "XS",
  "إكس سمول": "XS",
  سمول: "S",
  ميديم: "M",
  مديم: "M",
  ميديوم: "M",
  وسط: "M",
  لارج: "L",
  "اكس لارج": "XL",
  "إكس لارج": "XL",
  "اكس اكس لارج": "XXL",
  "إكس إكس لارج": "XXL",
  "دبل اكس لارج": "XXL",
  "تربل اكس لارج": "XXXL",
};

/** The comparison forms of a size: `Medium` is `M`, `2XL` is `XXL`, `W32/L34` is `3234`. */
function sizeForms(label: string): string[] {
  const arabic = ARABIC_SIZE_WORDS[label.trim().replace(/\s+/g, " ")];
  return sizeLabelCandidates(arabic ?? label);
}

function resolveSizes(nodes: PathConfigNode[], sizes: string[], problems: string[]): string[] {
  const stocked = [...new Set(nodes.flatMap((node) => node.sizes ?? []))];
  const stockedForms = stocked.map((size) => ({ size, forms: new Set(sizeForms(size)) }));
  const canonical: string[] = [];
  for (const size of sizes) {
    if (!size?.trim()) continue;
    const wanted = sizeForms(size);
    const match = stockedForms.filter((entry) => wanted.some((form) => entry.forms.has(form))).map((entry) => entry.size);
    if (match.length > 0) canonical.push(...match);
    else {
      const listed = [...spellingsBySquash(stocked).values()].map((spellings) => spellings[0]);
      problems.push(
        `size "${size}" is not listed on ${nodes[0].path}${listed.length ? ` (listed: ${listed.join(", ")})` : " (no sizes recorded there)"}`
      );
    }
  }
  return [...new Set(canonical)];
}

/**
 * Checks a model's search against the store's real catalog before anything reaches ACS: the path
 * must be stocked, every brand and attribute value must exist on it, and the price window must
 * be able to contain something. Values are canonicalized to the config's own spelling so the
 * exact-match ACS filter can hit them. Any failure is returned as plain sentences the model can
 * read on its one corrective retry.
 */
export function validateSearchIntent(config: PersonaPathConfig, intent: RawSearchIntent): ValidationResult {
  const node = findNode(config, intent.path ?? "");
  if (!node || node.inStock === 0) {
    const nearby = suggestPaths(config, intent.path ?? "");
    return {
      ok: false,
      problems: [
        `path "${intent.path}" is not stocked in this store${nearby.length ? ` (stocked nearby: ${nearby.join("; ")})` : ""}`,
      ],
    };
  }

  const problems: string[] = [];
  const named = [node];
  for (const extra of (intent.also_paths ?? []).slice(0, MAX_ALSO_PATHS)) {
    if (!extra?.trim()) continue;
    const extraNode = findNode(config, extra);
    if (!extraNode || extraNode.inStock === 0) {
      const nearby = suggestPaths(config, extra);
      problems.push(`path "${extra}" is not stocked in this store${nearby.length ? ` (stocked nearby: ${nearby.join("; ")})` : ""}`);
    } else if (!named.some((entry) => entry.path === extraNode.path)) {
      named.push(extraNode);
    }
  }

  const counterpart = unisexCounterpart(config, node);
  const nodes: PathConfigNode[] = [];
  for (const entry of named) {
    nodes.push(entry);
    const twin = entry === node ? counterpart : unisexCounterpart(config, entry);
    if (twin && twin.inStock > 0 && !nodes.some((existing) => existing.path === twin.path)) nodes.push(twin);
  }

  const brands = resolveBrands(nodes, intent.brands ?? [], problems);
  const attributes = resolveAttributes(nodes, intent.attributes ?? [], problems);
  const sizes = resolveSizes(nodes, intent.sizes ?? [], problems);
  const excludeBrands = resolveExcludedBrands(nodes, intent.exclude_brands ?? []);
  const excludeAttributes = resolveExcludedAttributes(nodes, intent.exclude_attributes ?? []);

  const priceMin = typeof intent.price_min === "number" && intent.price_min > 0 ? intent.price_min : null;
  const priceMax = typeof intent.price_max === "number" && intent.price_max > 0 ? intent.price_max : null;
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
    problems.push(`price_min ${priceMin} is above price_max ${priceMax}`);
  }
  const floors = nodes.map(floorPrice).filter((value): value is number => value !== null);
  const floor = floors.length > 0 ? Math.min(...floors) : null;
  if (priceMax !== null && floor !== null && priceMax < floor) {
    problems.push(`nothing on ${node.path} costs ${priceMax} or less — the cheapest in stock is ${floor}`);
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    node,
    counterpart: counterpart && nodes.includes(counterpart) ? counterpart : null,
    spec: {
      paths: nodes.map((entry) => entry.path),
      brands,
      priceMin,
      priceMax,
      attributes,
      sizes,
      excludeIds: [...new Set((intent.exclude_ids ?? []).filter(Boolean))],
      ...(excludeBrands.length > 0 ? { excludeBrands } : {}),
      ...(excludeAttributes.length > 0 ? { excludeAttributes } : {}),
    },
  };
}
