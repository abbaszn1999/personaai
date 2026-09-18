/**
 * One real purchasable variant (a colourway/size combination) of a `RawCatalogProduct`.
 *
 * Every product carries at least one — a "simple" WooCommerce product or a Shopify product with
 * no options gets exactly one synthetic entry mirroring the parent's own price/sku/stock, so
 * downstream code (the ACS mapper) never has to special-case "no variants" separately from "one
 * variant". Real per-SKU data (`sku`, `barcode`, `price`, `inStock`, `imageUrl`, `selectedOptions`)
 * is what lets the mapper emit a genuine ACS `VARIANT` record per SKU instead of collapsing a
 * whole colour/size matrix into one row's first variant — see `rawCatalogProductToAcsProducts` in
 * `acs/map-product.ts`.
 */
export interface RawCatalogVariant {
  /** The platform's own variant id (Shopify's `ProductVariant` GID, WooCommerce's variation id —
   *  or the parent product's own id again for a "simple"/no-option product's synthetic entry). */
  externalId: string;
  sku: string | null;
  /** UPC/EAN/ISBN — ACS's `Product.gtin`, when the platform tracks one per variant. */
  barcode: string | null;
  /** The variant's own display title ("Berry / M"), when the platform gives one distinct from
   *  the parent product's title. Null for the single synthetic variant of a non-variable product. */
  title: string | null;
  price: number | null;
  /** The pre-discount/list price, when the platform tracks one per variant — ACS's
   *  `priceInfo.originalPrice`. */
  compareAtPrice: number | null;
  currency: string | null;
  inStock: boolean;
  inventoryQuantity: number | null;
  /** Falls back to the parent's own `imageUrl` when a variant carries no image of its own. */
  imageUrl: string | null;
  /** This variant's own position in each option group it belongs to — `{ Color: "Berry", Size:
   *  "M" }` — keyed by the platform's own option name, matching `RawCatalogProduct.variantOptions`'
   *  keys so the two agree on spelling. */
  selectedOptions: Record<string, string>;
  weight: number | null;
  weightUnit: string | null;
  /** A variant-specific URL when the platform supports deep-linking to one (Shopify's
   *  `?variant=<id>` query param); otherwise the parent's own `productUrl`. */
  productUrl: string | null;
  /** Variant-scoped custom data, same `field.`/`meta.`/`metafield.` keying convention as
   *  `RawCatalogProduct.customFields` — a per-variant metafield/meta entry, not the parent's. */
  customFields: Record<string, string>;
}

/**
 * One product as pulled from a merchant's store for indexing.
 *
 * Deliberately *not* the app's `Product` type. `Product` is shaped for rendering a card and
 * drops the things indexing depends on — vendor/brand, the merchant's own category label to
 * map onto the canonical taxonomy, real variant ids, and the update timestamp reconciliation
 * uses as a cursor. Mapping straight from the raw platform payload keeps those.
 */
export interface RawCatalogProduct {
  /** The platform's own product id. Unique per connection; the upsert key. */
  externalId: string;
  /** Groups colourways and sizes. For both platforms today a product's variants live under
   *  one product id, so this is that product's stable handle/id. When a merchant splits
   *  colourways into genuinely separate products there is no reliable shared key, and variant
   *  lookups fall back to a cosine search off the anchor instead of inventing a grouping. */
  productGroupId: string | null;
  sku: string | null;
  title: string;
  description: string | null;
  brand: string | null;
  /** Every merchant category/product-type label this product carries, in the platform's own
   *  order. Kept for reference; {@link resolveCategoryPaths} works from `sourceCategoryIds`
   *  below rather than these labels, since it needs to know exactly which of the merchant's
   *  selected categories a product belongs to, not just their names. */
  rawCategories: string[];
  /** Every merchant category/collection id this product belongs to.
   *
   *  Full membership rather than just the category it was found under, which is what makes the
   *  scope check decidable from the row alone: whether a product survives a deselection, or a
   *  webhook edit moves it out of scope, is an overlap test against this set. */
  sourceCategoryIds: string[];
  price: number | null;
  currency: string | null;
  inStock: boolean;
  productUrl: string | null;
  imageUrl: string | null;
  images: string[];
  variantOptions: VariantOptionGroups;
  /**
   * Every column this platform has no first-class `SOURCE_FIELDS`/ACS-target slot for, as flat
   * text, keyed by where it came from:
   *  - `metafield.<namespace>.<key>` — a Shopify metafield.
   *  - `meta.<key>` — WooCommerce's own `meta_data` (plugin/ACF fields).
   *  - `field.<name>` — a platform's *built-in* field that still has no ACS default (tags, sale
   *    price, weight, ...); see `toWooBuiltInFields`/`toShopifyBuiltInFields`.
   *
   * A fit note, a care label, a per-product size chart, a tag list — anything here reaches Stage 1
   * as an ordinary bindable column, which is what makes a merchant who already stores size charts
   * per product able to say so instead of being walked through generating them.
   *
   * Only Shopify metafields the merchant has bound are fetched on the indexing path (see
   * `boundMetafieldKeys`) — a Shopify catalog page cannot afford an unbounded metafields
   * connection. `meta.*` and `field.*` cost nothing extra since they ride along with every product
   * either platform already returns, so both are always populated. Discovery samples metafields
   * more widely so the dropdown has something to offer before anything is bound.
   */
  customFields: Record<string, string>;
  /** The platform's last-modified timestamp, used as the reconciliation cursor. */
  updatedAt: string | null;
  /**
   * Every real purchasable variant of this product, always at least one. See
   * {@link RawCatalogVariant} — this is what lets the mapper emit true ACS `PRIMARY`/`VARIANT`
   * records instead of only ever writing one `PRIMARY` per product with variant data aggregated
   * (colours/sizes) rather than per-SKU.
   *
   * Populated on every full-catalog read (`listShopifyCatalogPage`/`listWooCatalogPage` and their
   * `*ByIds` siblings). A webhook delivery may not always be able to fill this in synchronously —
   * WooCommerce's webhook payload for a variable product carries only variation *ids*, not their
   * data — in which case the mapper's adapter emits an empty array here as a signal, and
   * `indexProductIfInScope` refetches through the full catalog path to recover it (mirroring the
   * existing bound-metafield refetch).
   */
  variants: RawCatalogVariant[];
}

/** Option name (e.g. "Color") to its available values with the platform ids needed to swap
 *  one in without a round trip back to the store. */
export type VariantOptionGroups = Record<string, Array<{ id: string; label: string }>>;

export interface CatalogPageOptions {
  /** Only return products modified since this ISO timestamp. Absent on a full backfill. */
  updatedAfter?: string;
  pageSize?: number;
  /** Restrict to these of the merchant's categories/collections, as a union. Indexing is always
   *  scoped this way: a store's catalog is usually far larger than the part an agent is meant to
   *  sell, and enrichment is billed per product, so walking everything would charge for a whole
   *  warehouse to index one aisle.
   *
   *  WooCommerce filters on the whole set at once and returns each product once. Shopify can only
   *  descend from a single collection, so its client reads the first id and the caller passes them
   *  one at a time. */
  categoryIds?: string[];
  /**
   * Shopify only: which metafields to fetch alongside each product, as `namespace.key` identifiers.
   *
   * Named rather than fetched wholesale because Shopify prices a metafields connection into the
   * query's cost, and a walk of 200,000 products asking for every metafield on each one throttles
   * the whole backfill to a crawl. Only the ones a merchant actually bound in Stage 1 are worth
   * paying for. WooCommerce ignores this — its list response already carries all product meta.
   */
  metafieldKeys?: readonly string[];
  /**
   * Shopify only: sample whatever metafields each product happens to have, rather than named ones.
   *
   * For Stage 1's column discovery, which has to show a merchant what exists before they can bind
   * anything. Affordable only because discovery reads one small page; never set on an indexing walk.
   */
  discoverCustomFields?: boolean;
}
