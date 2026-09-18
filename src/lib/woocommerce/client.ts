import type { StoreCategory } from "@/modules/store/types";
import type { Product, ProductVariant } from "@/modules/shopping-agent/types";
import type { CatalogPageOptions, RawCatalogProduct, RawCatalogVariant, VariantOptionGroups } from "@/lib/catalog/sync-types";
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
  /** Unique per store, and the only thing separating same-named sibling terms. */
  slug: string;
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
        // A store can and does carry several sibling terms with the same display name — this
        // merchant has ten called "Accessories" under Women. The slug is unique, so it is the only
        // thing that tells the merchant which of them a row is asking about.
        handle: category.slug,
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

interface WooCommerceProductDimensions {
  length?: string;
  width?: string;
  height?: string;
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
  /** WooCommerce's own built-in fields beyond the ones the app already has a fixed ACS slot for.
   *  None of these have a default destination — they reach Stage 1 as bindable "field.*" columns
   *  (see `toWooBuiltInFields`) the same way a metafield does, for a merchant who wants "on sale" or
   *  "weight" as a Table 2 custom attribute. All optional because they're read straight off Woo's
   *  response rather than declared, so an older WooCommerce version simply omits them. */
  regular_price?: string;
  sale_price?: string;
  on_sale?: boolean;
  stock_quantity?: number | null;
  weight?: string;
  dimensions?: WooCommerceProductDimensions;
  featured?: boolean;
  slug?: string;
  status?: string;
  catalog_visibility?: string;
  virtual?: boolean;
  downloadable?: boolean;
  sold_individually?: boolean;
  backorders?: string;
  total_sales?: number;
  average_rating?: string;
  rating_count?: number;
  tax_status?: string;
  tax_class?: string;
  date_created_gmt?: string;
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

interface WooCommerceBrand {
  id: number;
  name: string;
  slug: string;
  count: number;
}

/**
 * Every brand name in the store, for the Stage 1 per-brand sizing exceptions.
 *
 * The same `product_brand` taxonomy each product's `brand` is read from, so this is the complete
 * list where a sample of products is not: a boutique carrying forty labels would otherwise only be
 * offered the handful that happened to appear in the sampled page.
 *
 * Returns what it has rather than throwing when the taxonomy is missing. Brands ship with
 * WooCommerce 9.4 and came from a plugin before that, so an older store 404s here — that is a store
 * without a brand taxonomy, not a failure worth blocking Stage 1 over, and the caller still has the
 * brands it read off the sampled products.
 */
export async function getWordPressBrands(
  siteUrl: string,
  username: string,
  appPassword: string
): Promise<string[]> {
  const all: string[] = [];
  let page = 1;

  while (true) {
    let data: WooCommerceBrand[];
    try {
      ({ data } = await wooFetch<WooCommerceBrand[]>(
        siteUrl,
        username,
        appPassword,
        `/products/brands?per_page=100&page=${page}`
      ));
    } catch (err) {
      if (err instanceof WooCommerceApiError && (err.status === 404 || err.status === 400)) return all;
      throw err;
    }

    if (data.length === 0) break;

    for (const brand of data) {
      // A term defined but attached to no products is not a brand this catalog sells, and offering
      // it would invite an exception that never applies to anything.
      if (brand.count === 0) continue;
      all.push(decodeHtmlEntities(brand.name));
    }

    if (data.length < 100) break;
    page += 1;
  }

  return all;
}

interface WooCommerceGlobalAttribute {
  id: number;
  name: string;
  slug: string;
  type: string;
}

interface WooCommerceAttributeTerm {
  id: number;
  name: string;
  count: number;
}

export interface WooGlobalAttribute {
  name: string;
  /** Term names with at least one product using them — an attribute defined store-wide but never
   *  assigned to any product has nothing here, same reasoning `getWordPressBrands` already
   *  applies to a brand term with zero products. */
  termCount: number;
}

/**
 * Every attribute WooCommerce's own "Attributes" admin screen declares store-wide (`pa_color`,
 * `pa_size`, ...), independent of which products the 25-sample discovery happened to see using
 * one. A global attribute is real store schema the moment a merchant creates it — this is what
 * lets Stage 1's "Variant Options" group offer "Size" before any sampled product has a size set,
 * the same reasoning `listShopifyMetafieldDefinitions` documents for Shopify's own definitions.
 *
 * WooCommerce ships attributes as a REST resource only from 3.0 on and needs no feature flag, so
 * unlike `getWordPressBrands` this doesn't degrade a 404 into an empty list — a store this old
 * cannot run this app's other REST-dependent features either.
 */
export async function listWooGlobalAttributes(
  siteUrl: string,
  username: string,
  appPassword: string
): Promise<WooGlobalAttribute[]> {
  const { data: attributes } = await wooFetch<WooCommerceGlobalAttribute[]>(
    siteUrl,
    username,
    appPassword,
    "/products/attributes?per_page=100"
  );

  // One request per attribute for its terms — bounded by `attributes.length`, which is a merchant's
  // own deliberately-created list (rarely more than a handful) rather than anything scaling with
  // catalog size, unlike a per-product walk.
  const withTerms = await mapWithConcurrency(attributes, 5, async (attribute) => {
    let termCount = 0;
    try {
      const { data: terms } = await wooFetch<WooCommerceAttributeTerm[]>(
        siteUrl,
        username,
        appPassword,
        `/products/attributes/${attribute.id}/terms?per_page=100`
      );
      termCount = terms.filter((term) => term.count > 0).length;
    } catch (err) {
      console.error(`[woocommerce listWooGlobalAttributes] terms for attribute ${attribute.id}`, err);
    }
    return { name: decodeHtmlEntities(attribute.name), termCount };
  });

  return withTerms;
}

// ─── Full-catalog listing (indexing, not search) ──────────────────────────────

interface WooCatalogProduct extends WooCommerceProduct {
  sku: string;
  permalink: string;
  date_modified_gmt: string;
  type: string;
  brands?: Array<{ name: string }>;
  /** Whatever the merchant's theme and plugins store per product. Already in the list response, so
   *  surfacing it as mappable columns costs nothing extra — see `toWooCustomFields`. */
  meta_data?: Array<{ key: string; value: unknown }>;
}

/**
 * The merchant's product meta as flat text columns Stage 1 can offer.
 *
 * Two filters, both about signal rather than size. Keys starting with `_` are WordPress's own
 * protected meta — `_edit_lock`, `_wp_old_slug`, a plugin's serialized internals — which no merchant
 * wants to map, and there are dozens per product. Non-scalar values are skipped rather than
 * JSON-stringified, because a plugin's nested settings blob rendered into a search index is noise a
 * merchant cannot fix from the dropdown.
 *
 * A size chart is the exception worth naming: plugins usually store it as one HTML or JSON *string*,
 * which passes both filters and is exactly the column the size chart row is looking for.
 */
function toWooCustomFields(meta: Array<{ key: string; value: unknown }> | undefined): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!meta) return fields;

  for (const entry of meta) {
    if (!entry.key || entry.key.startsWith("_")) continue;
    const value = entry.value;
    if (typeof value === "string") {
      if (value.trim()) fields[`meta.${entry.key}`] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      fields[`meta.${entry.key}`] = String(value);
    }
  }

  return fields;
}

/**
 * WooCommerce's own built-in product fields that aren't in the fixed `SOURCE_FIELDS` list — no ACS
 * target defaults to one of these, so they reach Stage 1 as `field.*` columns exactly like a
 * metafield: bindable into any row's dropdown or declared as a Table 2 custom attribute, never
 * auto-mapped anywhere on their own.
 *
 * Keyed `field.` rather than `meta.` because they aren't the merchant's own plugin data — `meta.`
 * stays reserved for `meta_data`, so a merchant who does have a genuine custom field literally named
 * "weight" can't collide with this one.
 */
function toWooBuiltInFields(product: WooCommerceProduct): Record<string, string> {
  const fields: Record<string, string> = {};

  const tagNames = product.tags?.map((tag) => decodeHtmlEntities(tag.name)).filter(Boolean) ?? [];
  if (tagNames.length > 0) fields["field.tags"] = tagNames.join(", ");

  const shortDescription = product.short_description ? stripHtml(product.short_description) : "";
  if (shortDescription) fields["field.short_description"] = shortDescription;

  if (product.regular_price?.trim()) fields["field.regular_price"] = product.regular_price.trim();
  if (product.sale_price?.trim()) fields["field.sale_price"] = product.sale_price.trim();
  if (product.on_sale !== undefined) fields["field.on_sale"] = String(product.on_sale);

  if (typeof product.stock_quantity === "number") fields["field.stock_quantity"] = String(product.stock_quantity);
  if (product.weight?.trim()) fields["field.weight"] = product.weight.trim();

  const dims = product.dimensions;
  const dimensionParts = [dims?.length, dims?.width, dims?.height].filter((part) => part?.trim());
  if (dimensionParts.length > 0) fields["field.dimensions"] = dimensionParts.join(" x ");

  if (product.featured !== undefined) fields["field.featured"] = String(product.featured);

  // The rest of Woo's own product shape — already in every list response at no extra request
  // cost, so surfacing these as bindable columns is free. None default anywhere: a merchant who
  // wants "is this a virtual/downloadable product" or star rating searchable declares it as a
  // Table 2 attribute the same way as any metafield.
  if (product.slug?.trim()) fields["field.slug"] = product.slug.trim();
  if (product.status?.trim()) fields["field.status"] = product.status.trim();
  if (product.catalog_visibility?.trim()) fields["field.catalog_visibility"] = product.catalog_visibility.trim();
  if (product.virtual !== undefined) fields["field.virtual"] = String(product.virtual);
  if (product.downloadable !== undefined) fields["field.downloadable"] = String(product.downloadable);
  if (product.sold_individually !== undefined) fields["field.sold_individually"] = String(product.sold_individually);
  if (product.backorders?.trim()) fields["field.backorders"] = product.backorders.trim();
  if (typeof product.total_sales === "number") fields["field.total_sales"] = String(product.total_sales);
  if (product.average_rating?.trim() && product.average_rating !== "0") {
    fields["field.average_rating"] = product.average_rating.trim();
  }
  if (typeof product.rating_count === "number" && product.rating_count > 0) {
    fields["field.rating_count"] = String(product.rating_count);
  }
  if (product.tax_status?.trim()) fields["field.tax_status"] = product.tax_status.trim();
  if (product.tax_class?.trim()) fields["field.tax_class"] = product.tax_class.trim();
  if (product.date_created_gmt?.trim()) fields["field.created_at"] = `${product.date_created_gmt.trim()}Z`;

  return fields;
}

/** Runs `fn` over `items` with at most `limit` calls in flight — mirrors the Shopify client's own
 *  helper of the same name; each platform client stays free-standing rather than sharing a util
 *  for one seven-line function. */
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

interface WooCommerceVariationImage {
  src: string;
}

interface WooCommerceVariationAttribute {
  name: string;
  option: string;
}

interface WooCommerceVariation {
  id: number;
  sku?: string;
  price?: string;
  regular_price?: string;
  stock_status: "instock" | "outofstock" | "onbackorder";
  stock_quantity?: number | null;
  weight?: string;
  image?: WooCommerceVariationImage | null;
  attributes?: WooCommerceVariationAttribute[];
  permalink?: string;
  meta_data?: Array<{ key: string; value: unknown }>;
}

/** Meta keys real-world barcode plugins (and WooCommerce core as of 8.x, behind a feature flag)
 *  commonly store a GTIN/UPC/EAN under — checked case-insensitively since a plugin picks its own
 *  casing. There is no single WooCommerce-core field for this the way Shopify has `barcode`. */
const WOO_BARCODE_META_KEYS = new Set(["_gtin", "_global_unique_id", "_barcode", "_upc", "_ean", "gtin", "barcode", "upc", "ean"]);

function wooBarcodeFromMeta(meta: Array<{ key: string; value: unknown }> | undefined): string | null {
  if (!meta) return null;
  for (const entry of meta) {
    if (!WOO_BARCODE_META_KEYS.has(entry.key.toLowerCase())) continue;
    if (typeof entry.value === "string" && entry.value.trim()) return entry.value.trim();
  }
  return null;
}

/** The one synthetic variant a "simple" (or grouped/external) product gets, mirroring its own
 *  parent-level price/sku/stock/image exactly — see `RawCatalogVariant`'s doc comment for why
 *  every product, variable or not, carries at least one entry here. */
function syntheticWooVariant(product: WooCatalogProduct, images: string[]): RawCatalogVariant {
  return {
    externalId: String(product.id),
    sku: product.sku?.trim() || null,
    barcode: wooBarcodeFromMeta(product.meta_data),
    title: null,
    price: Number(product.price) || null,
    compareAtPrice:
      product.regular_price?.trim() && product.regular_price !== product.price
        ? Number(product.regular_price) || null
        : null,
    currency: WOOCOMMERCE_DEFAULT_CURRENCY,
    inStock: product.stock_status === "instock",
    inventoryQuantity: typeof product.stock_quantity === "number" ? product.stock_quantity : null,
    imageUrl: images[0] ?? null,
    selectedOptions: {},
    weight: product.weight?.trim() ? Number(product.weight) || null : null,
    weightUnit: product.weight?.trim() ? "kg" : null,
    productUrl: product.permalink || null,
    customFields: {},
  };
}

function toWooCatalogVariant(variation: WooCommerceVariation, fallbackImage: string | null): RawCatalogVariant {
  const selectedOptions: Record<string, string> = {};
  for (const attribute of variation.attributes ?? []) {
    if (attribute.name && attribute.option) selectedOptions[attribute.name] = attribute.option;
  }

  return {
    externalId: String(variation.id),
    sku: variation.sku?.trim() || null,
    barcode: wooBarcodeFromMeta(variation.meta_data),
    title: Object.values(selectedOptions).join(" / ") || null,
    price: variation.price ? Number(variation.price) || null : null,
    compareAtPrice:
      variation.regular_price?.trim() && variation.regular_price !== variation.price
        ? Number(variation.regular_price) || null
        : null,
    currency: WOOCOMMERCE_DEFAULT_CURRENCY,
    inStock: variation.stock_status === "instock",
    inventoryQuantity: typeof variation.stock_quantity === "number" ? variation.stock_quantity : null,
    imageUrl: variation.image?.src ?? fallbackImage,
    selectedOptions,
    weight: variation.weight?.trim() ? Number(variation.weight) || null : null,
    weightUnit: variation.weight?.trim() ? "kg" : null,
    productUrl: variation.permalink ?? null,
    customFields: toWooCustomFields(variation.meta_data),
  };
}

/** Capped at 5 pages (2,500 variations) per product — far past any real storefront's colour/size
 *  matrix; a product beyond that pages no further rather than looping indefinitely. */
const WOO_VARIATION_MAX_PAGES = 5;

/** How many products' variations are fetched concurrently while paging a catalog listing. Each
 *  variable product costs at least one extra request — true variant data has no bulk-fetch form
 *  in the WooCommerce REST API — so this is what keeps a page of 100 mixed simple/variable
 *  products from serializing into 100 sequential round trips. */
const WOO_VARIANT_FETCH_CONCURRENCY = 5;

/**
 * Every real variant of one product — the full colour/size matrix for a "variable" product via
 * its `/variations` sub-resource, or the single synthetic entry every other product type gets.
 *
 * This is the one place true per-SKU price/stock/image/options data enters the pipeline: the
 * product list endpoint above only ever reports *attribute options* (`toWooVariantOptionGroups`),
 * never which specific variation each combination resolves to.
 */
async function fetchWooVariants(
  siteUrl: string,
  username: string,
  appPassword: string,
  product: WooCatalogProduct,
  images: string[],
  signal?: AbortSignal
): Promise<RawCatalogVariant[]> {
  if (product.type !== "variable") return [syntheticWooVariant(product, images)];

  const all: WooCommerceVariation[] = [];
  for (let page = 1; page <= WOO_VARIATION_MAX_PAGES; page++) {
    let data: WooCommerceVariation[];
    try {
      ({ data } = await wooFetch<WooCommerceVariation[]>(
        siteUrl,
        username,
        appPassword,
        `/products/${product.id}/variations?per_page=${WOO_PAGE_SIZE}&page=${page}`,
        signal
      ));
    } catch (err) {
      // A variable product whose variations 404/500 (deleted mid-walk, malformed data) still
      // needs *something* purchasable to represent it — fall back to whatever was already read,
      // or the synthetic entry, rather than dropping the product's variant data entirely.
      console.error(`[woocommerce fetchWooVariants] variations failed for product ${product.id}`, err);
      return all.length > 0
        ? all.map((variation) => toWooCatalogVariant(variation, images[0] ?? null))
        : [syntheticWooVariant(product, images)];
    }

    all.push(...data);
    if (data.length < WOO_PAGE_SIZE) break;
  }

  if (all.length === 0) return [syntheticWooVariant(product, images)];
  return all.map((variation) => toWooCatalogVariant(variation, images[0] ?? null));
}

function mapWooCatalogProduct(product: WooCatalogProduct, variants: RawCatalogVariant[]): RawCatalogProduct {
  const images = product.images.map((image) => image.src).filter(Boolean);

  return {
    externalId: String(product.id),
    productGroupId: String(product.id),
    sku: product.sku?.trim() || null,
    title: decodeHtmlEntities(product.name),
    description: stripHtml(product.description || product.short_description),
    brand: product.brands?.[0]?.name ? decodeHtmlEntities(product.brands[0].name).trim() || null : null,
    rawCategories: product.categories.map((category) => decodeHtmlEntities(category.name)),
    sourceCategoryIds: product.categories.map((category) => String(category.id)),
    price: Number(product.price) || null,
    currency: WOOCOMMERCE_DEFAULT_CURRENCY,
    inStock: product.stock_status === "instock",
    productUrl: product.permalink || null,
    imageUrl: images[0] ?? null,
    images,
    variantOptions: toWooVariantOptionGroups(product.attributes),
    customFields: { ...toWooBuiltInFields(product), ...toWooCustomFields(product.meta_data) },
    // WooCommerce reports this in GMT without a zone marker, so it needs one to parse as UTC.
    updatedAt: product.date_modified_gmt ? `${product.date_modified_gmt}Z` : null,
    variants,
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

  const products = await mapWithConcurrency(data, WOO_VARIANT_FETCH_CONCURRENCY, async (product) => {
    const images = product.images.map((image) => image.src).filter(Boolean);
    const variants = await fetchWooVariants(siteUrl, username, appPassword, product, images, signal);
    return mapWooCatalogProduct(product, variants);
  });

  return {
    products,
    hasMore: data.length === perPage,
  };
}

/**
 * Reads named products, for a caller that already knows exactly which ones it wants.
 *
 * `include` is Woo's own id filter and returns each listed product once, so no category walk and no
 * paging past non-matches. Bounded by `per_page`, hence the caller chunking to a page's worth.
 *
 * Ids that no longer exist are simply absent from the response rather than an error, which is the
 * right behaviour here: a product deleted since the scan should drop off the list, not break it.
 */
export async function listWooProductsByIds(
  siteUrl: string,
  username: string,
  appPassword: string,
  externalIds: readonly string[],
  signal?: AbortSignal
): Promise<RawCatalogProduct[]> {
  if (externalIds.length === 0) return [];

  const params = new URLSearchParams({
    include: externalIds.join(","),
    per_page: String(Math.min(externalIds.length, WOO_PAGE_SIZE)),
    status: "publish",
  });

  const { data } = await wooFetch<WooCatalogProduct[]>(
    siteUrl,
    username,
    appPassword,
    `/products?${params.toString()}`,
    signal
  );

  return mapWithConcurrency(data, WOO_VARIANT_FETCH_CONCURRENCY, async (product) => {
    const images = product.images.map((image) => image.src).filter(Boolean);
    const variants = await fetchWooVariants(siteUrl, username, appPassword, product, images, signal);
    return mapWooCatalogProduct(product, variants);
  });
}

/**
 * How many products a catalog page filter matches, without reading any of them.
 *
 * `X-WP-Total` reports the total for the filter that produced it, so asking for a single row of the
 * same query the walk uses is the whole count. That matters for the category filter specifically:
 * it is a union that returns each product once however many of the listed terms it sits on, so this
 * is a genuine deduplicated total rather than a sum of per-category counts that double-counts
 * anything filed in two places.
 */
export async function countWooCatalogProducts(
  siteUrl: string,
  username: string,
  appPassword: string,
  options: Pick<CatalogPageOptions, "categoryIds" | "updatedAfter"> = {},
  signal?: AbortSignal
): Promise<number> {
  const params = new URLSearchParams({ per_page: "1", status: "publish" });
  if (options.updatedAfter) params.set("modified_after", options.updatedAfter);
  if (options.categoryIds?.length) params.set("category", options.categoryIds.join(","));

  const { headers } = await wooFetch<WooCatalogProduct[]>(
    siteUrl,
    username,
    appPassword,
    `/products?${params.toString()}`,
    signal
  );

  return Number(headers.get("x-wp-total") ?? 0);
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
  const normalized: WooCatalogProduct = {
    ...product,
    images: product.images ?? [],
    categories: product.categories ?? [],
    tags: product.tags ?? [],
    attributes: product.attributes ?? [],
  };
  const images = normalized.images.map((image) => image.src).filter(Boolean);

  // A "variable" product's webhook payload carries only its variations' *ids*
  // (`variations: number[]`), never their price/stock/options — recovering those needs the
  // `/variations` sub-resource, an async fetch this synchronous webhook mapper cannot make. An
  // empty array here is the signal `indexProductIfInScope` checks to refetch through the full
  // catalog path (`fetchWooVariants`), mirroring the existing bound-metafield refetch. Every
  // other product type's variant data is already complete on the parent object itself, so its
  // one synthetic variant is built synchronously with no gap to fill in later.
  const variants = normalized.type === "variable" ? [] : [syntheticWooVariant(normalized, images)];

  return mapWooCatalogProduct(normalized, variants);
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
