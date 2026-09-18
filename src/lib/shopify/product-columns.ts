import type { CmsColumnDef } from "@/lib/catalog/cms-columns";

/**
 * Shopify's own built-in `field.*` columns (see `toShopifyBuiltInFields` in `client.ts`), declared
 * statically so they appear in Stage 1's dropdowns even for a merchant whose sampled 25 products
 * happen to have every one of them empty — "Handle" and "SEO Title" are real, always-fetched
 * columns on this platform regardless of what any particular sample shows.
 *
 * Kept in step with `toShopifyBuiltInFields` by hand rather than generated from it: the mapping
 * function's job is producing the *value*, this list's job is describing the *column* — group,
 * scope, type, one line of explanation — which only exists for a human reading a dropdown.
 *
 * Every entry here is `discoverable: true` (the default) because this app's own sync genuinely
 * fetches all of them today. A Shopify column this app cannot currently discover would be declared
 * `discoverable: false` instead of omitted — see `cms-columns.ts`'s own doc comment — but there is
 * no such column on this platform yet; the one real per-platform gap (variant-scope metafields) is
 * about a source Shopify itself doesn't put in this list, not a native field.
 */
export const SHOPIFY_NATIVE_COLUMNS: CmsColumnDef[] = [
  {
    ref: { kind: "meta", key: "field.tags" },
    label: "Tags",
    group: "taxonomy",
    scope: "product",
    valueType: "list",
    description: "Free-text labels the merchant applies in the Shopify admin.",
  },
  {
    ref: { kind: "meta", key: "field.compare_at_price" },
    label: "Compare-at Price",
    group: "pricing_inventory",
    scope: "product",
    valueType: "number",
    description: "The first variant's pre-discount price. A variant's own is separately bindable at variant scope.",
  },
  {
    ref: { kind: "meta", key: "field.handle" },
    label: "Handle",
    group: "identifiers",
    scope: "product",
    valueType: "text",
    description: "The URL slug — stable across a title rename.",
  },
  {
    ref: { kind: "meta", key: "field.status" },
    label: "Status",
    group: "identifiers",
    scope: "product",
    valueType: "text",
    description: "\"active\", \"draft\", or \"archived\" in the Shopify admin.",
  },
  {
    ref: { kind: "meta", key: "field.created_at" },
    label: "Created At",
    group: "identifiers",
    scope: "product",
    valueType: "date",
  },
  {
    ref: { kind: "meta", key: "field.published_at" },
    label: "Published At",
    group: "identifiers",
    scope: "product",
    valueType: "date",
    description: "Null for a product never published to the Online Store channel.",
  },
  {
    ref: { kind: "meta", key: "field.online_store_url" },
    label: "Online Store URL",
    group: "media_urls",
    scope: "product",
    valueType: "url",
  },
  {
    ref: { kind: "meta", key: "field.template_suffix" },
    label: "Theme Template",
    group: "advanced",
    scope: "product",
    valueType: "text",
    description: "The custom theme template assigned to this product, if any.",
  },
  {
    ref: { kind: "meta", key: "field.seo_title" },
    label: "SEO Title",
    group: "identifiers",
    scope: "product",
    valueType: "text",
  },
  {
    ref: { kind: "meta", key: "field.seo_description" },
    label: "SEO Description",
    group: "identifiers",
    scope: "product",
    valueType: "html",
  },
];
