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
  /** The platform's last-modified timestamp, used as the reconciliation cursor. */
  updatedAt: string | null;
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
}
