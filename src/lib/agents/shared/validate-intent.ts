import { findNode, floorPrice, normalizePath, unisexCounterpart } from "@/lib/catalog/path-config/lookup";
import type { PathConfigAttribute, PathConfigNode, PersonaPathConfig } from "@/lib/catalog/path-config/types";
import type { ResolvedAttribute, SearchSpec } from "./acs-translator";
import type { AttributeConstraint } from "../types";

/** A search as a model wrote it — every field still unverified. */
export interface RawSearchIntent {
  path: string;
  brands?: string[] | null;
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

const fold = (value: string) => value.trim().toLowerCase();

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
  const wanted = fold(key);
  for (const node of nodes) {
    const match = node.attributes.find((attribute) => fold(attribute.key) === wanted);
    if (match) return match;
  }
  return null;
}

function textValuesOf(nodes: PathConfigNode[], key: string): string[] {
  const wanted = fold(key);
  const values = new Set<string>();
  for (const node of nodes) {
    for (const attribute of node.attributes) {
      if (fold(attribute.key) === wanted) attribute.values?.forEach((value) => values.add(value));
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
    const byFold = new Map<string, string[]>();
    for (const entry of vocabulary) byFold.set(fold(entry), [...(byFold.get(fold(entry)) ?? []), entry]);
    const canonical: string[] = [];
    for (const value of values) {
      const match = byFold.get(fold(value));
      if (match) canonical.push(...match);
      else problems.push(`${attribute.key} "${value}" is not stocked on ${nodes[0].path} (stocked: ${vocabulary.join(", ")})`);
    }
    if (canonical.length > 0) {
      resolved.push({ key: attribute.key, field: attribute.field, kind: "text", values: [...new Set(canonical)] });
    }
  }
  return resolved;
}

/** Every stored spelling of each brand: stores often write one brand several ways ("MOUSTACHE
 *  MEN", "Moustache Men") and the ACS brand filter is an exact match, so all of them are sent. */
function resolveBrands(nodes: PathConfigNode[], brands: string[], problems: string[]): string[] {
  const byFold = new Map<string, Set<string>>();
  for (const node of nodes) {
    for (const brand of node.brands) {
      const key = fold(brand.name);
      if (!byFold.has(key)) byFold.set(key, new Set());
      byFold.get(key)!.add(brand.name);
    }
  }
  const canonical: string[] = [];
  for (const brand of brands) {
    if (!brand?.trim()) continue;
    const match = byFold.get(fold(brand));
    if (match) canonical.push(...match);
    else problems.push(`brand "${brand}" has nothing in stock on ${nodes[0].path}`);
  }
  return [...new Set(canonical)];
}

const SIZE_WORDS: Record<string, string> = {
  "extra small": "xs",
  "x-small": "xs",
  small: "s",
  medium: "m",
  large: "l",
  "extra large": "xl",
  "x-large": "xl",
  "xx-large": "xxl",
};

function resolveSizes(nodes: PathConfigNode[], sizes: string[], problems: string[]): string[] {
  const byFold = new Map<string, string[]>();
  for (const node of nodes) {
    for (const size of node.sizes ?? []) byFold.set(fold(size), [...(byFold.get(fold(size)) ?? []), size]);
  }
  const canonical: string[] = [];
  for (const size of sizes) {
    if (!size?.trim()) continue;
    const match = byFold.get(fold(size)) ?? byFold.get(SIZE_WORDS[fold(size)] ?? "");
    if (match) canonical.push(...match);
    else {
      const listed = [...new Set([...byFold.values()].map((spellings) => spellings[0]))];
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

  const counterpart = unisexCounterpart(config, node);
  const nodes = counterpart && counterpart.inStock > 0 ? [node, counterpart] : [node];
  const problems: string[] = [];

  const brands = resolveBrands(nodes, intent.brands ?? [], problems);
  const attributes = resolveAttributes(nodes, intent.attributes ?? [], problems);
  const sizes = resolveSizes(nodes, intent.sizes ?? [], problems);

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
    counterpart: nodes.length > 1 ? counterpart : null,
    spec: {
      paths: nodes.map((entry) => entry.path),
      brands,
      priceMin,
      priceMax,
      attributes,
      sizes,
      excludeIds: [...new Set((intent.exclude_ids ?? []).filter(Boolean))],
    },
  };
}
