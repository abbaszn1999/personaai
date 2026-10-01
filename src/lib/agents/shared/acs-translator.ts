import { buildAcsProductId, escapeFilterLiteral } from "@/lib/catalog/acs/isolation";
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
}

function anyOf(field: string, values: readonly string[]): string {
  return `(${field}: ANY(${values.map((value) => `"${escapeFilterLiteral(value)}"`).join(", ")}))`;
}

function range(field: string, min: number | null, max: number | null): string {
  return `(${field}: IN(${min === null ? "*" : `${min}i`}, ${max === null ? "*" : `${max}i`}))`;
}

/**
 * The spec as an ACS filter expression — the `extraFilter` that `searchProducts` ANDs after the
 * mandatory merchant and category-scope clauses. Stock is always required: nothing out of stock
 * is ever recommended. A size clause appears only when the shopper named a size; which size fits
 * them stays the size recommender's job.
 */
export function toAcsFilter(spec: SearchSpec, connectionId: string): string {
  const clauses: string[] = [];

  if (spec.paths.length > 0) clauses.push(anyOf("categories", spec.paths.map(toAcsCategory)));
  if (spec.brands.length > 0) clauses.push(anyOf("brands", spec.brands));
  if (spec.priceMin !== null || spec.priceMax !== null) clauses.push(range("price", spec.priceMin, spec.priceMax));
  clauses.push(`(availability: ANY("IN_STOCK"))`);
  if (spec.sizes.length > 0) clauses.push(anyOf("sizes", spec.sizes));

  for (const attribute of spec.attributes) {
    if (attribute.kind === "text") {
      if (attribute.values.length > 0) clauses.push(anyOf(attribute.field, attribute.values));
    } else if (attribute.min !== null || attribute.max !== null) {
      clauses.push(range(attribute.field, attribute.min, attribute.max));
    }
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
  if (spec.priceMin !== null && spec.priceMax !== null) lines.push(`price: ${money(spec.priceMin)}–${money(spec.priceMax)}`);
  else if (spec.priceMax !== null) lines.push(`price: up to ${money(spec.priceMax)}`);
  else if (spec.priceMin !== null) lines.push(`price: from ${money(spec.priceMin)}`);
  if (spec.sizes.length > 0) lines.push(`size: ${spec.sizes.join(" or ")}`);
  for (const attribute of spec.attributes) {
    if (attribute.kind === "text") lines.push(`${attribute.key}: ${attribute.values.join(" or ")}`);
    else lines.push(`${attribute.key}: ${attribute.min ?? "any"}..${attribute.max ?? "any"}`);
  }
  return lines;
}
