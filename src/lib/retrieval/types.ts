export interface RuleSelector {
  brands?: string[];
  categories?: string[];
  subcategories?: string[];
}

/**
 * Client constraints that are absolute, typed so they are executed rather than interpreted.
 *
 * A merchant saying "never" is a constraint compiled into the query, not a preference weighed
 * against other considerations — which is exactly what would happen if these were handed to a
 * model as prose. Soft taste guidance lives in `style_guide` instead.
 */
export type HardRule =
  | { type: "exclude_items"; externalIds?: string[]; brands?: string[]; categories?: string[] }
  | { type: "never_pair"; a: RuleSelector; b: RuleSelector }
  | { type: "max_price_spread"; amount: number };

/** Runs on merchant-supplied columns only. There is deliberately no colour, material or
 *  formality field: those are reached through cosine, because they are exactly the attributes
 *  merchants populate inconsistently or not at all.
 *
 *  `category`/`subcategory` are the merchant's own real names, matched against every selected
 *  category a product belongs to — not a fixed vocabulary. `garmentCategory`/`garmentSubcategory`
 *  are a separate, internal-only pair used by the bundle finder to target a physical slot (top,
 *  bottom, shoe, ...); they are never shown to the shopper and never set from a shopper's words. */
export interface CatalogFilter {
  category?: string;
  subcategory?: string;
  brand?: string;
  priceMin?: number;
  priceMax?: number;
  inStockOnly?: boolean;
  excludeExternalIds?: string[];
  garmentCategory?: string;
  garmentSubcategory?: string;
}

/** One selected category a product belongs to, in the merchant's own names, ordered root-first
 *  down to the product's own most specific tag — `["Men", "Clothing", "Shirts"]` — however many
 *  levels deep the merchant's store actually nests that category. */
export type CategoryPath = string[];

export interface CatalogCandidate {
  externalId: string;
  /** The real store variant id, when this candidate was matched off (or rolled up from) an ACS
   *  `VARIANT` record rather than only ever the `PRIMARY` — see `map-product.ts`'s
   *  `buildVariantAcsProducts` and `search-adapter.ts`'s `toCandidate`. Null for a `PRIMARY`-only
   *  match, which is every candidate before real per-SKU variants existed and still most of them
   *  after: this is additive metadata, not yet consumed by add-to-cart resolution or ranking. */
  variantExternalId?: string | null;
  productGroupId: string | null;
  title: string;
  brand: string | null;
  /** Every selected category this product belongs to — a product can carry more than one, and
   *  each one can be an arbitrarily deep chain. There is no primary scalar column anymore;
   *  callers that need a flattened view (an anchor, a display tag, a 2-level filter match)
   *  derive it from this. */
  categoryPaths: CategoryPath[];
  price: number | null;
  currency: string | null;
  inStock: boolean;
  productUrl: string | null;
  imageUrl: string | null;
  enrichedDescription: string | null;
  /** Every predefined variant bucket ACS recognizes (colour, size, material, ...) *and* every
   *  per-merchant custom option (fit, collar type, inseam, ...) this product actually carries,
   *  keyed by whatever label the mapper gave it on the way in — see `extractVariantAttributes`
   *  in map-product.ts, whose bucket names this mirrors. There is no fixed set of keys: a
   *  product from one store might have none of these, another might have five nothing here
   *  anticipates by name. Absent (or empty) when the product has nothing recorded. */
  attributes?: Record<string, string[]>;
  /** In-stock sizes whose chart row fits the shopper's measurements. Set only when the turn
   *  carried measurements. */
  fitSizes?: string[];
  /** Internal try-on/bundle slot, derived from the title at index time. */
  garmentCategory: string | null;
  garmentSubcategory: string | null;
  similarity?: number;
}

/** Distinct values actually present in one merchant's catalog, injected into every
 *  filter-building call so the model builds against what exists. */
export interface CatalogFacets {
  categories: Array<{ category: string; subcategory: string | null }>;
  brands: string[];
  priceRange: { min: number; max: number } | null;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}
