import type { StoreCategory } from "@/modules/store/types";
import type { Product, ProductVariant } from "@/modules/shopping-agent/types";
import { isCacheDisabled } from "@/lib/utils/disable-cache";

const API_VERSION = "2024-10";

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
  cacheKey?: string
): Promise<string> {
  const key = cacheKey ?? `${domain}:${clientId}`;
  const cached = isCacheDisabled() ? undefined : tokenCache.get(key);
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

interface ShopifyCollection {
  id: number;
  title: string;
}

/** Fetches custom + smart collections and their product counts (used as the app's "categories"). */
export async function getShopifyCollections(domain: string, accessToken: string): Promise<StoreCategory[]> {
  const [customRes, smartRes] = await Promise.all([
    shopifyFetch<{ custom_collections: ShopifyCollection[] }>(domain, accessToken, "/custom_collections.json?limit=250"),
    shopifyFetch<{ smart_collections: ShopifyCollection[] }>(domain, accessToken, "/smart_collections.json?limit=250"),
  ]);

  const collections = [...(customRes.custom_collections ?? []), ...(smartRes.smart_collections ?? [])];
  const seen = new Set<number>();
  const uniqueCollections = collections.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  return mapWithConcurrency(uniqueCollections, 4, async (collection): Promise<StoreCategory> => {
    try {
      const countData = await shopifyFetch<{ count: number }>(
        domain,
        accessToken,
        `/products/count.json?collection_id=${collection.id}`
      );
      return { id: String(collection.id), name: collection.title, productCount: countData.count ?? 0 };
    } catch (err) {
      console.error(`[shopify getShopifyCollections] product count failed for collection ${collection.id}`, err);
      return { id: String(collection.id), name: collection.title, productCount: 0 };
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
