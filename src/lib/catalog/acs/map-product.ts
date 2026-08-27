import type { CategoryPath } from "@/lib/retrieval/content-hash";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";
import { buildAcsProductId, merchantAttributeValue, MERCHANT_ID_ATTRIBUTE } from "./isolation";
import type { AcsAvailability, AcsCustomAttribute, AcsProduct } from "./types";

/**
 * Bump whenever this function's output shape changes in a way that should force merchants to
 * re-see and re-approve the mapping preview (see the mapping-preview-approval gate) — a new
 * field, a changed flattening rule, a renamed attribute. Purely additive, backward-compatible
 * changes don't strictly need a bump, but when in doubt, bump it: the cost of an unnecessary
 * re-approval is one click, the cost of a silent mapping change nobody saw is a support ticket.
 */
export const MAPPER_VERSION = 3;

const COLOR_OPTION_NAMES = new Set(["color", "colour"]);
const SIZE_OPTION_NAMES = new Set(["size"]);
const MATERIAL_OPTION_NAMES = new Set(["material", "materials", "fabric"]);
const PATTERN_OPTION_NAMES = new Set(["pattern", "patterns", "print"]);
const GENDER_OPTION_NAMES = new Set(["gender", "genders", "sex"]);
const AGE_GROUP_OPTION_NAMES = new Set(["age group", "agegroup", "age_group", "age"]);

/** Prefix for the catch-all custom attributes any *other* variant option group (fit, style, ...)
 *  falls into — namespaced so a store's own option name can never collide with this app's
 *  internal bookkeeping attributes (`merchant_id`, `source_category_ids`, ...), and so
 *  `attributes-config.ts`'s dynamic registration can recognize which keys it owns. */
const CUSTOM_OPTION_ATTRIBUTE_PREFIX = "opt_";

/** ACS custom-attribute keys may only contain alphanumerics and underscores. Merchant option
 *  names are free text (spacing, punctuation, mixed case), so this collapses anything else to `_`
 *  — lossy, but stable and collision-resistant enough for the option names real storefronts use. */
export function sanitizeAttributeKeySegment(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export interface MapProductInput {
  raw: RawCatalogProduct;
  connectionId: string;
  /** Every selected category this product belongs to, root-first per path — see
   *  `resolveCategoryPaths` in index-product.ts, unchanged by this migration. */
  categoryPaths: CategoryPath[];
  /** Internal try-on/bundle slot, title-derived — see `resolveGarmentCategory`, unchanged. */
  garmentCategory: string | null;
  garmentSubcategory: string | null;
  /** The merchant category ids this product belongs to — the same set pgvector's
   *  `source_category_ids` column holds. Carried through as a custom attribute so the search
   *  adapter can reproduce the old `.overlaps(source_category_ids, scope)` scope check: ACS has
   *  no notion of "this merchant's currently-selected categories" on its own, and without this
   *  attribute a deselected category's products would only leave search once marked out of stock
   *  — real stock and scope would be indistinguishable to a query that doesn't ask for
   *  `inStockOnly`. */
  sourceCategoryIds: string[];
}

/**
 * ACS's `categories: ANY(...)` matches by exact string equality against a stored categories
 * entry (confirmed against the official filter-and-order reference: matching
 * `"Pixel > featured accessories"` requires that exact string to be present, not a prefix of it).
 * A filter naming just the root ("Men") or a middle segment therefore only matches if that
 * segment is *also* stored as its own entry — so every ancestor prefix of a path is emitted
 * alongside the full path, not the leaf alone. Deduped across a product's multiple paths, since
 * two paths sharing a root would otherwise store that root twice.
 *
 * A product with no resolved paths (shouldn't happen for anything actually in scope, but
 * defensive) falls back to an empty array — the caller must not import a `PRIMARY` product with
 * zero categories, since ACS throws `INVALID_ARGUMENT` for that combination.
 */
function flattenCategoryPaths(paths: CategoryPath[]): string[] {
  const flattened = new Set<string>();
  for (const path of paths) {
    for (let depth = 1; depth <= path.length; depth++) {
      flattened.add(path.slice(0, depth).join(" > "));
    }
  }
  return [...flattened];
}

function toAvailability(inStock: boolean): AcsAvailability {
  return inStock ? "IN_STOCK" : "OUT_OF_STOCK";
}

export interface VariantAttributes {
  colors: string[];
  sizes: string[];
  materials: string[];
  patterns: string[];
  genders: string[];
  ageGroups: string[];
  /** Every other option group (fit, style, ...), keyed by its sanitized name — the catch-all this
   *  app has no dedicated ACS field for. One entry per distinct option name, values deduped by
   *  insertion order same as the named buckets. */
  customOptions: Map<string, string[]>;
}

/**
 * Buckets every `variantOptions` group into ACS's higher-signal named fields where one exists
 * (`colorInfo`/`sizes`/`materials`/`patterns`/`genders`/`ageGroups`), matched case-insensitively
 * since merchants and platforms don't agree on capitalization or spacing. Anything left over
 * (fit, style, ...) has no ACS-predefined equivalent, so it falls into `customOptions` instead of
 * being silently dropped — the mapper's previous behavior, and a real gap in how much of a
 * merchant's own catalog data ever reached ACS's ranking/embedding signal.
 */
function extractVariantAttributes(raw: RawCatalogProduct): VariantAttributes {
  const colors: string[] = [];
  const sizes: string[] = [];
  const materials: string[] = [];
  const patterns: string[] = [];
  const genders: string[] = [];
  const ageGroups: string[] = [];
  const customOptions = new Map<string, string[]>();

  for (const [optionName, values] of Object.entries(raw.variantOptions)) {
    const normalized = optionName.trim().toLowerCase();
    const labels = values.map((v) => v.label);
    if (labels.length === 0) continue;

    if (COLOR_OPTION_NAMES.has(normalized)) colors.push(...labels);
    else if (SIZE_OPTION_NAMES.has(normalized)) sizes.push(...labels);
    else if (MATERIAL_OPTION_NAMES.has(normalized)) materials.push(...labels);
    else if (PATTERN_OPTION_NAMES.has(normalized)) patterns.push(...labels);
    else if (GENDER_OPTION_NAMES.has(normalized)) genders.push(...labels);
    else if (AGE_GROUP_OPTION_NAMES.has(normalized)) ageGroups.push(...labels);
    else {
      const key = sanitizeAttributeKeySegment(optionName);
      if (!key) continue;
      const existing = customOptions.get(key) ?? [];
      customOptions.set(key, [...existing, ...labels]);
    }
  }

  return { colors, sizes, materials, patterns, genders, ageGroups, customOptions };
}

/**
 * `searchable`/`indexable` here are ignored by any catalog in `CATALOG_LEVEL_ATTRIBUTE_CONFIG`
 * mode — the default, and what this app's catalog uses. What actually makes an attribute
 * filterable is catalog-level registration; see `attributes-config.ts`, which must have been run
 * against the catalog or every scoped query fails with `Unsupported field "attributes.<key>"`.
 * Kept set regardless, since they're the operative flags under the older product-level mode and
 * cost nothing to send.
 */
function textAttribute(value: string, opts: { searchable: boolean; indexable: boolean }): AcsCustomAttribute {
  return { text: [value], searchable: opts.searchable, indexable: opts.indexable };
}

function textListAttribute(values: string[], opts: { searchable: boolean; indexable: boolean }): AcsCustomAttribute {
  return { text: values, searchable: opts.searchable, indexable: opts.indexable };
}

/**
 * The single, pure, deterministic mapper from this app's raw sync data to an ACS `Product`.
 * Called on every product, every sync — backfill batches and single-item webhook patches alike
 * — so the two ingestion paths never drift into producing subtly different shapes for the same
 * product. No LLM call, no randomness, no external lookup: same input always produces the same
 * output, matching `mapToCanonical`'s existing design principle in this codebase.
 *
 * `enriched_description` is deliberately not an input — that field was fully removed (see the
 * plan's "Enriched description ownership" resolution), so `description` here is always the
 * merchant's own raw text, unmodified.
 */
export function rawCatalogProductToAcsProduct(input: MapProductInput): AcsProduct {
  const { raw, connectionId, categoryPaths, garmentCategory, garmentSubcategory, sourceCategoryIds } = input;
  const { colors, sizes, materials, patterns, genders, ageGroups, customOptions } = extractVariantAttributes(raw);

  const attributes: Record<string, AcsCustomAttribute> = {
    [MERCHANT_ID_ATTRIBUTE]: textAttribute(merchantAttributeValue(connectionId), {
      searchable: false,
      indexable: true,
    }),
  };
  if (sourceCategoryIds.length > 0) {
    attributes.source_category_ids = textListAttribute(sourceCategoryIds, { searchable: false, indexable: true });
  }
  if (garmentCategory) {
    attributes.garment_category = textAttribute(garmentCategory, { searchable: false, indexable: true });
  }
  if (garmentSubcategory) {
    attributes.garment_subcategory = textAttribute(garmentSubcategory, { searchable: false, indexable: true });
  }
  if (raw.productGroupId) {
    // Pass-through only. Real primary/variant restructuring is deferred (see the plan's
    // "Variants" risk) — this preserves the grouping key for a future migration without acting
    // on it now, since every product today is imported as PRIMARY.
    attributes.product_group_id = textAttribute(raw.productGroupId, { searchable: false, indexable: true });
  }
  if (raw.sku) {
    // Exact-match/lookup use (support tooling, precise re-identification), not a keyword-search
    // target — `searchable: false` mirrors the other id-like attributes above.
    attributes.sku = textAttribute(raw.sku, { searchable: false, indexable: true });
  }
  // Everything `extractVariantAttributes` couldn't place in a predefined field (fit, style, ...):
  // real shopper-facing values, unlike the bookkeeping attributes above, so these are searchable
  // and registered as dynamically facetable (see `attributes-config.ts`'s
  // `ensureDynamicAttributeRegistered`) rather than treated like an internal id.
  for (const [key, values] of customOptions) {
    attributes[`${CUSTOM_OPTION_ATTRIBUTE_PREFIX}${key}`] = textListAttribute(values, {
      searchable: true,
      indexable: true,
    });
  }

  const product: AcsProduct = {
    id: buildAcsProductId(connectionId, raw.externalId),
    type: "PRIMARY",
    title: raw.title,
    categories: flattenCategoryPaths(categoryPaths),
    availability: toAvailability(raw.inStock),
    attributes,
  };

  if (raw.description) product.description = raw.description;
  if (raw.brand) product.brands = [raw.brand];
  if (raw.price !== null && raw.currency) {
    product.priceInfo = { price: raw.price, currencyCode: raw.currency };
  }
  if (raw.images.length > 0) {
    product.images = raw.images.map((uri) => ({ uri }));
  } else if (raw.imageUrl) {
    product.images = [{ uri: raw.imageUrl }];
  }
  if (raw.productUrl) product.uri = raw.productUrl;
  if (colors.length > 0) product.colorInfo = { colors };
  if (sizes.length > 0) product.sizes = sizes;
  if (materials.length > 0) product.materials = materials;
  if (patterns.length > 0) product.patterns = patterns;
  if (genders.length > 0) product.genders = genders;
  if (ageGroups.length > 0) product.ageGroups = ageGroups;

  return product;
}

export { CUSTOM_OPTION_ATTRIBUTE_PREFIX };
