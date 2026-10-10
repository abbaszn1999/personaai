import { buildAcsProductId, escapeFilterLiteral } from "@/lib/catalog/acs/isolation";
import { IMAGE_ATTRIBUTE } from "@/lib/catalog/acs/map-product";
import { toAcsCategory } from "@/lib/catalog/path-config/lookup";

/** An attribute constraint after validation: the exact ACS field and canonical values. */
export type ResolvedAttribute =
  | { key: string; field: string; kind: "text"; values: string[] }
  | { key: string; field: string; kind: "number"; min: number | null; max: number | null };

/** A search the validator accepted. Every value in it exists in the store's path config. */
export interface SearchSpec {
  /** Persona paths without the root, already including any unisex counterpart. */
  paths: string[];
  brands: string[];
  priceMin: number | null;
  priceMax: number | null;
  attributes: ResolvedAttribute[];
  /** Size labels the shopper named, every stored spelling. Empty unless they asked for one. */
  sizes: string[];
  excludeIds: string[];
  /** Brands the shopper ruled out, every stored spelling. */
  excludeBrands?: string[];
  /** Text attribute values the shopper ruled out ("not black"). */
  excludeAttributes?: Extract<ResolvedAttribute, { kind: "text" }>[];
}

export const IMAGE_FILTER_FIELD = `attributes.${IMAGE_ATTRIBUTE}`;

export interface AcsFilterOptions {
  /** Off only while ACS does not know the image attribute yet (no record carries it). */
  hideImageless?: boolean;
}

function anyOf(field: string, values: readonly string[]): string {
  return `(${field}: ANY(${values.map((value) => `"${escapeFilterLiteral(value)}"`).join(", ")}))`;
}

function noneOf(field: string, values: readonly string[]): string {
  return `(NOT ${field}: ANY(${values.map((value) => `"${escapeFilterLiteral(value)}"`).join(", ")}))`;
}

function range(field: string, min: number | null, max: number | null): string {
  return `(${field}: IN(${min === null ? "*" : `${min}i`}, ${max === null ? "*" : `${max}i`}))`;
}

/**
 * The spec as an ACS filter expression — the `extraFilter` that `searchProducts` ANDs after the
 * mandatory merchant and category-scope clauses. Stock is always required: nothing out of stock
 * is ever recommended. A size clause appears only when the shopper named a size; which size fits
 * them stays the size recommender's job.
 *
 * Records stamped as having no image are excluded with a negation, so a record written before the
 * stamp existed still matches: nothing disappears while a catalog is being re-imported.
 */
export function toAcsFilter(spec: SearchSpec, connectionId: string, options: AcsFilterOptions = {}): string {
  const clauses: string[] = [];

  if (spec.paths.length > 0) clauses.push(anyOf("categories", spec.paths.map(toAcsCategory)));
  if (spec.brands.length > 0) clauses.push(anyOf("brands", spec.brands));
  if (spec.excludeBrands?.length) clauses.push(noneOf("brands", spec.excludeBrands));
  if (spec.priceMin !== null || spec.priceMax !== null) clauses.push(range("price", spec.priceMin, spec.priceMax));
  clauses.push(`(availability: ANY("IN_STOCK"))`);
  if (options.hideImageless !== false) clauses.push(noneOf(IMAGE_FILTER_FIELD, ["false"]));
  if (spec.sizes.length > 0) clauses.push(anyOf("sizes", spec.sizes));

  for (const attribute of spec.attributes) {
    if (attribute.kind === "text") {
      if (attribute.values.length > 0) clauses.push(anyOf(attribute.field, attribute.values));
    } else if (attribute.min !== null || attribute.max !== null) {
      clauses.push(range(attribute.field, attribute.min, attribute.max));
    }
  }
  for (const attribute of spec.excludeAttributes ?? []) {
    if (attribute.values.length > 0) clauses.push(noneOf(attribute.field, attribute.values));
  }

  // Negated one id at a time: the documented negation form is `NOT field: ANY(...)`, and
  // `productId` is the namespaced ACS id, not the store's own.
  for (const id of spec.excludeIds) {
    clauses.push(`(NOT productId: ANY("${escapeFilterLiteral(buildAcsProductId(connectionId, id))}"))`);
  }

  return clauses.join(" AND ");
}

/** The constraints as a shopper would say them — used to explain an empty result honestly. */
export function describeSpec(spec: SearchSpec, currency: string | null): string[] {
  const money = (value: number) => `${currency ? `${currency} ` : ""}${value}`;
  const lines = [`category: ${spec.paths.join(" or ")}`];
  if (spec.brands.length > 0) lines.push(`brand: ${spec.brands.join(" or ")}`);
  if (spec.excludeBrands?.length) lines.push(`not brand: ${spec.excludeBrands.join(" or ")}`);
  if (spec.priceMin !== null && spec.priceMax !== null) lines.push(`price: ${money(spec.priceMin)}–${money(spec.priceMax)}`);
  else if (spec.priceMax !== null) lines.push(`price: up to ${money(spec.priceMax)}`);
  else if (spec.priceMin !== null) lines.push(`price: from ${money(spec.priceMin)}`);
  if (spec.sizes.length > 0) lines.push(`size: ${spec.sizes.join(" or ")}`);
  for (const attribute of spec.attributes) {
    if (attribute.kind === "text") lines.push(`${attribute.key}: ${attribute.values.join(" or ")}`);
    else lines.push(`${attribute.key}: ${attribute.min ?? "any"}..${attribute.max ?? "any"}`);
  }
  for (const attribute of spec.excludeAttributes ?? []) {
    lines.push(`not ${attribute.key}: ${attribute.values.join(" or ")}`);
  }
  return lines;
}
