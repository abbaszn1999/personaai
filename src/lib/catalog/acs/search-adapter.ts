import type { SessionMeter } from "@/lib/billing/session-meter";
import type { CatalogCandidate, CatalogFilter, CategoryPath } from "@/lib/retrieval/types";
import { searchProducts } from "./client";
import { buildAcsFilterExpression } from "./filter-expression";
import { parseAcsProductId } from "./isolation";
import { CUSTOM_OPTION_ATTRIBUTE_PREFIX } from "./map-product";
import type { AcsProduct, AcsSearchResultItem } from "./types";

/**
 * Not yet wired into `runCosineMode`/`runFilterMode` — this is Phase 5 of the plan
 * (`search-adapter`), which only has to match their shape well enough for Phase 9's parallel
 * evaluation to run both paths side by side. Phase 10 (`cutover`) is what actually swaps
 * `cosine.ts`/`filter.ts` over to call these instead of `searchCatalogProducts`/
 * `filterCatalogProducts`.
 */

/**
 * Reconstructs the original category paths from the mapper's flattened, ancestor-prefixed
 * `categories` list (see map-product.ts's `flattenCategoryPaths`). Prefixes are a strict subset
 * of the full paths they were derived from, so the paths that are not themselves a prefix of any
 * other entry are exactly the original leaves — this recovers the input losslessly except in the
 * edge case where one selected category is itself a direct ancestor of another with nothing else
 * distinguishing them, which the UI never produces today.
 */
function unflattenCategoryPaths(categories: string[] | undefined): CategoryPath[] {
  const values = categories ?? [];
  const maximal = values.filter((value) => !values.some((other) => other !== value && other.startsWith(`${value} > `)));
  return maximal.map((value) => value.split(" > "));
}

/**
 * Folds every attribute this store's catalog actually recorded for a product into one bag,
 * keyed by a human label — mirrors `extractVariantAttributes`'s own bucket names on the write
 * side (map-product.ts) deliberately, so this never needs to know a specific attribute name to
 * work for every store. Two sources, both optional and independent of each other:
 *  - ACS's predefined variant fields (`colorInfo`, `sizes`, `materials`, `patterns`, `genders`,
 *    `ageGroups`) when the product has them.
 *  - Per-merchant custom option groups (fit, collar type, ...), which `map-product.ts` writes
 *    as `opt_<name>` custom attributes — recovered here by stripping that prefix back off.
 * Empty buckets are skipped so an absent attribute is simply missing from the bag, not present
 * with an empty array.
 */
function extractAttributes(product: AcsProduct): Record<string, string[]> {
  const bag: Record<string, string[]> = {};

  const colors = [...(product.colorInfo?.colors ?? []), ...(product.colorInfo?.colorFamilies ?? [])];
  if (colors.length > 0) bag.color = colors;
  if (product.sizes && product.sizes.length > 0) bag.size = product.sizes;
  if (product.materials && product.materials.length > 0) bag.material = product.materials;
  if (product.patterns && product.patterns.length > 0) bag.pattern = product.patterns;
  if (product.genders && product.genders.length > 0) bag.gender = product.genders;
  if (product.ageGroups && product.ageGroups.length > 0) bag.age_group = product.ageGroups;

  for (const [key, value] of Object.entries(product.attributes ?? {})) {
    if (!key.startsWith(CUSTOM_OPTION_ATTRIBUTE_PREFIX)) continue;
    const label = key.slice(CUSTOM_OPTION_ATTRIBUTE_PREFIX.length);
    if (!label || !value.text || value.text.length === 0) continue;
    bag[label] = value.text;
  }

  return bag;
}

/**
 * The actual `AcsProduct` → `CatalogCandidate` mapping, given the externalId separately rather
 * than parsed off a search result. Shared by `toCandidate` (search results) and
 * `catalog-reads.ts`'s direct-by-id reads (`GetProduct`, never a search) — the latter already
 * knows the externalId it asked for, so there is nothing to parse back out of the response.
 */
export function toCandidateFromProduct(
  externalId: string,
  product: AcsProduct,
  variantExternalId: string | null = null
): CatalogCandidate {
  return {
    externalId,
    variantExternalId,
    productGroupId: product.attributes?.product_group_id?.text?.[0] ?? null,
    title: product.title,
    brand: product.brands?.[0] ?? null,
    categoryPaths: unflattenCategoryPaths(product.categories),
    price: product.priceInfo?.price ?? null,
    currency: product.priceInfo?.currencyCode ?? null,
    inStock: product.availability === "IN_STOCK",
    productUrl: product.uri ?? null,
    imageUrl: product.images?.[0]?.uri ?? null,
    enrichedDescription: product.description ?? null,
    attributes: extractAttributes(product),
    garmentCategory: product.attributes?.garment_category?.text?.[0] ?? null,
    garmentSubcategory: product.attributes?.garment_subcategory?.text?.[0] ?? null,
    // ACS doesn't expose a per-result relevance score the way pgvector's cosine distance does;
    // ordering is already relevance-ranked by the API, so downstream code should rely on result
    // order rather than this field.
    similarity: undefined,
  };
}

/** Exported for `catalog-reads.ts`'s search-based reads (product group lookup, facets) — the
 *  ones that go through `SearchService.Search` and so must recover the externalId off the result
 *  item rather than already knowing it up front. */
export function toCandidate(item: AcsSearchResultItem): CatalogCandidate {
  // `item.id` (Product.id of the matched product) is the one field the API guarantees on every
  // search result — the nested `product` object only guarantees `product.name` is populated;
  // everything else, including `product.id` itself, depends on that attribute's retrievability
  // config (see `attributes-config.ts`), so reading the id off `product` is not reliable here.
  const { externalId: rawExternalId } = parseAcsProductId(item.id);

  // A matched `VARIANT`'s own id carries the composite `<productExternalId>::<variantExternalId>`
  // this app writes in `buildVariantAcsProducts` — split it back apart so `CatalogCandidate`'s own
  // `externalId` always names the real store *product*, matching every candidate before per-SKU
  // variants existed, with the specific matched SKU available separately for a caller that wants
  // it. A `PRIMARY` match's id has no separator and passes through unchanged.
  const separator = rawExternalId.indexOf("::");
  const externalId = separator === -1 ? rawExternalId : rawExternalId.slice(0, separator);
  const variantExternalId = separator === -1 ? null : rawExternalId.slice(separator + 2);

  return toCandidateFromProduct(externalId, item.product, variantExternalId);
}

export interface AcsSearchParams {
  connectionId: string;
  categoryScope: readonly string[];
  visitorId: string;
  limit: number;
  /** Written with the response's `attributionToken` after every call — a mutable out-param
   *  rather than a return value, because `searchWithRelaxation`'s callback shape is fixed to
   *  `Promise<CatalogCandidate[]>` (pgvector's adapters return the same shape, and have no
   *  token to carry). Callers read `.current` once `searchWithRelaxation` resolves, which holds
   *  the token from whichever rung actually produced the results shown. */
  attributionTokenOut?: { current?: string };
  /** Shopper-session accumulator. Catalog maintenance never sets this. */
  meter?: SessionMeter;
}

/** Semantic-leaning search — the ACS analogue of `searchCatalogProducts`. `queryText` is the
 *  natural-language statement (already built by `buildQueryStatement`), not an embedding: ACS
 *  does its own retrieval and ranking server-side, so there is nothing to embed client-side
 *  anymore. */
export async function acsSearchCatalogProducts(
  queryText: string,
  filter: CatalogFilter,
  params: AcsSearchParams
): Promise<CatalogCandidate[]> {
  if (params.categoryScope.length === 0) return [];

  const response = await searchProducts({
    connectionId: params.connectionId,
    categoryScope: params.categoryScope,
    visitorId: params.visitorId,
    query: queryText,
    pageSize: params.limit,
    extraFilter: buildAcsFilterExpression(filter, params.connectionId),
    meter: params.meter,
  });

  if (params.attributionTokenOut) params.attributionTokenOut.current = response.attributionToken;
  return (response.results ?? []).map(toCandidate);
}

/** Structural-only search — the ACS analogue of `filterCatalogProducts`. An empty `query` runs
 *  ACS in browse mode: still ranked (popularity/recency-driven, not semantic), but no keyword
 *  matching is applied. There is no client-side `seed` parameter the way the pgvector RPC takes
 *  one for its random ordering — ACS's browse ranking is deterministic given the same filter. */
export async function acsFilterCatalogProducts(filter: CatalogFilter, params: AcsSearchParams): Promise<CatalogCandidate[]> {
  if (params.categoryScope.length === 0) return [];

  const response = await searchProducts({
    connectionId: params.connectionId,
    categoryScope: params.categoryScope,
    visitorId: params.visitorId,
    query: "",
    pageSize: params.limit,
    extraFilter: buildAcsFilterExpression(filter, params.connectionId),
    meter: params.meter,
  });

  if (params.attributionTokenOut) params.attributionTokenOut.current = response.attributionToken;
  return (response.results ?? []).map(toCandidate);
}
