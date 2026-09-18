/**
 * Where one of a merchant's store fields can be sent in AI Commerce Search.
 *
 * The destination side of Stage 1's table. ACS's schema is Google's and fixed — we cannot invent
 * `brands[0]` or rename `priceInfo.price` — so a merchant never edits the destination list. What
 * they choose is which of *their* fields arrives at each one, which is the mapping this vocabulary
 * makes expressible.
 *
 * Kept free of Node built-ins and server imports on purpose: the Stage 1 table is client code and
 * imports this directly, the same constraint `option-groups.ts` documents.
 */

/**
 * The shape of a value, used to decide which destinations a given store field may be offered.
 *
 * Not decoration. Without it the dropdown would happily let someone point their SKU at
 * `priceInfo.price`, and the failure would not surface until ACS rejected a product mid-import —
 * by which point the merchant has left the page and the error names a field they never chose.
 */
export type AcsFieldKind = "text" | "textList" | "number" | "boolean" | "url" | "urlList";

export interface AcsTargetDef {
  /** Stable id, stored in the merchant's overrides. Never a display string — renaming a label must
   *  not orphan a saved mapping. */
  key: string;
  label: string;
  /** The path shown under the label, matching what the mapper writes. */
  acsPath: string;
  kind: AcsFieldKind;
  /** Written by the pipeline itself, never fed from a merchant field, so it is shown in the table
   *  but never offered as a destination — `merchant_id` is not somewhere a store field can go. */
  internal?: boolean;
}

/** Sent nowhere. A real choice rather than an absence: a merchant switching a field off wants it
 *  gone from search, and a row saying so is easier to trust than a row that vanished. */
export const NOT_SENT = "ignore";

export const ACS_TARGETS: readonly AcsTargetDef[] = [
  { key: "title", label: "Title", acsPath: "title", kind: "text" },
  { key: "description", label: "Description", acsPath: "description", kind: "text" },
  { key: "brand", label: "Brand", acsPath: "brands[0]", kind: "text" },
  { key: "price", label: "Price", acsPath: "priceInfo.price, priceInfo.currencyCode", kind: "number" },
  { key: "availability", label: "Stock", acsPath: "availability", kind: "boolean" },
  { key: "categories", label: "Categories", acsPath: "categories", kind: "textList" },
  { key: "images", label: "Images", acsPath: "images[].uri", kind: "urlList" },
  { key: "uri", label: "Product URL", acsPath: "uri", kind: "url" },
  { key: "colors", label: "Color", acsPath: "colorInfo.colors", kind: "textList" },
  { key: "sizes", label: "Size", acsPath: "sizes", kind: "textList" },
  { key: "materials", label: "Material", acsPath: "materials", kind: "textList" },
  { key: "patterns", label: "Pattern", acsPath: "patterns", kind: "textList" },
  { key: "genders", label: "Gender", acsPath: "genders", kind: "textList" },
  { key: "ageGroups", label: "Age group", acsPath: "ageGroups", kind: "textList" },
  { key: "sku", label: "SKU", acsPath: "attributes.sku", kind: "text" },
  { key: "productGroupId", label: "Variant group", acsPath: "attributes.product_group_id", kind: "text" },
  // Fed by whichever custom field a merchant already keeps their per-product charts in — normally a
  // metafield, so there is no default column for it. Binding this row is what lets a store skip the
  // chart-generation stages, since it means the data the pipeline would have produced already exists.
  { key: "sizeChartData", label: "Size chart", acsPath: "attributes.size_chart_data", kind: "text" },
  {
    key: "custom",
    label: "Custom attribute",
    acsPath: "attributes.opt_<field>",
    kind: "textList",
  },
  // Internal destinations. Listed so the table can name where an internal row lands, and excluded
  // from every dropdown by `targetsFor`.
  { key: "id", label: "Product ID", acsPath: "id", kind: "text", internal: true },
  {
    key: "garment",
    label: "Garment type",
    acsPath: "attributes.garment_category, attributes.garment_subcategory",
    kind: "textList",
    internal: true,
  },
  {
    key: "merchant",
    label: "Merchant",
    acsPath: "attributes.merchant_id",
    kind: "text",
    internal: true,
  },
];

const BY_KEY = new Map(ACS_TARGETS.map((target) => [target.key, target]));

export function acsTarget(key: string): AcsTargetDef | undefined {
  return BY_KEY.get(key);
}

/** Human label for a stored target key, for anywhere showing the choice without the control. */
export function destinationLabel(key: string): string {
  if (key === NOT_SENT) return "Not sent";
  return acsTarget(key)?.label ?? key;
}

export function isAcsTargetKey(value: unknown): value is string {
  return typeof value === "string" && (value === NOT_SENT || BY_KEY.has(value));
}

/**
 * Every destination a store field may be pointed at — the same list on every row.
 *
 * Deliberately unfiltered. An earlier version offered only type-compatible destinations, which
 * meant two rows showed two different lists and a merchant had to work out why. The mapper coerces
 * instead (`coerceForTarget`), so picking an odd combination produces a sensible value rather than
 * a rejected import.
 *
 * Internal destinations are still excluded — `merchant_id` and the ACS product id are written by
 * the pipeline, and there is no merchant field that could go to either. "Not sent" is added by the
 * caller, since it is the absence of a destination rather than one of them.
 */
export function targetsFor(): AcsTargetDef[] {
  return ACS_TARGETS.filter((target) => !target.internal);
}
