import { fitGroupClause, fitRowSizes, FIT_TOLERANCE_CM } from "@/lib/agents/shared/fit";
import { isSizingGroup, type Measurement, type SizingGroup } from "@/lib/sizing/measurements";
import {
  isSizingTarget,
  TARGET_DEPARTMENTS,
  targetIsChild,
  targetMeasurements,
  targetRequiredMeasurements,
  type SizingTarget,
} from "@/lib/sizing/sizing-target";
import { personaSizingGroup } from "@/modules/store/mapping/persona-taxonomy";
import { escapeFilterLiteral } from "./isolation";
import type { AcsAvailability, AcsProduct, AcsSearchResultItem } from "./types";

/**
 * The Sizing Tester's ACS request for one garment category of one brand. Found Sizes sends one per
 * category the brand has: the shared fit clause for that category (`fitGroupClause`, fixed
 * tolerances from `FIT_TOLERANCE_CM`), the brand, the departments the sizing target shops in, and
 * in stock. What ACS answers is the result: nothing here removes a product ACS returned.
 */

const MAX_FILTER_TEXT_LENGTH = 256;
const FILTERABLE_MEASUREMENTS = new Set<Measurement>(["chest", "waist", "hip", "inseam", "height", "foot_length"]);

const MEASUREMENT_QUERY_KEYS: ReadonlyArray<{ measurement: Measurement; keys: readonly string[] }> = [
  { measurement: "chest", keys: ["chest"] },
  { measurement: "waist", keys: ["waist"] },
  { measurement: "hip", keys: ["hip", "hips"] },
  { measurement: "inseam", keys: ["inseam"] },
  { measurement: "height", keys: ["height"] },
  { measurement: "foot_length", keys: ["footLength", "foot_length"] },
];

export interface FitSearchQuery {
  /** `null` is the deliberate "No brand" selection, distinct from a missing parameter. */
  brand: string | null;
  /** All raw catalog names grouped beneath the selected canonical brand. */
  brandAliases?: string[];
  target: SizingTarget;
  fitGroup: SizingGroup;
  measurements: Partial<Record<Measurement, number>>;
}

export type FitSearchQueryResult = { ok: true; value: FitSearchQuery } | { ok: false; error: string };

export interface FitSearchProductDto {
  id: string;
  title: string;
  brand: string | null;
  sku: string | null;
  image: string | null;
  price: number | null;
  currency: string | null;
  /** Every size label the product carries. */
  sizes: string[];
  /** The in-stock sizes whose own chart row is within tolerance of the shopper, best first.
   *  Empty when ACS returned the product on an outward-rounded edge value or a stale index but no
   *  single stocked size is within tolerance. */
  fitSizes: string[];
  /** The product's stocked chart rows as indexed (`{"s":"M","chest":[93,98],…}`), which say which
   *  chart sized it. */
  fitRows: string[];
  availability: AcsAvailability | "UNKNOWN";
  uri: string | null;
  /** The Persona leaf the product sits in for this target and category (`men:top:t-shirt`). */
  leafKey: string | null;
  /** The same leaf as ACS stores it (`persona > men > top > t-shirt`). */
  personaPath: string | null;
}

function selectedBrand(params: URLSearchParams): string | null | undefined {
  if (!params.has("brand")) return undefined;
  const value = params.get("brand")?.trim() ?? "";
  if (!value || value.toLowerCase() === "no brand" || value === "__none__") return null;
  return value.length <= MAX_FILTER_TEXT_LENGTH ? value : undefined;
}

function firstParam(params: URLSearchParams, keys: readonly string[]): { key: string; value: string } | null {
  for (const key of keys) {
    if (params.has(key)) return { key, value: params.get(key) ?? "" };
  }
  return null;
}

export function parseFitSearchQuery(params: URLSearchParams): FitSearchQueryResult {
  const brand = selectedBrand(params);
  if (brand === undefined) return { ok: false, error: "A valid brand selection is required." };
  const suppliedBrands = params.getAll("brand").map((value) => value.trim());
  if (brand === null && suppliedBrands.length !== 1) {
    return { ok: false, error: "No brand cannot be combined with named brands." };
  }
  const brandAliases = brand === null
    ? []
    : [...new Set(suppliedBrands.filter((value) => value.length > 0 && value.length <= MAX_FILTER_TEXT_LENGTH))];
  if (brand !== null && (brandAliases.length === 0 || brandAliases.length !== suppliedBrands.length)) {
    return { ok: false, error: "A valid brand selection is required." };
  }

  const target = params.get("target");
  if (!isSizingTarget(target)) return { ok: false, error: "A valid sizing target (men, women or kid) is required." };

  const fitGroup = params.get("fitGroup");
  if (!isSizingGroup(fitGroup)) return { ok: false, error: "A valid fitGroup is required." };

  const applicable = new Set(
    targetMeasurements(fitGroup, target).filter((measurement) => FILTERABLE_MEASUREMENTS.has(measurement)),
  );
  const measurements: Partial<Record<Measurement, number>> = {};
  for (const { measurement, keys } of MEASUREMENT_QUERY_KEYS) {
    const supplied = firstParam(params, keys);
    if (!supplied) continue;
    if (!applicable.has(measurement)) {
      return { ok: false, error: `${supplied.key} is not applicable to ${fitGroup} for ${target}.` };
    }
    const value = Number(supplied.value);
    if (!Number.isFinite(value) || value <= 0 || value > 1_000) {
      return { ok: false, error: `${supplied.key} must be a positive number no greater than 1000.` };
    }
    measurements[measurement] = value;
  }

  const missing = targetRequiredMeasurements(fitGroup, target).filter((measurement) => measurements[measurement] === undefined);
  if (missing.length > 0) {
    return { ok: false, error: `${missing.join(", ")} is required to size ${fitGroup}.` };
  }

  return {
    ok: true,
    value: {
      brand,
      ...(brandAliases.length > 1 ? { brandAliases } : {}),
      target,
      fitGroup,
      measurements,
    },
  };
}

/**
 * The caller-controlled half of the ACS filter; `searchProducts` always prepends merchant
 * isolation and the non-empty category scope. The fit part is the shared `fitGroupClause`.
 * Null when the measurements cannot form it (the parser already requires them).
 */
export function buildFitSearchFilter(query: FitSearchQuery): string | null {
  const fit = fitGroupClause(query.fitGroup, query.measurements, targetIsChild(query.target));
  if (!fit) return null;
  const brand = brandClause(query);
  return [...(brand ? [brand] : []), fit, ...scopeClauses(query)].join(" AND ");
}

function brandClause(query: FitSearchQuery): string | null {
  // ACS has exact textual equality but no documented "predefined field is absent" predicate, so
  // "No brand" cannot be sent; `toFitSearchProducts` scopes it from the retrievable `brands`.
  if (query.brand === null) return null;
  const names = query.brandAliases?.length ? query.brandAliases : [query.brand];
  return `(${names.map((name) => `brands: ANY("${escapeFilterLiteral(name)}")`).join(" OR ")})`;
}

/** The ACS category entries of the target's departments, stored on every product beneath them. */
export function targetDepartmentPaths(target: SizingTarget): string[] {
  return TARGET_DEPARTMENTS[target].map((department) => `persona > ${department}`);
}

function scopeClauses(query: FitSearchQuery): string[] {
  const departments = targetDepartmentPaths(query.target).map((path) => `"${escapeFilterLiteral(path)}"`);
  return [`(categories: ANY(${departments.join(", ")}))`, `(availability: ANY("IN_STOCK"))`];
}

/**
 * The same request without any body measurement: this brand's sized, in-stock products of this
 * category for this target. The tester sends it alone to tell "no product fits" apart from "the
 * brand has nothing here".
 */
export function buildCategoryScopeFilter(query: FitSearchQuery): string {
  const brand = brandClause(query);
  return [
    ...(brand ? [brand] : []),
    `(attributes.fit_group: ANY("${query.fitGroup}"))`,
    ...scopeClauses(query),
  ].join(" AND ");
}

/** The tolerance each filtering measurement of this request is widened by, for display next to the filter. */
export function fitSearchTolerances(query: FitSearchQuery): Array<{ measurement: Measurement; value: number; tolerance: number }> {
  return targetRequiredMeasurements(query.fitGroup, query.target).flatMap((measurement) => {
    const value = query.measurements[measurement];
    return value === undefined ? [] : [{ measurement, value, tolerance: FIT_TOLERANCE_CM[measurement] ?? 0 }];
  });
}

/**
 * The fit field ACS rejected as unknown, if that is why a search failed. ACS only knows a custom
 * attribute once some product carries it, so a measurement no published chart has reached the
 * catalog with (e.g. foot length before any footwear chart is synced) is a 400, not an empty answer.
 */
export function unsupportedFitField(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const { status, body } = error as { status?: unknown; body?: unknown };
  if (status !== 400 || typeof body !== "string") return null;
  return body.match(/Unsupported field \\?"(attributes\.fit_[a-z_]+)\\?"/)?.[1] ?? null;
}

function bareAcsId(value: string): string {
  const slash = value.lastIndexOf("/");
  return slash === -1 ? value : value.slice(slash + 1);
}

function externalId(value: string, connectionId: string): string {
  const bare = bareAcsId(value);
  const prefix = `${connectionId}_`;
  return bare.startsWith(prefix) ? bare.slice(prefix.length) : bare;
}

function textAttribute(product: AcsProduct, key: string): string | null {
  return product.attributes?.[key]?.text?.find((value) => value.trim().length > 0) ?? null;
}

/**
 * The Persona leaf this product is sized under for the request: a `persona > dept > cat > sub`
 * entry in one of the target's departments whose category is the requested group. A product
 * mapped to several leaves keeps the first, which is the order its paths were indexed in.
 */
function personaLeaf(
  products: readonly AcsProduct[],
  group: SizingGroup,
  departments: readonly string[],
): { leafKey: string; personaPath: string } | null {
  for (const product of products) {
    for (const category of product.categories ?? []) {
      const [root, department, categoryId, sub] = category.split(" > ");
      if (root !== "persona" || !department || !categoryId || !sub) continue;
      if (!departments.includes(department) || personaSizingGroup(categoryId) !== group) continue;
      return { leafKey: `${department}:${categoryId}:${sub}`, personaPath: category };
    }
  }
  return null;
}

interface ProductGroup {
  primary: AcsProduct | null;
  variants: AcsProduct[];
  sizes: Set<string>;
  rows: Set<string>;
}

export interface FitSearchProducts {
  products: FitSearchProductDto[];
  /** "No brand" hits dropped because they carry a brand; ACS cannot express that scope. */
  outOfScope: number;
}

/**
 * ACS may return a matching PRIMARY, one or more matching VARIANTs, or both. Grouping on the
 * parent resource gives one real store product while keeping variant-specific commercial fields
 * (SKU, price and image). Every product ACS returned is kept: `fitSizes` says which of its
 * stocked sizes fit, and an empty list is exactly the case a coarse product-level range lets
 * through.
 */
export function toFitSearchProducts(
  items: readonly AcsSearchResultItem[],
  query: FitSearchQuery,
  connectionId: string,
): FitSearchProducts {
  const groups = new Map<string, ProductGroup>();
  const seenHits = new Set<string>();
  let outOfScope = 0;

  for (const item of items) {
    const hitId = bareAcsId(item.id);
    if (seenHits.has(hitId)) continue;
    seenHits.add(hitId);

    const product = item.product;
    if (query.brand === null && (product.brands?.[0]?.trim() ?? "")) {
      outOfScope += 1;
      continue;
    }
    const parentId = product.type === "VARIANT" && product.primaryProductId
      ? bareAcsId(product.primaryProductId)
      : hitId;
    const group = groups.get(parentId) ?? { primary: null, variants: [], sizes: new Set<string>(), rows: new Set<string>() };
    if (product.type === "VARIANT") group.variants.push(product);
    else group.primary ??= product;
    for (const size of [...(product.sizes ?? []), ...(product.attributes?.fit_size_labels?.text ?? [])]) {
      if (size.trim()) group.sizes.add(size);
    }
    for (const row of product.attributes?.fit_rows?.text ?? []) group.rows.add(row);
    groups.set(parentId, group);
  }

  const child = targetIsChild(query.target);
  const departments = TARGET_DEPARTMENTS[query.target];
  const products = [...groups].map(([parentId, group]) => {
    const variant = group.variants[0] ?? null;
    const identity = group.primary ?? variant!;
    const commercial = variant ?? identity;
    const leaf = personaLeaf([identity, commercial], query.fitGroup, departments);
    const rows = [...group.rows];
    return {
      id: externalId(parentId, connectionId),
      title: identity.title,
      brand: identity.brands?.[0] ?? commercial.brands?.[0] ?? null,
      sku: textAttribute(commercial, "sku") ?? textAttribute(identity, "sku"),
      image: commercial.images?.[0]?.uri ?? identity.images?.[0]?.uri ?? null,
      price: commercial.priceInfo?.price ?? identity.priceInfo?.price ?? null,
      currency: commercial.priceInfo?.currencyCode ?? identity.priceInfo?.currencyCode ?? null,
      sizes: [...group.sizes],
      fitSizes: fitRowSizes(rows, query.fitGroup, query.measurements, child),
      fitRows: rows,
      availability: "IN_STOCK" as const,
      uri: commercial.uri ?? identity.uri ?? null,
      leafKey: leaf?.leafKey ?? null,
      personaPath: leaf?.personaPath ?? null,
    };
  });
  return { products, outOfScope };
}
