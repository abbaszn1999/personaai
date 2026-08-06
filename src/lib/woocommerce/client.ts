import type { StoreCategory } from "@/modules/store/types";
import type { Product, ProductVariant } from "@/modules/shopping-agent/types";
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
}

/**
 * Fetches product categories and their product counts, paginating through WooCommerce's
 * 100-per-page limit so large catalogs aren't silently truncated.
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
        name: category.name,
        productCount: category.count ?? 0,
      });
    }

    if (data.length < 100) break;
    page += 1;
    // Safety valve — Woo stores with absurd category trees shouldn't hang forever.
    if (page > 20) break;
  }

  return all;
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
