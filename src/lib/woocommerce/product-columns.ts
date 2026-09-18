import type { CmsColumnDef } from "@/lib/catalog/cms-columns";

/**
 * WooCommerce's own built-in `field.*` columns (see `toWooBuiltInFields` in `client.ts`), declared
 * statically for the same reason as `shopify/product-columns.ts`'s sibling list: so a column that
 * genuinely exists on every WooCommerce store shows up in Stage 1 even when the sampled 25 products
 * all happen to have it empty.
 *
 * All `discoverable: true` (the default) — WooCommerce's product list response already includes
 * every one of these fields on every request at no extra cost (see `toWooBuiltInFields`'s own doc
 * comment), unlike a Woo *meta_data* key, which genuinely cannot be discovered unless some product
 * has a stored value for it or a plugin registers it — that limitation is documented on
 * `toWooCustomFields` instead, since it applies to the merchant's own dynamic fields, not this
 * static list.
 */
export const WOOCOMMERCE_NATIVE_COLUMNS: CmsColumnDef[] = [
  {
    ref: { kind: "meta", key: "field.tags" },
    label: "Tags",
    group: "taxonomy",
    scope: "product",
    valueType: "list",
  },
  {
    ref: { kind: "meta", key: "field.short_description" },
    label: "Short Description",
    group: "identifiers",
    scope: "product",
    valueType: "html",
  },
  {
    ref: { kind: "meta", key: "field.regular_price" },
    label: "Regular Price",
    group: "pricing_inventory",
    scope: "product",
    valueType: "number",
  },
  {
    ref: { kind: "meta", key: "field.sale_price" },
    label: "Sale Price",
    group: "pricing_inventory",
    scope: "product",
    valueType: "number",
  },
  {
    ref: { kind: "meta", key: "field.on_sale" },
    label: "On Sale",
    group: "pricing_inventory",
    scope: "product",
    valueType: "boolean",
  },
  {
    ref: { kind: "meta", key: "field.stock_quantity" },
    label: "Stock Quantity",
    group: "pricing_inventory",
    scope: "product",
    valueType: "number",
  },
  {
    ref: { kind: "meta", key: "field.weight" },
    label: "Weight",
    group: "advanced",
    scope: "product",
    valueType: "number",
  },
  {
    ref: { kind: "meta", key: "field.dimensions" },
    label: "Dimensions (L x W x H)",
    group: "advanced",
    scope: "product",
    valueType: "text",
  },
  {
    ref: { kind: "meta", key: "field.featured" },
    label: "Featured",
    group: "advanced",
    scope: "product",
    valueType: "boolean",
  },
  {
    ref: { kind: "meta", key: "field.slug" },
    label: "Slug",
    group: "identifiers",
    scope: "product",
    valueType: "text",
  },
  {
    ref: { kind: "meta", key: "field.status" },
    label: "Status",
    group: "identifiers",
    scope: "product",
    valueType: "text",
    description: "\"publish\", \"draft\", \"pending\", or \"private\" in WordPress.",
  },
  {
    ref: { kind: "meta", key: "field.catalog_visibility" },
    label: "Catalog Visibility",
    group: "advanced",
    scope: "product",
    valueType: "text",
  },
  {
    ref: { kind: "meta", key: "field.virtual" },
    label: "Virtual Product",
    group: "advanced",
    scope: "product",
    valueType: "boolean",
  },
  {
    ref: { kind: "meta", key: "field.downloadable" },
    label: "Downloadable Product",
    group: "advanced",
    scope: "product",
    valueType: "boolean",
  },
  {
    ref: { kind: "meta", key: "field.sold_individually" },
    label: "Sold Individually",
    group: "advanced",
    scope: "product",
    valueType: "boolean",
  },
  {
    ref: { kind: "meta", key: "field.backorders" },
    label: "Backorders",
    group: "advanced",
    scope: "product",
    valueType: "text",
  },
  {
    ref: { kind: "meta", key: "field.total_sales" },
    label: "Total Sales",
    group: "advanced",
    scope: "product",
    valueType: "number",
  },
  {
    ref: { kind: "meta", key: "field.average_rating" },
    label: "Average Rating",
    group: "advanced",
    scope: "product",
    valueType: "number",
  },
  {
    ref: { kind: "meta", key: "field.rating_count" },
    label: "Rating Count",
    group: "advanced",
    scope: "product",
    valueType: "number",
  },
  {
    ref: { kind: "meta", key: "field.tax_status" },
    label: "Tax Status",
    group: "advanced",
    scope: "product",
    valueType: "text",
  },
  {
    ref: { kind: "meta", key: "field.tax_class" },
    label: "Tax Class",
    group: "advanced",
    scope: "product",
    valueType: "text",
  },
  {
    ref: { kind: "meta", key: "field.created_at" },
    label: "Created At",
    group: "identifiers",
    scope: "product",
    valueType: "date",
  },
];
