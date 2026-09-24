import type { StoreCategory } from "@/modules/store/types";
import type { Product, ProductVariant } from "@/modules/commerce/types";
import type { CatalogPageOptions, RawCatalogProduct, RawCatalogVariant, VariantOptionGroups } from "@/lib/catalog/sync-types";
import { isCacheDisabled } from "@/lib/utils/disable-cache";

// Bumped from the now-unsupported `2024-10` (retired; Shopify falls forward to its oldest
// accessible stable version for a retired target rather than erroring, which would have made this
// app silently run against a version nobody tested against). `2026-07` is the latest stable
// version as of this writing, guaranteed not to change for its supported lifetime — see
// https://shopify.dev/docs/api/usage/versioning.
const API_VERSION = "2026-07";

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    /** True when this failure was Shopify's cost-based throttling (GraphQL `THROTTLED` or REST 429),
     *  as opposed to a real error — callers use this to back off and retry instead of surfacing it. */
    public throttled: boolean = false,
    public retryAfterMs?: number
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

/**
 * Normalizes user input (`mystore`, `mystore.myshopify.com`, `https://mystore.myshopify.com/`)
 * into a bare `mystore.myshopify.com` domain suitable for Admin API calls.
 */
export function normalizeShopifyDomain(input: string): string {
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!domain.includes(".")) {
    domain = `${domain}.myshopify.com`;
  }
  return domain;
}

interface ShopifyTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface CachedShopifyToken {
  accessToken: string;
  expiresAt: number;
}

/** In-process cache for client-credentials tokens. Shopify tokens last ~24h; we refresh a
 *  bit early so mid-search expiry never forces a failed GraphQL call. */
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;
const tokenCache = new Map<string, CachedShopifyToken>();

/**
 * Exchanges a merchant's own Shopify app Client ID + Secret for a short-lived Admin API
 * access token via the OAuth client credentials grant. Only works because each merchant's
 * app is installed on their own store (same Shopify organization) — see
 * https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant.
 * Tokens expire after ~24h; optional `cacheKey` (usually the store_connection id) reuses a
 * token across catalog search tiers in the same process.
 */
export async function getShopifyAccessToken(
  domain: string,
  clientId: string,
  clientSecret: string,
  cacheKey?: string,
  forceRefresh = false
): Promise<string> {
  const key = cacheKey ?? `${domain}:${clientId}`;
  const cached = forceRefresh || isCacheDisabled() ? undefined : tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  const data: ShopifyTokenResponse | null = await res.json().catch(() => null);

  if (!res.ok || !data?.access_token) {
    if (data?.error === "shop_not_permitted") {
      throw new ShopifyApiError(
        "This app's Client ID/Secret isn't valid for this store — make sure the app was created under the same Shopify account and installed on this store.",
        res.status
      );
    }
    throw new ShopifyApiError(
      data?.error_description || `Failed to authenticate with Shopify (${res.status})`,
      res.status
    );
  }

  if (!isCacheDisabled()) {
    tokenCache.set(key, { accessToken: data.access_token, expiresAt: Date.now() + TOKEN_TTL_MS });
  }
  return data.access_token;
}

async function shopifyFetch<T>(domain: string, accessToken: string, path: string): Promise<T> {
  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}${path}`, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new ShopifyApiError(`Shopify API request failed (${res.status})`, res.status);
  }

  return res.json() as Promise<T>;
}

/** Whether the order's line prices already include tax. Defaults to false when the order can't be read. */
export async function getShopifyOrderTaxesIncluded(
  domain: string,
  accessToken: string,
  orderId: string
): Promise<boolean> {
  const data = await shopifyFetch<{ order?: { taxes_included?: boolean } }>(
    domain,
    accessToken,
    `/orders/${encodeURIComponent(orderId)}.json?fields=taxes_included`
  );
  return data.order?.taxes_included === true;
}

/** Runs `fn` over `items` with at most `limit` calls in flight at once. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export interface ShopifyShopInfo {
  name: string;
  domain: string;
}

/** Confirms the domain + access token are valid by fetching shop info. Throws on failure. */
export async function verifyShopifyCredentials(domain: string, accessToken: string): Promise<ShopifyShopInfo> {
  const data = await shopifyFetch<{ shop: { name: string; myshopify_domain?: string } }>(
    domain,
    accessToken,
    "/shop.json"
  );
  return { name: data.shop.name, domain: data.shop.myshopify_domain ?? domain };
}

export async function getShopifyProductCount(domain: string, accessToken: string): Promise<number> {
  const data = await shopifyFetch<{ count: number }>(domain, accessToken, "/products/count.json");
  return data.count ?? 0;
}

/**
 * How many products sit in one collection.
 *
 * Only exact for a single collection. Shopify has no union count — membership is reachable only by
 * descending from one collection at a time — so totalling several of these double-counts every
 * product that belongs to more than one, which is why the caller reports a multi-collection total as
 * approximate rather than presenting the sum as fact.
 */
export async function countShopifyCollectionProducts(
  domain: string,
  accessToken: string,
  collectionId: string
): Promise<number> {
  const data = await shopifyFetch<{ count: number }>(
    domain,
    accessToken,
    `/products/count.json?collection_id=${encodeURIComponent(collectionId)}`
  );
  return data.count ?? 0;
}

interface ShopifyCollection {
  id: number;
  title: string;
  handle: string;
}

/**
 * Fetches custom + smart collections and their product counts (used as the app's "categories").
 *
 * Nothing here reports a parent, because Shopify collections genuinely have none: "Women",
 * "Dresses" and "Summer Sale" are peers in one flat bag. The merchant arranges them into a
 * hierarchy themselves in the Categories tab, which is what `handle` and `collectionType` are
 * carried for — they are the two things that let someone tell a real taxonomy collection from a
 * merchandising one when the titles alone are ambiguous.
 */
export async function getShopifyCollections(domain: string, accessToken: string): Promise<StoreCategory[]> {
  const [customRes, smartRes] = await Promise.all([
    shopifyFetch<{ custom_collections: ShopifyCollection[] }>(domain, accessToken, "/custom_collections.json?limit=250"),
    shopifyFetch<{ smart_collections: ShopifyCollection[] }>(domain, accessToken, "/smart_collections.json?limit=250"),
  ]);

  const collections = [
    ...(customRes.custom_collections ?? []).map((c) => ({ ...c, collectionType: "custom" as const })),
    ...(smartRes.smart_collections ?? []).map((c) => ({ ...c, collectionType: "smart" as const })),
  ];
  const seen = new Set<number>();
  const uniqueCollections = collections.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  return mapWithConcurrency(uniqueCollections, 4, async (collection): Promise<StoreCategory> => {
    const base = {
      id: String(collection.id),
      name: collection.title,
      handle: collection.handle,
      collectionType: collection.collectionType,
    };
    try {
      const countData = await shopifyFetch<{ count: number }>(
        domain,
        accessToken,
        `/products/count.json?collection_id=${collection.id}`
      );
      return { ...base, productCount: countData.count ?? 0 };
    } catch (err) {
      console.error(`[shopify getShopifyCollections] product count failed for collection ${collection.id}`, err);
      return { ...base, productCount: 0 };
    }
  });
}

// ─── Live catalog search (Admin GraphQL API) ──────────────────────────────────

export interface ShopifyThrottleStatus {
  currentlyAvailable: number;
  maximumAvailable: number;
  restoreRate: number;
}

interface ShopifyGraphqlErrorExtensions {
  code?: string;
}

interface ShopifyGraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: ShopifyGraphqlErrorExtensions }>;
  extensions?: { cost?: { throttleStatus?: ShopifyThrottleStatus } };
}

/** Low-level GraphQL POST. Surfaces `THROTTLED` cost-limit errors (HTTP 200 with a
 *  `errors[].extensions.code === "THROTTLED"` body, not a 429) as a throttled ShopifyApiError
 *  so callers can back off instead of treating it like a real failure. */
async function shopifyGraphqlFetch<T>(
  domain: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal
): Promise<{ data: T; throttleStatus?: ShopifyThrottleStatus }> {
  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    signal,
  });

  const body: ShopifyGraphqlResponse<T> | null = await res.json().catch(() => null);
  const throttleStatus = body?.extensions?.cost?.throttleStatus;

  if (body?.errors?.some((e) => e.extensions?.code === "THROTTLED")) {
    // Shopify's GraphQL cost bucket recovers at `restoreRate` points/sec — estimate the wait
    // from however far under water the bucket is, falling back to a safe default.
    const deficit = throttleStatus ? Math.max(0, 50 - throttleStatus.currentlyAvailable) : 50;
    const retryAfterMs = throttleStatus ? Math.ceil((deficit / throttleStatus.restoreRate) * 1000) : 2000;
    throw new ShopifyApiError("Shopify's API rate limit was reached — retrying shortly.", 200, true, retryAfterMs);
  }

  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get("retry-after") ?? "2");
    throw new ShopifyApiError("Shopify's API rate limit was reached — retrying shortly.", 429, true, retryAfterSec * 1000);
  }

  if (!res.ok || !body || body.errors?.length) {
    const message = body?.errors?.[0]?.message ?? `Shopify GraphQL request failed (${res.status})`;
    throw new ShopifyApiError(message, res.status);
  }

  if (!body.data) {
    throw new ShopifyApiError("Shopify GraphQL returned no data.");
  }

  return { data: body.data, throttleStatus };
}

/** Shopify's own index of distinct `vendor` strings in the shop, which is where each product's
 *  `brand` comes from. In Admin GraphQL 2026-07 this deprecated field only accepts `first` — unlike
 *  ordinary connections it rejects `after` — so this is deliberately one maximum-sized request. */
const PRODUCT_VENDORS_QUERY = `
  query ProductVendors {
    shop {
      productVendors(first: 250) {
        edges { node }
      }
    }
  }
`;

interface ShopifyProductVendorsResponse {
  shop: {
    productVendors: {
      edges: Array<{ node: string }>;
    };
  };
}

/**
 * Every vendor in the shop, for the Stage 1 per-brand sizing exceptions.
 *
 * Complete where a sample of products is not — a shop carrying forty labels would otherwise only be
 * offered the handful appearing in the sampled page. Shopify maintains this index itself, so it
 * costs one small query rather than a walk of the catalog.
 */
export async function getShopifyVendors(domain: string, accessToken: string): Promise<string[]> {
  const result = await shopifyGraphqlFetch<ShopifyProductVendorsResponse>(
    domain,
    accessToken,
    PRODUCT_VENDORS_QUERY,
    {}
  );
  return result.data.shop.productVendors.edges.map((edge) => edge.node);
}

export interface ShopifyMetafieldDefinition {
  namespace: string;
  key: string;
  name: string;
  /** Shopify's own declared type (`single_line_text_field`, `json`, `number_integer`, ...),
   *  passed through verbatim rather than mapped to `CmsColumnValueType` — the mapping is a lossy
   *  many-to-one, and the caller (`cms-column-discovery.ts`) already treats every metafield as
   *  text for binding purposes regardless of its declared type. */
  type: string;
  description: string | null;
}

const METAFIELD_DEFINITIONS_QUERY = `
  query MetafieldDefinitions($ownerType: MetafieldOwnerType!, $first: Int!, $after: String) {
    metafieldDefinitions(ownerType: $ownerType, first: $first, after: $after) {
      nodes { namespace key name type { name } description }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface ShopifyMetafieldDefinitionsResponse {
  metafieldDefinitions: {
    nodes: Array<{ namespace: string; key: string; name: string; type: { name: string }; description: string | null }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

/**
 * Every metafield definition a merchant has actually declared for `ownerType` — via the Shopify
 * admin's own "Manage custom data" UI or an app — as opposed to a metafield some product merely
 * happens to have a value stored under. This is what lets Stage 1 name a merchant's custom field
 * before any of the 25 sampled products carry a value for it: a definition with no populated
 * product yet is still real and still worth offering.
 *
 * Bounded to 20 pages of 100 (2,000 definitions) for the same reason `getShopifyVendors` bounds
 * itself — past that this is not a real single-merchant custom-data need any dropdown should try
 * to render flat.
 */
export async function listShopifyMetafieldDefinitions(
  domain: string,
  accessToken: string,
  ownerType: "PRODUCT" | "PRODUCTVARIANT",
  signal?: AbortSignal
): Promise<ShopifyMetafieldDefinition[]> {
  const all: ShopifyMetafieldDefinition[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 20; page++) {
    const result: { data: ShopifyMetafieldDefinitionsResponse } = await shopifyGraphqlFetch(
      domain,
      accessToken,
      METAFIELD_DEFINITIONS_QUERY,
      { ownerType, first: 100, after: cursor },
      signal
    );

    const { nodes, pageInfo } = result.data.metafieldDefinitions;
    all.push(
      ...nodes.map((node) => ({
        namespace: node.namespace,
        key: node.key,
        name: node.name,
        type: node.type.name,
        description: node.description,
      }))
    );

    if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
    cursor = pageInfo.endCursor;
  }

  return all;
}

interface ShopifyGraphqlVariantNode {
  id: string;
  availableForSale: boolean;
  selectedOptions: Array<{ name: string; value: string }>;
}

interface ShopifyGraphqlProductNode {
  id: string;
  title: string;
  descriptionHtml: string;
  tags: string[];
  status: string;
  featuredImage: { url: string } | null;
  priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } };
  totalInventory: number;
  variants: { nodes: ShopifyGraphqlVariantNode[] };
  collections: { nodes: Array<{ id: string }> };
}

const PRODUCT_NODE_FIELDS = `
  id
  title
  descriptionHtml
  tags
  status
  featuredImage { url }
  priceRangeV2 { minVariantPrice { amount currencyCode } }
  totalInventory
  variants(first: 25) {
    nodes { id availableForSale selectedOptions { name value } }
  }
  collections(first: 1) { nodes { id } }
`;

const PRODUCT_SEARCH_QUERY = `
  query SearchProducts($query: String!, $first: Int!, $after: String) {
    products(first: $first, after: $after, query: $query, sortKey: RELEVANCE) {
      nodes { ${PRODUCT_NODE_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

/** Collection-scoped variant of the search above. Shopify's top-level `products(query:)` search
 *  field has a documented bug/limitation where AND-ing a `collection_id:` term with any other
 *  term (even just `status:active`) unreliably matches nothing — see
 *  https://community.shopify.dev/t/filtering-products-by-collection-id-not-working-properly/9723.
 *  Querying a collection's own `products` connection sidesteps that `collection_id:` bug, but
 *  that connection has no `query` search argument at all (only pagination/sortKey) — so text
 *  and status matching for this tier happens client-side in `fetchCollectionProducts` below. */
const COLLECTION_PRODUCT_SEARCH_QUERY = `
  query SearchCollectionProducts($id: ID!, $first: Int!, $after: String) {
    collection(id: $id) {
      products(first: $first, after: $after, sortKey: BEST_SELLING) {
        nodes { ${PRODUCT_NODE_FIELDS} }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

/** Guesses a variant option's UI type from its name — Shopify lets merchants name options
 *  freely, so this is a best-effort match against the common conventions. */
function guessVariantType(optionName: string): ProductVariant["type"] {
  const n = optionName.toLowerCase();
  if (n.includes("size")) return "size";
  if (n.includes("colour") || n.includes("color")) return "color";
  return "style";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Strips the `gid://shopify/Collection/` (or `Product`, `ProductVariant`, ...) prefix Admin
 *  GraphQL ids come wrapped in, matching the plain numeric-string ids used elsewhere (e.g.
 *  `StoreCategory.id`, or the REST Ajax `/cart/add.js` variant id). */
export function bareShopifyId(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1] ?? gid;
}

function mapShopifyProductNode(node: ShopifyGraphqlProductNode): Product | null {
  // A product with no photo has nothing useful to show in this visual UI — skip it rather
  // than rendering a broken image.
  if (!node.featuredImage?.url) return null;

  const variants: ProductVariant[] = node.variants.nodes.flatMap((v) =>
    v.selectedOptions.map((opt) => ({
      id: v.id,
      label: opt.value,
      value: opt.value.toLowerCase(),
      type: guessVariantType(opt.name),
      inStock: v.availableForSale,
    }))
  );

  return {
    id: node.id,
    name: node.title,
    description: stripHtml(node.descriptionHtml),
    price: Number(node.priceRangeV2.minVariantPrice.amount),
    currency: node.priceRangeV2.minVariantPrice.currencyCode,
    imageUrl: node.featuredImage.url,
    categoryId: node.collections.nodes[0] ? bareShopifyId(node.collections.nodes[0].id) : "",
    tags: node.tags,
    variants,
    rating: 0,
    reviewCount: 0,
    inStock: node.totalInventory > 0,
  };
}

export interface SearchShopifyProductsInput {
  query?: string;
  maxPrice?: number;
  /** Bare collection id (as stored in `StoreCategory.id`) to scope the search to. */
  collectionId?: string;
  limit?: number;
}

/** Builds a Shopify Admin search filter for one or more collection ids. Comma-separated
 *  values are OR'd — `collection_id:1,2` is invalid in Shopify's query language. */
export function buildShopifyCollectionFilter(collectionId: string): string | null {
  const ids = collectionId
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id));
  if (ids.length === 0) return null;
  if (ids.length === 1) return `collection_id:${ids[0]}`;
  return `(${ids.map((id) => `collection_id:${id}`).join(" OR ")})`;
}

/**
 * Live filtered product search via the Admin GraphQL API's structured search syntax —
 * mirrors the same free-text matching the Admin search bar uses (title, vendor, sku, tags).
 * Price filtering is applied client-side after an over-fetch since the search query language
 * doesn't reliably support numeric price comparisons across API versions.
 */
/** Real per-page ceiling for a single Admin GraphQL connection request (`first`) — going
 *  beyond this in one request errors out, so a larger pool is fetched by paging with `after`
 *  instead. */
const SHOPIFY_PAGE_SIZE = 250;
/** Safety valve on how many 250-item pages one search call will page through, so an
 *  aggressively large CATALOG_SEARCH_POOL_SIZE on a huge catalog can't turn one shopper
 *  message into dozens of sequential Admin API round trips. 4 pages = up to 1000 candidates. */
const SHOPIFY_MAX_PAGES = 4;

interface ShopifyProductsConnectionData {
  nodes: ShopifyGraphqlProductNode[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

/** Case-insensitive containment check against a product's title/tags/description — the closest
 *  client-side equivalent to the free-text search the top-level `products(query:)` field does,
 *  since `Collection.products` has no `query` argument at all. */
function collectionNodeMatchesKeyword(node: ShopifyGraphqlProductNode, keyword: string): boolean {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return true;
  if (node.title.toLowerCase().includes(needle)) return true;
  if (node.tags.some((tag) => tag.toLowerCase().includes(needle))) return true;
  return stripHtml(node.descriptionHtml).toLowerCase().includes(needle);
}

/** Pages through one collection's `products` connection (never combines `collection_id:` with
 *  other search terms — see the comment on COLLECTION_PRODUCT_SEARCH_QUERY above) and filters
 *  by status/keyword client-side, since that connection accepts no `query` argument to push
 *  those filters down to Shopify itself. */
async function fetchCollectionProducts(
  domain: string,
  accessToken: string,
  collectionNumericId: string,
  keyword: string,
  fetchLimit: number,
  signal?: AbortSignal
): Promise<{ nodes: ShopifyGraphqlProductNode[]; throttleStatus?: ShopifyThrottleStatus }> {
  const matched: ShopifyGraphqlProductNode[] = [];
  let cursor: string | undefined;
  let throttleStatus: ShopifyThrottleStatus | undefined;
  const collectionGid = `gid://shopify/Collection/${collectionNumericId}`;

  for (let page = 0; page < SHOPIFY_MAX_PAGES && matched.length < fetchLimit; page++) {
    const { data, throttleStatus: pageThrottleStatus } = await shopifyGraphqlFetch<{
      collection: { products: ShopifyProductsConnectionData } | null;
    }>(
      domain,
      accessToken,
      COLLECTION_PRODUCT_SEARCH_QUERY,
      { id: collectionGid, first: SHOPIFY_PAGE_SIZE, after: cursor },
      signal
    );

    throttleStatus = pageThrottleStatus ?? throttleStatus;
    const connection = data.collection?.products;
    if (!connection) break;

    for (const node of connection.nodes) {
      if (node.status !== "ACTIVE") continue;
      if (!collectionNodeMatchesKeyword(node, keyword)) continue;
      matched.push(node);
      if (matched.length >= fetchLimit) break;
    }

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
    cursor = connection.pageInfo.endCursor;
  }

  return { nodes: matched, throttleStatus };
}

export async function searchShopifyProducts(
  domain: string,
  accessToken: string,
  input: SearchShopifyProductsInput,
  signal?: AbortSignal
): Promise<{ results: Product[]; throttleStatus?: ShopifyThrottleStatus }> {
  const limit = Math.max(input.limit ?? 6, 1);
  // Over-fetch when filtering by price so cheaper matches beyond the first page still surface.
  const fetchLimit = input.maxPrice ? Math.max(limit * 3, limit) : limit;

  const textFilters = ["status:active"];
  if (input.query?.trim()) {
    // An unprefixed quoted term matches the same fields as the Admin UI's search box.
    textFilters.push(`"${input.query.trim().replace(/"/g, "")}"`);
  }
  const textQuery = textFilters.join(" AND ");

  const collectionIds = input.collectionId
    ? input.collectionId
        .split(",")
        .map((id) => id.trim())
        .filter((id) => /^\d+$/.test(id))
    : [];

  let throttleStatus: ShopifyThrottleStatus | undefined;
  const mapped: Product[] = [];

  if (collectionIds.length > 0) {
    // Multiple synced categories can share a display name and resolve to several collection
    // ids — fetch each collection's own products connection separately (never OR'd/AND'd via
    // `collection_id:` search terms) and merge, deduping by product id.
    const seen = new Set<string>();
    for (const collectionId of collectionIds) {
      if (mapped.length >= fetchLimit) break;
      const { nodes, throttleStatus: collectionThrottleStatus } = await fetchCollectionProducts(
        domain,
        accessToken,
        collectionId,
        input.query ?? "",
        fetchLimit - mapped.length,
        signal
      );
      throttleStatus = collectionThrottleStatus ?? throttleStatus;
      for (const node of nodes) {
        const product = mapShopifyProductNode(node);
        if (product && !seen.has(product.id)) {
          seen.add(product.id);
          mapped.push(product);
        }
      }
    }
  } else {
    let cursor: string | undefined;
    for (let page = 0; page < SHOPIFY_MAX_PAGES && mapped.length < fetchLimit; page++) {
      const pageSize = Math.min(SHOPIFY_PAGE_SIZE, fetchLimit - mapped.length);
      const { data, throttleStatus: pageThrottleStatus } = await shopifyGraphqlFetch<{
        products: ShopifyProductsConnectionData;
      }>(domain, accessToken, PRODUCT_SEARCH_QUERY, { query: textQuery, first: pageSize, after: cursor }, signal);

      throttleStatus = pageThrottleStatus ?? throttleStatus;
      mapped.push(...data.products.nodes.map(mapShopifyProductNode).filter((p): p is Product => p !== null));

      if (!data.products.pageInfo.hasNextPage || !data.products.pageInfo.endCursor) break;
      cursor = data.products.pageInfo.endCursor;
    }
  }

  const priced = input.maxPrice ? mapped.filter((p) => p.price <= input.maxPrice!) : mapped;
  return { results: priced.slice(0, limit), throttleStatus };
}

// ─── Full-catalog listing (indexing, not search) ──────────────────────────────

interface ShopifyCatalogVariantNode {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  availableForSale: boolean;
  inventoryQuantity: number | null;
  image: { url: string } | null;
  selectedOptions: Array<{ name: string; value: string }>;
  inventoryItem: {
    measurement: {
      weight: { value: number; unit: string } | null;
    };
  };
}

interface ShopifyCatalogProductNode {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  vendor: string | null;
  productType: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  onlineStoreUrl: string | null;
  templateSuffix: string | null;
  totalInventory: number;
  seo: { title: string | null; description: string | null };
  /** Free-text labels the merchant applies themselves — no ACS target defaults to these, so they
   *  reach Stage 1 as a `field.tags` column exactly like a metafield (see `toShopifyBuiltInFields`). */
  tags: string[];
  featuredImage: { url: string } | null;
  images: { nodes: Array<{ url: string }> };
  priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } };
  variants: { nodes: ShopifyCatalogVariantNode[] };
  collections: { nodes: Array<{ id: string; title: string }> };
  /** Present only when the caller asked for metafields — named ones on an indexing walk, a sample
   *  of whatever exists during Stage 1's column discovery. */
  metafields?: { nodes: Array<{ namespace: string; key: string; value: string | null }> };
}

/** How many metafields a discovery page reads per product. Enough to see what a normal storefront
 *  keeps on a product without turning the sample into a paginated walk of its own. */
const METAFIELD_DISCOVERY_LIMIT = 25;

/**
 * How many of a product's own variants are read per request. Raised from an earlier 50 — a
 * merchant with a full colour × size matrix (8 colours × 10 sizes = 80) was silently having its
 * tail truncated, and every truncated variant is a real SKU the ACS `VARIANT` emission
 * (`rawCatalogProductToAcsProducts`) never gets to write. Shopify's Admin GraphQL connection cap
 * is 250 per request; deeper pagination than that is not attempted here — a single product
 * beyond 250 variants pages no further, which covers every real storefront but the rare
 * marketplace-scale outlier.
 */
const SHOPIFY_VARIANT_FETCH_LIMIT = 250;

/**
 * A metafield identifier safe to inline into a query document.
 *
 * The identifiers reach here from a merchant's saved mapping, so they are untrusted input going into
 * a GraphQL string. Shopify's own namespace/key grammar is narrower than this, which makes rejecting
 * anything outside it free: a value that fails this test could not have named a real metafield anyway.
 */
function isSafeMetafieldIdentifier(identifier: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_.-]{1,64}$/.test(identifier);
}

/**
 * The metafields selection for one catalog request, or nothing when the caller wants none.
 *
 * `keys` is omitted rather than passed empty on the discovery path: Shopify changed `keys: []` to
 * mean "no metafields" rather than "the first N", so an empty array would silently return nothing.
 */
function metafieldsSelection(options: Pick<CatalogPageOptions, "metafieldKeys" | "discoverCustomFields">): string {
  if (options.discoverCustomFields) {
    return `metafields(first: ${METAFIELD_DISCOVERY_LIMIT}) { nodes { namespace key value } }`;
  }

  const keys = (options.metafieldKeys ?? []).filter(isSafeMetafieldIdentifier);
  if (keys.length === 0) return "";

  const list = keys.map((key) => `"${key}"`).join(", ");
  return `metafields(first: ${keys.length}, keys: [${list}]) { nodes { namespace key value } }`;
}

/** A superset of the search query's fields — indexing needs vendor, handle, the merchant's
 *  own product type, real variant ids and the update timestamp, none of which the card-shaped
 *  `Product` carries. */
function catalogProductFields(
  options: Pick<CatalogPageOptions, "metafieldKeys" | "discoverCustomFields"> = {}
): string {
  return `
  id
  handle
  title
  descriptionHtml
  vendor
  productType
  status
  createdAt
  updatedAt
  publishedAt
  onlineStoreUrl
  templateSuffix
  totalInventory
  seo { title description }
  tags
  featuredImage { url }
  images(first: 5) { nodes { url } }
  priceRangeV2 { minVariantPrice { amount currencyCode } }
  variants(first: ${SHOPIFY_VARIANT_FETCH_LIMIT}) {
    nodes {
      id
      title
      sku
      barcode
      price
      compareAtPrice
      availableForSale
      inventoryQuantity
      image { url }
      selectedOptions { name value }
      inventoryItem {
        measurement {
          weight { value unit }
        }
      }
    }
  }
  collections(first: 10) { nodes { id title } }
  ${metafieldsSelection(options)}
`;
}

function catalogListQuery(fields: string): string {
  return `
  query ListCatalog($query: String!, $first: Int!, $after: String) {
    products(first: $first, after: $after, query: $query, sortKey: ID) {
      nodes { ${fields} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;
}

function catalogByIdsQuery(fields: string): string {
  return `
  query CatalogByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product { ${fields} }
    }
  }
`;
}

/**
 * Products of one collection.
 *
 * A separate query because `products(query:)` has no collection predicate — collection
 * membership is only reachable by descending from the collection itself. The nested connection
 * paginates independently, so the cursor here is not interchangeable with the one above.
 */
function collectionProductsQuery(fields: string): string {
  return `
  query ListCollectionProducts($id: ID!, $first: Int!, $after: String) {
    collection(id: $id) {
      products(first: $first, after: $after) {
        nodes { ${fields} }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;
}

function toVariantOptionGroups(nodes: ShopifyCatalogVariantNode[]): VariantOptionGroups {
  const groups: VariantOptionGroups = {};

  for (const variant of nodes) {
    for (const option of variant.selectedOptions) {
      const bucket = (groups[option.name] ??= []);
      if (!bucket.some((entry) => entry.label === option.value)) {
        bucket.push({ id: variant.id, label: option.value });
      }
    }
  }

  return groups;
}

/** One `ShopifyCatalogVariantNode` as a platform-neutral `RawCatalogVariant` — the real per-SKU
 *  price/stock/image/options data that lets the mapper emit a true ACS `VARIANT` record per SKU
 *  instead of only ever aggregating a whole colour/size matrix onto one `PRIMARY`. */
function toShopifyCatalogVariant(
  variant: ShopifyCatalogVariantNode,
  domain: string,
  handle: string,
  fallbackImage: string | null,
  currency: string
): RawCatalogVariant {
  const selectedOptions: Record<string, string> = {};
  for (const option of variant.selectedOptions) selectedOptions[option.name] = option.value;

  return {
    externalId: variant.id,
    sku: variant.sku,
    barcode: variant.barcode?.trim() || null,
    title: variant.title !== "Default Title" ? variant.title : null,
    price: Number(variant.price) || null,
    compareAtPrice: variant.compareAtPrice ? Number(variant.compareAtPrice) || null : null,
    currency,
    inStock: variant.availableForSale,
    inventoryQuantity: variant.inventoryQuantity,
    imageUrl: variant.image?.url ?? fallbackImage,
    selectedOptions,
    weight: variant.inventoryItem.measurement.weight?.value ?? null,
    weightUnit: variant.inventoryItem.measurement.weight?.unit ?? null,
    // Shopify's storefront resolves this query param to the matching variant on the product page.
    productUrl: handle ? `https://${domain}/products/${handle}?variant=${bareShopifyId(variant.id)}` : null,
    customFields: {},
  };
}

function mapShopifyCatalogNode(node: ShopifyCatalogProductNode, domain: string): RawCatalogProduct {
  const images = node.images.nodes.map((image) => image.url);
  const featured = node.featuredImage?.url ?? images[0] ?? null;

  return {
    externalId: node.id,
    // The handle is stable across renames, which the numeric id is too — but the handle also
    // survives a product being recreated during a catalog re-import.
    productGroupId: node.handle || bareShopifyId(node.id),
    sku: node.variants.nodes[0]?.sku ?? null,
    title: node.title,
    description: stripHtml(node.descriptionHtml),
    brand: node.vendor?.trim() || null,
    // Product type first — the merchant's own classification, and a better fit for a garment
    // slot guess than a marketing collection like "Summer Sale" — but every collection follows
    // too, kept for reference. Filtering itself runs on `sourceCategoryIds`, not this list.
    rawCategories: [node.productType?.trim(), ...node.collections.nodes.map((c) => c.title)].filter(
      (label): label is string => Boolean(label)
    ),
    // Bare ids, matching what `getShopifyCollections` stores against the merchant's selection.
    // GraphQL returns global ids here, so leaving them qualified would make every scope check
    // compare `gid://shopify/Collection/123` against `123` and never overlap.
    sourceCategoryIds: node.collections.nodes.map((collection) => bareShopifyId(collection.id)),
    price: Number(node.priceRangeV2.minVariantPrice.amount) || null,
    currency: node.priceRangeV2.minVariantPrice.currencyCode,
    inStock: node.totalInventory > 0,
    productUrl: node.handle ? `https://${domain}/products/${node.handle}` : null,
    imageUrl: featured,
    images,
    variantOptions: toVariantOptionGroups(node.variants.nodes),
    customFields: {
      ...toShopifyBuiltInFields({
        tags: node.tags,
        variants: node.variants.nodes,
        handle: node.handle,
        status: node.status,
        createdAt: node.createdAt,
        publishedAt: node.publishedAt,
        onlineStoreUrl: node.onlineStoreUrl,
        templateSuffix: node.templateSuffix,
        seo: node.seo,
      }),
      ...toShopifyCustomFields(node.metafields?.nodes),
    },
    updatedAt: node.updatedAt,
    variants: node.variants.nodes.map((variant) =>
      toShopifyCatalogVariant(variant, domain, node.handle, featured, node.priceRangeV2.minVariantPrice.currencyCode)
    ),
  };
}

/**
 * Metafields as flat text columns Stage 1 can offer, keyed `metafield.<namespace>.<key>`.
 *
 * Values arrive as strings whatever their metafield type, including the JSON ones — which is what
 * makes a merchant's per-product size chart mappable at all: it is stored as a JSON or HTML blob, and
 * the column carries it through verbatim rather than trying to interpret it here.
 */
function toShopifyCustomFields(
  nodes: Array<{ namespace: string; key: string; value: string | null }> | undefined
): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!nodes) return fields;

  for (const node of nodes) {
    if (!node.namespace || !node.key || !node.value?.trim()) continue;
    fields[`metafield.${node.namespace}.${node.key}`] = node.value;
  }

  return fields;
}

/**
 * Shopify's own built-in fields that aren't in the fixed `SOURCE_FIELDS` list — no ACS target
 * defaults to any of these, so they reach Stage 1 as `field.*` columns exactly like a metafield:
 * bindable into any row's dropdown or declared as a Table 2 custom attribute.
 *
 * `compareAtPrice` is read off the first variant, matching how `sku` already picks a single variant
 * to represent a multi-variant product rather than trying to average or list every one — a variant's
 * own compare-at price is also separately bindable at variant scope, see `cms-columns.ts`.
 *
 * Every field beyond `tags`/`compareAtPrice` is optional because the webhook payload
 * (`mapShopifyWebhookProduct`) does not carry all of them — a REST product webhook has no `seo` or
 * `onlineStoreUrl`, so those simply don't reach Stage 1 until the next full catalog walk refreshes
 * the product, the same gap `boundMetafieldKeys` already documents for metafields.
 */
function toShopifyBuiltInFields(input: {
  tags?: string[];
  variants: Array<{ compareAtPrice: string | null }>;
  handle?: string | null;
  status?: string | null;
  createdAt?: string | null;
  publishedAt?: string | null;
  onlineStoreUrl?: string | null;
  templateSuffix?: string | null;
  seo?: { title: string | null; description: string | null };
}): Record<string, string> {
  const fields: Record<string, string> = {};

  if (input.tags && input.tags.length > 0) fields["field.tags"] = input.tags.join(", ");

  const compareAtPrice = input.variants[0]?.compareAtPrice;
  if (compareAtPrice?.trim()) fields["field.compare_at_price"] = compareAtPrice.trim();

  if (input.handle?.trim()) fields["field.handle"] = input.handle.trim();
  if (input.status?.trim()) fields["field.status"] = input.status.trim();
  if (input.createdAt?.trim()) fields["field.created_at"] = input.createdAt.trim();
  if (input.publishedAt?.trim()) fields["field.published_at"] = input.publishedAt.trim();
  if (input.onlineStoreUrl?.trim()) fields["field.online_store_url"] = input.onlineStoreUrl.trim();
  if (input.templateSuffix?.trim()) fields["field.template_suffix"] = input.templateSuffix.trim();
  if (input.seo?.title?.trim()) fields["field.seo_title"] = input.seo.title.trim();
  if (input.seo?.description?.trim()) fields["field.seo_description"] = input.seo.description.trim();

  return fields;
}

/**
 * Reads named products, for a caller that already knows exactly which ones it wants.
 *
 * `nodes(ids:)` is the one way into the catalog that skips collection membership entirely, so this
 * costs a single request rather than a walk past every non-match. Ids are the full GIDs the catalog
 * already stores, so nothing needs converting.
 *
 * A node that no longer resolves comes back as `null` and is dropped, which is what should happen: a
 * product deleted since the scan should fall off the list rather than break the page.
 */
export async function listShopifyProductsByIds(
  domain: string,
  accessToken: string,
  externalIds: readonly string[],
  options: Pick<CatalogPageOptions, "metafieldKeys" | "discoverCustomFields"> = {},
  signal?: AbortSignal
): Promise<RawCatalogProduct[]> {
  if (externalIds.length === 0) return [];

  const { data } = await shopifyGraphqlFetch<{ nodes: Array<ShopifyCatalogProductNode | null> }>(
    domain,
    accessToken,
    catalogByIdsQuery(catalogProductFields(options)),
    { ids: [...externalIds] },
    signal
  );

  return (data.nodes ?? [])
    .filter((node): node is ShopifyCatalogProductNode => node !== null)
    .map((node) => mapShopifyCatalogNode(node, domain));
}

/**
 * Pulls one page of the full catalog for indexing.
 *
 * Paged by the caller rather than looping internally, so a 200,000-SKU store is walked as a
 * stream of bounded batches instead of being assembled in memory. Sorted by ID because
 * relevance ordering is meaningless here and a stable sort key keeps cursors valid across a
 * long walk.
 */
export async function listShopifyCatalogPage(
  domain: string,
  accessToken: string,
  options: CatalogPageOptions & { cursor?: string },
  signal?: AbortSignal
): Promise<{ products: RawCatalogProduct[]; nextCursor: string | null; throttleStatus?: ShopifyThrottleStatus }> {
  // One collection per request: membership is only reachable by descending from a collection, and
  // there is no union form. The caller walks them one at a time.
  if (options.categoryIds?.length) {
    return listShopifyCollectionPage(domain, accessToken, options.categoryIds[0], options, signal);
  }

  const filters = ["status:active"];
  if (options.updatedAfter) {
    // Shopify's search syntax takes an ISO timestamp here, which is what makes an incremental
    // reconcile cheap: only the changed slice comes back.
    filters.push(`updated_at:>'${options.updatedAfter}'`);
  }

  const { data, throttleStatus } = await shopifyGraphqlFetch<{ products: { nodes: ShopifyCatalogProductNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }>(
    domain,
    accessToken,
    catalogListQuery(catalogProductFields(options)),
    {
      query: filters.join(" AND "),
      first: Math.min(options.pageSize ?? SHOPIFY_PAGE_SIZE, SHOPIFY_PAGE_SIZE),
      after: options.cursor,
    },
    signal
  );

  return {
    products: data.products.nodes.map((node) => mapShopifyCatalogNode(node, domain)),
    nextCursor: data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null,
    throttleStatus,
  };
}

/**
 * One page of a collection's products.
 *
 * The nested connection takes no search predicate, so `status` and `updatedAt` are filtered here
 * instead of by the API. That makes the page size a request for raw rows rather than for matches
 * — a page can come back partly filtered out while more still exist, which is why paging keys off
 * `hasNextPage` and never off how many products this returns.
 */
async function listShopifyCollectionPage(
  domain: string,
  accessToken: string,
  collectionId: string,
  options: CatalogPageOptions & { cursor?: string },
  signal?: AbortSignal
): Promise<{ products: RawCatalogProduct[]; nextCursor: string | null; throttleStatus?: ShopifyThrottleStatus }> {
  const { data, throttleStatus } = await shopifyGraphqlFetch<{
    collection: { products: { nodes: ShopifyCatalogProductNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null;
  }>(
    domain,
    accessToken,
    collectionProductsQuery(catalogProductFields(options)),
    {
      id: toCollectionGid(collectionId),
      first: Math.min(options.pageSize ?? SHOPIFY_PAGE_SIZE, SHOPIFY_PAGE_SIZE),
      after: options.cursor,
    },
    signal
  );

  // A collection deleted in the store admin since the merchant selected it.
  if (!data.collection) {
    return { products: [], nextCursor: null, throttleStatus };
  }

  const since = options.updatedAfter ? Date.parse(options.updatedAfter) : null;
  const nodes = data.collection.products.nodes.filter((node) => {
    if (node.status !== "ACTIVE") return false;
    if (since === null) return true;
    return Date.parse(node.updatedAt) > since;
  });

  return {
    products: nodes.map((node) => mapShopifyCatalogNode(node, domain)),
    nextCursor: data.collection.products.pageInfo.hasNextPage
      ? data.collection.products.pageInfo.endCursor
      : null,
    throttleStatus,
  };
}

/** `getShopifyCollections` reads the REST endpoints, which return bare numeric ids, while the
 *  GraphQL collection query takes a global id. Already-qualified ids pass through so a caller
 *  can hand over either form. */
function toCollectionGid(id: string): string {
  return id.startsWith("gid://") ? id : `gid://shopify/Collection/${id}`;
}

const HYDRATE_QUERY = `
  query HydrateProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        totalInventory
        priceRangeV2 { minVariantPrice { amount currencyCode } }
      }
    }
  }
`;

export interface LiveProductFacts {
  externalId: string;
  price: number | null;
  currency: string | null;
  inStock: boolean;
}

/** Re-reads price and stock for the handful of products actually about to be shown. A stored
 *  price can be minutes stale, and a shopper being quoted the wrong number is worse than the
 *  round trip. */
export async function hydrateShopifyProducts(
  domain: string,
  accessToken: string,
  externalIds: string[],
  signal?: AbortSignal
): Promise<LiveProductFacts[]> {
  if (externalIds.length === 0) return [];

  const { data } = await shopifyGraphqlFetch<{
    nodes: Array<{
      id: string;
      totalInventory: number;
      priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } };
    } | null>;
  }>(domain, accessToken, HYDRATE_QUERY, { ids: externalIds }, signal);

  return (data.nodes ?? [])
    .filter((node): node is NonNullable<(typeof data.nodes)[number]> => node !== null)
    .map((node) => ({
      externalId: node.id,
      price: Number(node.priceRangeV2.minVariantPrice.amount) || null,
      currency: node.priceRangeV2.minVariantPrice.currencyCode,
      inStock: node.totalInventory > 0,
    }));
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

interface ShopifyRestProductPayload {
  id: number;
  handle?: string;
  title: string;
  body_html?: string | null;
  vendor?: string | null;
  product_type?: string | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
  template_suffix?: string | null;
  /** Comma-separated in the REST shape, unlike the GraphQL walk's string array — see
   *  `toShopifyBuiltInFields`. */
  tags?: string;
  image?: { src: string } | null;
  images?: Array<{ src: string }>;
  variants?: Array<{
    id: number;
    title?: string;
    sku?: string | null;
    barcode?: string | null;
    price?: string;
    compare_at_price?: string | null;
    inventory_quantity?: number;
    option1?: string | null;
    option2?: string | null;
    option3?: string | null;
    image_id?: number | null;
    weight?: number | null;
    weight_unit?: string | null;
  }>;
  options?: Array<{ name: string; position: number; values: string[] }>;
}

/**
 * Maps a webhook payload, which arrives in the REST shape rather than the GraphQL one the
 * catalog walk uses. Same destination, different source format — worth stating, because the
 * two shapes differ enough (`body_html` vs `descriptionHtml`, numeric vs GID ids) that reusing
 * either mapper for the other feed would silently produce half-empty rows.
 */
export function mapShopifyWebhookProduct(payload: unknown, domain: string): RawCatalogProduct | null {
  const product = payload as ShopifyRestProductPayload;
  if (!product?.id || !product.title) return null;

  const images = (product.images ?? []).map((image) => image.src).filter(Boolean);
  const featured = product.image?.src ?? images[0] ?? null;

  const variantOptions: VariantOptionGroups = {};
  for (const option of product.options ?? []) {
    const key = `option${option.position}` as "option1" | "option2" | "option3";
    const seen = new Set<string>();
    const values: Array<{ id: string; label: string }> = [];

    for (const variant of product.variants ?? []) {
      const value = variant[key];
      if (!value || seen.has(value)) continue;
      seen.add(value);
      values.push({ id: `gid://shopify/ProductVariant/${variant.id}`, label: value });
    }

    if (values.length > 0) variantOptions[option.name] = values;
  }

  const optionNamesByPosition = new Map((product.options ?? []).map((option) => [option.position, option.name]));
  const variants: RawCatalogVariant[] = (product.variants ?? []).map((variant) => {
    const selectedOptions: Record<string, string> = {};
    for (const [position, name] of optionNamesByPosition) {
      const key = `option${position}` as "option1" | "option2" | "option3";
      const value = variant[key];
      if (value) selectedOptions[name] = value;
    }

    return {
      externalId: `gid://shopify/ProductVariant/${variant.id}`,
      sku: variant.sku ?? null,
      barcode: variant.barcode?.trim() || null,
      title: variant.title && variant.title !== "Default Title" ? variant.title : null,
      price: variant.price ? Number(variant.price) || null : null,
      compareAtPrice: variant.compare_at_price ? Number(variant.compare_at_price) || null : null,
      currency: null,
      inStock: (variant.inventory_quantity ?? 0) > 0,
      inventoryQuantity: variant.inventory_quantity ?? null,
      // The webhook body carries only an `image_id` reference, not the image's own URL — resolving
      // it would mean a second request per variant image, so this falls back to the product's
      // featured image until the next full catalog refetch fills in the real one.
      imageUrl: featured,
      selectedOptions,
      weight: variant.weight ?? null,
      weightUnit: variant.weight_unit ?? null,
      productUrl: product.handle
        ? `https://${domain}/products/${product.handle}?variant=${variant.id}`
        : null,
      customFields: {},
    };
  });

  return {
    // The walk stores GraphQL GIDs, so the webhook has to produce the same id or every update
    // would insert a duplicate row alongside the one it meant to replace.
    externalId: `gid://shopify/Product/${product.id}`,
    productGroupId: product.handle || String(product.id),
    sku: product.variants?.[0]?.sku ?? null,
    title: product.title,
    description: product.body_html ? stripHtml(product.body_html) : null,
    brand: product.vendor?.trim() || null,
    rawCategories: product.product_type?.trim() ? [product.product_type.trim()] : [],
    // Shopify's product webhook payload carries no collection membership, so scope can't be
    // decided from the payload. The caller falls back to what the row already recorded, and a
    // brand-new product waits for the next collection walk rather than being indexed blind.
    sourceCategoryIds: [],
    price: product.variants?.[0]?.price ? Number(product.variants[0].price) : null,
    currency: null,
    inStock: (product.variants ?? []).some((v) => (v.inventory_quantity ?? 0) > 0),
    productUrl: product.handle ? `https://${domain}/products/${product.handle}` : null,
    imageUrl: featured,
    images,
    variantOptions,
    // Shopify's REST product webhook payload carries no metafields, so a bound metafield column
    // cannot be read from the delivery itself. `indexProductIfInScope` refetches the product through
    // the GraphQL path to fill those in when the merchant has any bound — see `mergeCustomFields`.
    // Tags and compare-at-price *are* in this payload, though, so those are populated right away.
    customFields: toShopifyBuiltInFields({
      tags: product.tags ? product.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined,
      variants: [{ compareAtPrice: product.variants?.[0]?.compare_at_price ?? null }],
      handle: product.handle ?? null,
      status: product.status ?? null,
      createdAt: product.created_at ?? null,
      publishedAt: product.published_at ?? null,
      templateSuffix: product.template_suffix ?? null,
      // `seo`/`onlineStoreUrl` have no REST webhook equivalent — left absent rather than guessed,
      // same gap this function's own doc comment already documents for the GraphQL-only fields.
    }),
    updatedAt: product.updated_at ?? null,
    variants,
  };
}

const PRODUCT_WEBHOOK_TOPICS = ["products/create", "products/update", "products/delete"];
const ORDER_WEBHOOK_TOPICS = ["orders/create", "orders/updated", "refunds/create"];

export interface WebhookRegistration {
  registered: string[];
  failed: string[];
  ordersAccess: "active" | "missing";
}

interface ShopifyWebhookRecord {
  id: number;
  topic: string;
  address: string;
}

/**
 * Subscribes the app to product changes, skipping topics already registered so reconnecting a
 * store doesn't accumulate duplicate subscriptions (and duplicate deliveries) each time.
 *
 * Webhooks created this way are signed with the app's own client secret, which is why nothing
 * extra needs storing to verify them later.
 */
export async function registerShopifyWebhooks(
  domain: string,
  accessToken: string,
  callbackUrl: string
): Promise<WebhookRegistration> {
  const existing = await shopifyFetch<{ webhooks: ShopifyWebhookRecord[] }>(
    domain,
    accessToken,
    "/webhooks.json?limit=250"
  ).catch(() => ({ webhooks: [] as ShopifyWebhookRecord[] }));

  const already = new Set(
    (existing.webhooks ?? []).filter((hook) => hook.address === callbackUrl).map((hook) => hook.topic)
  );

  const registered: string[] = [];
  const failed: string[] = [];

  for (const topic of [...PRODUCT_WEBHOOK_TOPICS, ...ORDER_WEBHOOK_TOPICS]) {
    if (already.has(topic)) continue;

    const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/webhooks.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ webhook: { topic, address: callbackUrl, format: "json" } }),
      cache: "no-store",
    });

    if (res.ok) {
      registered.push(topic);
    } else {
      failed.push(topic);
      // Non-fatal. Without webhooks the catalog is refreshed by the reconcile schedule
      // instead of instantly, which is a degradation rather than a broken connection.
      console.error(`[shopify registerShopifyWebhooks] ${topic} failed (${res.status})`);
    }
  }

  const ordersAccess = ORDER_WEBHOOK_TOPICS.every((topic) => already.has(topic) || registered.includes(topic))
    ? "active"
    : "missing";
  return { registered, failed, ordersAccess };
}

const ADD_TO_CART_LOOKUP_TIMEOUT_MS = 12_000;

interface ShopifyRestVariant {
  id: number;
  available?: boolean;
  inventory_quantity?: number;
}

interface ShopifyRestProduct {
  id: number;
  variants: ShopifyRestVariant[];
}

/**
 * Shopify's Ajax `/cart/add.js` only accepts a *variant* id (never the parent product id).
 * Our catalog stores GraphQL product GIDs (`gid://shopify/Product/123`), so this resolves
 * a purchasable variant's numeric id server-side with the merchant's Admin credentials.
 * Picks the first available variant; falls back to any variant rather than failing empty.
 */
export async function resolveShopifyCartVariantId(
  domain: string,
  accessToken: string,
  productId: string
): Promise<number> {
  const bareId = bareShopifyId(productId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADD_TO_CART_LOOKUP_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://${domain}/admin/api/${API_VERSION}/products/${encodeURIComponent(bareId)}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      throw new ShopifyApiError(
        res.status === 404
          ? "That product isn't in this Shopify catalog anymore."
          : `Shopify API request failed (${res.status})`,
        res.status
      );
    }

    const data = (await res.json()) as { product?: ShopifyRestProduct };
    const variants = data.product?.variants ?? [];
    const best =
      variants.find((v) => v.available !== false && (v.inventory_quantity == null || v.inventory_quantity > 0)) ??
      variants[0];

    if (!best?.id) {
      throw new ShopifyApiError("This product has no purchasable options right now.", 400);
    }

    return best.id;
  } catch (err) {
    if (err instanceof ShopifyApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ShopifyApiError("The store took too long to respond — please try again.", 504);
    }
    throw new ShopifyApiError(err instanceof Error ? err.message : "Failed to reach the store.", 502);
  } finally {
    clearTimeout(timer);
  }
}
