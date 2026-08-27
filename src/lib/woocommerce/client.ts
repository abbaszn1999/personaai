import type { StoreCategory } from "@/modules/store/types";
import type { Product, ProductVariant } from "@/modules/shopping-agent/types";
import type { CatalogPageOptions, RawCatalogProduct, VariantOptionGroups } from "@/lib/catalog/sync-types";
import { createTimeoutSignal } from "@/lib/catalog/timeout";

const API_BASE = "/wp-json/wc/v3";

export class WooCommerceApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    /** True when this failure was a 429 from the merchant's own host/hosting-level rate
     *  limiting (WooCommerce itself has no built-in API rate limit to mirror). */
    public throttled: boolean = false,
    public retryAfterMs?: number
  ) {
    super(message);
    this.name = "WooCommerceApiError";
  }
}

/**
 * Normalizes user input (`example.com`, `www.example.com`, `http://example.com/`)
 * into a bare `https://example.com` origin suitable for WordPress REST API calls.
 * Unlike Shopify, WordPress sites use arbitrary domains — there's no platform-owned
 * suffix to append.
 */
export function normalizeWordPressUrl(input: string): string {
  let url = input.trim();
  url = url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${url}`;
}

/** Builds the `Authorization: Basic ...` header for a WordPress Application Password. */
function buildAuthHeader(username: string, appPassword: string): string {
  const token = Buffer.from(`${username}:${appPassword}`).toString("base64");
  return `Basic ${token}`;
}

interface WooCommerceErrorBody {
  message?: string;
  code?: string;
}

async function wooFetch<T>(
  siteUrl: string,
  username: string,
  appPassword: string,
  path: string,
  signal?: AbortSignal
): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(`${siteUrl}${API_BASE}${path}`, {
    headers: {
      Authorization: buildAuthHeader(username, appPassword),
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal,
  });

  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get("retry-after") ?? "2");
    throw new WooCommerceApiError("The store's server rate-limited this request — retrying shortly.", 429, true, retryAfterSec * 1000);
  }

  if (!res.ok) {
    const body: WooCommerceErrorBody | null = await res.json().catch(() => null);
    throw new WooCommerceApiError(
      body?.message || `WordPress API request failed (${res.status})`,
      res.status
    );
  }

  const data = (await res.json()) as T;
  return { data, headers: res.headers };
}

/**
 * Confirms the site URL + WordPress Application Password are valid by fetching a
 * single product. Also returns a best-effort store name from the site's WordPress
 * REST API root, falling back to the hostname if unavailable. Throws on failure.
 */
export async function verifyWordPressCredentials(
  siteUrl: string,
  username: string,
  appPassword: string
): Promise<{ name: string }> {
  await wooFetch<unknown[]>(siteUrl, username, appPassword, "/products?per_page=1");

  try {
    const res = await fetch(`${siteUrl}/wp-json`, { cache: "no-store" });
    if (res.ok) {
      const data: { name?: string } = await res.json();
      if (data.name) return { name: data.name };
    }
  } catch {
    // Non-fatal — fall through to the hostname fallback below.
  }

  return { name: new URL(siteUrl).hostname };
}

/**
 * Reads the total product count from the `X-WP-Total` response header — WooCommerce
 * has no dedicated count endpoint like Shopify, but every list endpoint reports the
 * total in this header regardless of `per_page`.
 */
export async function getWordPressProductCount(
  siteUrl: string,
  username: string,
  appPassword: string
): Promise<number> {
  const { headers } = await wooFetch<unknown[]>(siteUrl, username, appPassword, "/products?per_page=1");
  return Number(headers.get("x-wp-total") ?? 0);
}

interface WooCommerceCategory {
  id: number;
  name: string;
  count: number;
  /** 0 for a top-level term. */
  parent: number;
}

/**
 * Fetches product categories and their product counts, paginating through WooCommerce's
 * 100-per-page limit so large catalogs aren't silently truncated.
 *
 * `count` is already subtree-inclusive here — a parent reports its descendants' products too — so
 * it is passed through untouched. Adding descendants on top would double every parent whose
 * products all live in its children, which is the common shape, and the selection UI spends that
 * number as a cost estimate.
 */
export async function getWordPressCategories(
  siteUrl: string,
  username: string,
  appPassword: string
): Promise<StoreCategory[]> {
  const all: StoreCategory[] = [];
  let page = 1;

  while (true) {
    const { data } = await wooFetch<WooCommerceCategory[]>(
      siteUrl,
      username,
      appPassword,
      `/products/categories?per_page=100&page=${page}`
    );
    if (data.length === 0) break;

    for (const category of data) {
      all.push({
        id: String(category.id),
        name: decodeHtmlEntities(category.name),
        productCount: category.count ?? 0,
        parentId: category.parent ? String(category.parent) : null,
      });
    }

    if (data.length < 100) break;
    page += 1;
    // Safety valve — Woo stores with absurd category trees shouldn't hang forever.
    if (page > 20) break;
  }

  return all;
}

/** WordPress returns taxonomy names HTML-escaped, so "Shoes & Bags" arrives as "Shoes &amp;
 *  Bags". React escapes on render rather than decoding, so the entity would otherwise be shown
 *  literally in the category the merchant is picking. */
function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// ─── Live catalog search (REST API filters) ───────────────────────────────────

interface WooCommerceProductImage {
  src: string;
}

interface WooCommerceProductCategoryRef {
  id: number;
  name: string;
}

interface WooCommerceProductAttribute {
  name: string;
  options: string[];
}

interface WooCommerceProduct {
  id: number;
  name: string;
  description: string;
  short_description: string;
  price: string;
  images: WooCommerceProductImage[];
  categories: WooCommerceProductCategoryRef[];
  tags: Array<{ name: string }>;
  attributes: WooCommerceProductAttribute[];
  stock_status: "instock" | "outofstock" | "onbackorder";
}

/**
 * WooCommerce has no per-product currency field (it's a single site-wide setting) — the
 * app doesn't yet fetch that setting, so real WooCommerce results default to USD like every
 * other price shown in this app today. Revisit if a merchant using a non-USD store connects.
 */
const WOOCOMMERCE_DEFAULT_CURRENCY = "USD";

/** WooCommerce reports stock at the product level only via this basic search — a size-level
 *  attribute option is shown as available whenever the product overall is in stock, since a
 *  per-variation stock lookup would require a second request per product. */
function mapWooProductToProductVariants(attributes: WooCommerceProductAttribute[], inStock: boolean): ProductVariant[] {
  return attributes.flatMap((attr) => {
    const type: ProductVariant["type"] = attr.name.toLowerCase().includes("size")
      ? "size"
      : attr.name.toLowerCase().includes("color") || attr.name.toLowerCase().includes("colour")
        ? "color"
        : "style";
    return attr.options.map((option) => ({
      id: `${attr.name}-${option}`,
      label: option,
      value: option.toLowerCase(),
      type,
      inStock,
    }));
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function mapWooProduct(product: WooCommerceProduct): Product | null {
  // A product with no photo has nothing useful to show in this visual UI — skip it rather
  // than rendering a broken image.
  const imageUrl = product.images[0]?.src;
  if (!imageUrl) return null;

  const inStock = product.stock_status === "instock";

  return {
    id: String(product.id),
    name: product.name,
    description: stripHtml(product.short_description || product.description),
    price: Number(product.price) || 0,
    currency: WOOCOMMERCE_DEFAULT_CURRENCY,
    imageUrl,
    categoryId: product.categories[0] ? String(product.categories[0].id) : "",
    tags: product.tags.map((t) => t.name),
    variants: mapWooProductToProductVariants(product.attributes, inStock),
    rating: 0,
    reviewCount: 0,
    inStock,
  };
}

// ─── Full-catalog listing (indexing, not search) ──────────────────────────────

interface WooCatalogProduct extends WooCommerceProduct {
  sku: string;
  permalink: string;
  date_modified_gmt: string;
  type: string;
  brands?: Array<{ name: string }>;
}

function toWooVariantOptionGroups(attributes: WooCommerceProductAttribute[]): VariantOptionGroups {
  const groups: VariantOptionGroups = {};

  for (const attribute of attributes) {
    if (attribute.options.length === 0) continue;
    // WooCommerce's product list endpoint reports attribute options, not variation ids —
    // resolving a real variation id needs a per-product request, which is what
    // `resolveAddToCartItemId` already does lazily at add-to-cart time. Storing the option
    // label as the id here keeps the shape honest rather than implying an id we don't have.
    groups[attribute.name] = attribute.options.map((option) => ({ id: option, label: option }));
  }

  return groups;
}

function mapWooCatalogProduct(product: WooCatalogProduct): RawCatalogProduct {
  const images = product.images.map((image) => image.src).filter(Boolean);

  return {
    externalId: String(product.id),
    productGroupId: String(product.id),
    sku: product.sku?.trim() || null,
    title: product.name,
    description: stripHtml(product.description || product.short_description),
    brand: product.brands?.[0]?.name?.trim() || null,
    rawCategories: product.categories.map((category) => category.name),
    sourceCategoryIds: product.categories.map((category) => String(category.id)),
    price: Number(product.price) || null,
    currency: WOOCOMMERCE_DEFAULT_CURRENCY,
    inStock: product.stock_status === "instock",
    productUrl: product.permalink || null,
    imageUrl: images[0] ?? null,
    images,
    variantOptions: toWooVariantOptionGroups(product.attributes),
    // WooCommerce reports this in GMT without a zone marker, so it needs one to parse as UTC.
    updatedAt: product.date_modified_gmt ? `${product.date_modified_gmt}Z` : null,
  };
}

/**
 * Pulls one page of the full catalog for indexing. Paged by the caller so a large store is
 * walked as bounded batches rather than assembled in memory.
 */
export async function listWooCatalogPage(
  siteUrl: string,
  username: string,
  appPassword: string,
  options: CatalogPageOptions & { page: number },
  signal?: AbortSignal
): Promise<{ products: RawCatalogProduct[]; hasMore: boolean }> {
  const perPage = Math.min(options.pageSize ?? WOO_PAGE_SIZE, WOO_PAGE_SIZE);
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(options.page),
    status: "publish",
    orderby: "id",
    order: "asc",
  });

  // Woo's own incremental filter — the reconcile cursor, so a scheduled pass costs one page
  // rather than a full walk when nothing much has changed.
  if (options.updatedAfter) params.set("modified_after", options.updatedAfter);

  // A union across the listed terms, each product returned once however many it belongs to, and
  // descendants are included — asking for a parent returns its children's products too.
  if (options.categoryIds?.length) params.set("category", options.categoryIds.join(","));

  const { data } = await wooFetch<WooCatalogProduct[]>(
    siteUrl,
    username,
    appPassword,
    `/products?${params.toString()}`,
    signal
  );

  return {
    products: data.map(mapWooCatalogProduct),
    hasMore: data.length === perPage,
  };
}

export interface LiveWooProductFacts {
  externalId: string;
  price: number | null;
  currency: string | null;
  inStock: boolean;
}

/** Re-reads price and stock for the products about to be shown, in one request rather than
 *  one per product. */
export async function hydrateWooProducts(
  siteUrl: string,
  username: string,
  appPassword: string,
  externalIds: string[],
  signal?: AbortSignal
): Promise<LiveWooProductFacts[]> {
  if (externalIds.length === 0) return [];

  const params = new URLSearchParams({
    include: externalIds.join(","),
    per_page: String(Math.min(externalIds.length, WOO_PAGE_SIZE)),
  });

  const { data } = await wooFetch<Array<{ id: number; price: string; stock_status: string }>>(
    siteUrl,
    username,
    appPassword,
    `/products?${params.toString()}`,
    signal
  );

  return data.map((product) => ({
    externalId: String(product.id),
    price: Number(product.price) || null,
    currency: WOOCOMMERCE_DEFAULT_CURRENCY,
    inStock: product.stock_status === "instock",
  }));
}

/** WooCommerce webhooks deliver the same product object the REST list endpoint returns, so
 *  the two feeds share one mapper — unlike Shopify, where they differ. */
export function mapWooWebhookProduct(payload: unknown): RawCatalogProduct | null {
  const product = payload as WooCatalogProduct;
  if (!product?.id || !product.name) return null;
  return mapWooCatalogProduct({
    ...product,
    images: product.images ?? [],
    categories: product.categories ?? [],
    tags: product.tags ?? [],
    attributes: product.attributes ?? [],
  });
}

const WOO_WEBHOOK_TOPICS = ["product.created", "product.updated", "product.deleted"];

interface WooWebhookRecord {
  id: number;
  topic: string;
  delivery_url: string;
  status: string;
}

/**
 * Subscribes to product changes, skipping topics already pointed at this callback so a
 * reconnect doesn't stack duplicate subscriptions.
 *
 * Unlike Shopify, WooCommerce signs with a per-webhook secret of our choosing rather than an
 * existing credential, so the caller passes one it can re-derive at verification time.
 */
export async function registerWooWebhooks(
  siteUrl: string,
  username: string,
  appPassword: string,
  callbackUrl: string,
  secret: string
): Promise<{ registered: string[] }> {
  const existing = await wooFetch<WooWebhookRecord[]>(
    siteUrl,
    username,
    appPassword,
    "/webhooks?per_page=100"
  ).catch(() => ({ data: [] as WooWebhookRecord[], headers: new Headers() }));

  const already = new Set(
    (existing.data ?? []).filter((hook) => hook.delivery_url === callbackUrl).map((hook) => hook.topic)
  );

  const registered: string[] = [];

  for (const topic of WOO_WEBHOOK_TOPICS) {
    if (already.has(topic)) continue;

    const res = await fetch(`${siteUrl}${API_BASE}/webhooks`, {
      method: "POST",
      headers: {
        Authorization: buildAuthHeader(username, appPassword),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `Catalog sync — ${topic}`,
        topic,
        delivery_url: callbackUrl,
        secret,
        status: "active",
      }),
      cache: "no-store",
    });

    if (res.ok) {
      registered.push(topic);
    } else {
      // Non-fatal — the reconcile schedule still catches the change, just not instantly.
      console.error(`[woocommerce registerWooWebhooks] ${topic} failed (${res.status})`);
    }
  }

  return { registered };
}

// ─── Real add-to-cart item resolution ─────────────────────────────────────────

interface WooCommerceProductTypeLookup {
  id: number;
  type: "simple" | "variable" | "grouped" | "external" | string;
  purchasable: boolean;
  stock_status: "instock" | "outofstock" | "onbackorder";
}

interface WooCommerceVariationLookup {
  id: number;
  purchasable: boolean;
  stock_status: "instock" | "outofstock" | "onbackorder";
}

/** A shopper is actively waiting on this (it gates their "Added to cart" click), so it must
 *  fail fast and clearly rather than hang — a slow/overloaded store should surface as a
 *  retryable error within seconds, not silently tie up the request for minutes past the
 *  point the shopper's own browser (and any tunnel/proxy in front of this app) has given up. */
const ADD_TO_CART_LOOKUP_TIMEOUT_MS = 12_000;

/**
 * WooCommerce's Store API cart only accepts an id that's directly purchasable — a "simple"
 * product's own id, or (for a "variable" product with size/color options) one of its specific
 * variation ids, never the parent product id. Our internal catalog only tracks the parent id,
 * so this resolves the right one to actually send to the cart, server-side, using the
 * merchant's own admin credentials (never exposed to the shopper's browser).
 */
export async function resolveAddToCartItemId(
  siteUrl: string,
  username: string,
  appPassword: string,
  productId: string
): Promise<number> {
  const productLookup = createTimeoutSignal(ADD_TO_CART_LOOKUP_TIMEOUT_MS);
  let product: WooCommerceProductTypeLookup;
  try {
    product = (
      await wooFetch<WooCommerceProductTypeLookup>(
        siteUrl,
        username,
        appPassword,
        `/products/${encodeURIComponent(productId)}`,
        productLookup.signal
      )
    ).data;
  } catch (err) {
    throw toStoreLookupError(err);
  } finally {
    productLookup.cancel();
  }

  if (product.type !== "variable") {
    return product.id;
  }

  const variationsLookup = createTimeoutSignal(ADD_TO_CART_LOOKUP_TIMEOUT_MS);
  let variations: WooCommerceVariationLookup[];
  try {
    variations = (
      await wooFetch<WooCommerceVariationLookup[]>(
        siteUrl,
        username,
        appPassword,
        `/products/${encodeURIComponent(productId)}/variations?per_page=100`,
        variationsLookup.signal
      )
    ).data;
  } catch (err) {
    throw toStoreLookupError(err);
  } finally {
    variationsLookup.cancel();
  }

  // Prefer an in-stock, purchasable variation; fall back to any purchasable one rather than
  // failing outright — better to let the store reject/backorder it than block the add entirely.
  const best =
    variations.find((v) => v.purchasable && v.stock_status === "instock") ??
    variations.find((v) => v.purchasable);

  if (!best) {
    throw new WooCommerceApiError("This product has no purchasable options right now.", 400);
  }

  return best.id;
}

function toStoreLookupError(err: unknown): WooCommerceApiError {
  if (err instanceof WooCommerceApiError) return err;
  if (err instanceof Error && err.name === "AbortError") {
    return new WooCommerceApiError("The store took too long to respond — please try again.", 504);
  }
  return new WooCommerceApiError(err instanceof Error ? err.message : "Failed to reach the store.", 502);
}

export interface SearchWordPressProductsInput {
  query?: string;
  maxPrice?: number;
  /** WooCommerce category id (as stored in `StoreCategory.id`) to scope the search to. */
  categoryId?: string;
  limit?: number;
}

/** WordPress's hard `per_page` ceiling for this REST endpoint — a single request can't go
 *  higher, so a larger pool is fetched by paging with `page` instead. */
const WOO_PAGE_SIZE = 100;
/** Safety valve on how many 100-item pages one search call will page through, so an
 *  aggressively large CATALOG_SEARCH_POOL_SIZE on a huge catalog can't turn one shopper
 *  message into dozens of sequential REST round trips. 5 pages = up to 500 candidates. */
const WOO_MAX_PAGES = 5;

/** Live filtered product search via WooCommerce's REST `search`/`category`/`max_price` filters. */
export async function searchWordPressProducts(
  siteUrl: string,
  username: string,
  appPassword: string,
  input: SearchWordPressProductsInput,
  signal?: AbortSignal
): Promise<Product[]> {
  const limit = Math.max(input.limit ?? 6, 1);
  const all: WooCommerceProduct[] = [];

  for (let page = 1; page <= WOO_MAX_PAGES && all.length < limit; page++) {
    const perPage = Math.min(WOO_PAGE_SIZE, limit - all.length);
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      status: "publish",
    });
    if (input.query?.trim()) params.set("search", input.query.trim());
    if (input.categoryId) params.set("category", input.categoryId);
    if (input.maxPrice) params.set("max_price", String(input.maxPrice));

    const { data } = await wooFetch<WooCommerceProduct[]>(
      siteUrl,
      username,
      appPassword,
      `/products?${params.toString()}`,
      signal
    );
    all.push(...data);

    // Fewer results than requested means this was the last page.
    if (data.length < perPage) break;
  }

  return all.map(mapWooProduct).filter((p): p is Product => p !== null);
}
