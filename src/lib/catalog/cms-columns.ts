/**
 * The shared vocabulary for "every column of a merchant's catalog Stage 1 can bind to something" —
 * demo-style groups, product/variant scope, and the fixed set of per-variant native fields.
 *
 * Split out from `acs-mapping.ts` (which owns *where a binding points*, `CmsColumnRef`) and the
 * `mapping-options` route (which owns *what actually got discovered on this store*) because both of
 * those need one shared answer to "how do we group/label/badge a column for a merchant looking at
 * it", and a third copy of that is how a column ends up under a different heading in the dropdown
 * than in the custom-attribute modal.
 *
 * Deliberately free of Node built-ins and server imports, same constraint as `acs-mapping.ts` and
 * `option-groups.ts` — `mapping-select.tsx` and the Stage 1 table are client code.
 */

import type { CmsColumnRef } from "./acs-mapping";
import type { AcsFieldKind } from "./acs-targets";
import type { SourceFieldDef } from "./source-fields";

/**
 * The demo's own column groupings (`Documentation/store_src_demo_frontend`), adopted so a merchant
 * moving between the two never has to re-learn where something lives. `variant_options` and
 * `variant_custom` are new relative to the old three-bucket `field | option | meta` split — the
 * whole point of this module is telling those two apart from their product-scoped equivalents
 * instead of flattening everything from a `variantOptions`/variant `customFields` object into the
 * same "Custom fields" heading a product-level metafield sits under.
 */
export const CMS_COLUMN_GROUPS = [
  { id: "identifiers", label: "Product Identifiers & Core" },
  { id: "pricing_inventory", label: "Pricing & Inventory" },
  { id: "media_urls", label: "Media & URLs" },
  { id: "taxonomy", label: "Taxonomy" },
  { id: "variant_options", label: "Variant Options" },
  { id: "product_custom", label: "Product Custom Fields" },
  { id: "variant_custom", label: "Variant Custom Fields" },
  { id: "advanced", label: "Advanced" },
] as const;

export type CmsColumnGroup = (typeof CMS_COLUMN_GROUPS)[number]["id"];

const GROUP_LABEL = new Map(CMS_COLUMN_GROUPS.map((group) => [group.id, group.label]));
const GROUP_ORDER = new Map(CMS_COLUMN_GROUPS.map((group, index) => [group.id, index]));

export function cmsColumnGroupLabel(group: CmsColumnGroup): string {
  return GROUP_LABEL.get(group) ?? group;
}

export function cmsColumnGroupOrder(group: CmsColumnGroup): number {
  return GROUP_ORDER.get(group) ?? CMS_COLUMN_GROUPS.length;
}

/**
 * Whether a column describes the whole product or one purchasable SKU within it.
 *
 * Not the same axis as `CmsColumnGroup` — a variant's own price sits in `pricing_inventory` next to
 * the product's headline price, distinguished by this instead, so the UI can badge "Variant" on a
 * row without inventing a ninth group just to say so.
 */
export type CmsColumnScope = "product" | "variant";

export type CmsColumnValueType = "text" | "number" | "boolean" | "list" | "html" | "url" | "date";

/**
 * How a variant-scoped native field is folded onto the `PRIMARY` product it belongs to, when a
 * merchant binds an ACS *parent* field (Table 1) or a Table 2 custom attribute to it.
 *
 * Fixed per field rather than a control a merchant sets, which is the deliberate trade-off this
 * app makes against a fully configurable aggregation picker: every variant-scope column states its
 * own named aggregation up front (`aggregationNote` below is shown in the UI), so nothing is ever
 * silently reduced to "whatever the first variant happened to be" — the specific failure mode the
 * plan calls out — without requiring a second widget per row to choose one.
 */
export type CmsColumnAggregation = "list" | "min" | "max" | "any" | "sum";

export interface CmsColumnDef {
  ref: CmsColumnRef;
  /** What the merchant sees. A platform's own name for a native field, or the merchant's own
   *  metafield/meta key once its platform prefix is stripped — see `customFieldLabel`. */
  label: string;
  group: CmsColumnGroup;
  scope: CmsColumnScope;
  valueType: CmsColumnValueType;
  /** One line under the label, shown once the merchant needs more than a name to bind with
   *  confidence — what `field.compare_at_price` or `variant.inventory_quantity` actually is. */
  description?: string;
  /** Only present on a `scope: "variant"` column that a *product*-level field can also be bound
   *  to. Absent on a plain per-SKU field that only ever appears on a `VARIANT` record's own row
   *  (there is nothing to fold there). */
  aggregation?: CmsColumnAggregation;
  /**
   * False for a column this app's discovery cannot actually find evidence of on this platform —
   * declared so a merchant sees it named and understands *why* it never shows a sample, rather than
   * the column silently not existing. Shopify variant metafields are the current example: real,
   * bindable in principle, but not fetched by this app's sync today (see the doc comment on
   * `RawCatalogVariant.customFields`), so a store using them shows nothing here until that changes.
   * True for everything this module declares unless stated otherwise.
   */
  discoverable?: boolean;
}

/** One line the UI can show next to a variant-scope native field so its aggregation is never a
 *  silent choice — see `CmsColumnAggregation`'s own doc comment. */
export function aggregationNote(aggregation: CmsColumnAggregation): string {
  switch (aggregation) {
    case "list":
      return "every variant's distinct value, as a list";
    case "min":
      return "the lowest value across variants";
    case "max":
      return "the highest value across variants";
    case "any":
      return "true if any variant qualifies";
    case "sum":
      return "summed across variants";
  }
}

interface VariantFieldDef {
  /** `RawCatalogVariant`'s own key — also what `map-product.ts`'s `readColumn` switches on for a
   *  `{ kind: "variantField" }` ref, so this list and that switch statement must stay in step. */
  key: string;
  label: string;
  group: CmsColumnGroup;
  valueType: CmsColumnValueType;
  aggregation: CmsColumnAggregation;
  description: string;
}

/**
 * Every native per-variant field `RawCatalogVariant` carries, platform-neutral — declared once here
 * rather than per-platform, since both adapters populate the exact same shape (see
 * `sync-types.ts`). Offered as a Table 1/Table 2 source alongside the product-scope fields, always
 * present regardless of what the sampled catalog happens to show, which is what makes a variant's
 * own price bindable even for a merchant whose first 25 sampled products are all single-variant.
 */
const VARIANT_FIELD_DEFS: readonly VariantFieldDef[] = [
  {
    key: "sku",
    label: "Variant SKU",
    group: "identifiers",
    valueType: "text",
    aggregation: "list",
    description: "Each SKU's own identifier, distinct from the product's.",
  },
  {
    key: "barcode",
    label: "Variant Barcode / GTIN",
    group: "identifiers",
    valueType: "text",
    aggregation: "list",
    description: "UPC/EAN/ISBN, when the platform tracks one per SKU.",
  },
  {
    key: "title",
    label: "Variant Title",
    group: "identifiers",
    valueType: "text",
    aggregation: "list",
    description: "The platform's own per-SKU label — \"Berry / M\" — when it differs from the product's.",
  },
  {
    key: "price",
    label: "Variant Price",
    group: "pricing_inventory",
    valueType: "number",
    aggregation: "min",
    description: "Each SKU's own price.",
  },
  {
    key: "compareAtPrice",
    label: "Variant Compare-at Price",
    group: "pricing_inventory",
    valueType: "number",
    aggregation: "max",
    description: "Each SKU's own pre-discount price.",
  },
  {
    key: "inStock",
    label: "Variant Stock",
    group: "pricing_inventory",
    valueType: "boolean",
    aggregation: "any",
    description: "Whether each SKU can be bought right now.",
  },
  {
    key: "inventoryQuantity",
    label: "Variant Inventory Quantity",
    group: "pricing_inventory",
    valueType: "number",
    aggregation: "sum",
    description: "Units on hand per SKU.",
  },
  {
    key: "imageUrl",
    label: "Variant Image",
    group: "media_urls",
    valueType: "url",
    aggregation: "list",
    description: "Each SKU's own image, when it has one distinct from the product's.",
  },
  {
    key: "productUrl",
    label: "Variant URL",
    group: "media_urls",
    valueType: "url",
    aggregation: "list",
    description: "A deep link to this exact SKU, when the platform supports one.",
  },
  {
    key: "weight",
    label: "Variant Weight",
    group: "advanced",
    valueType: "number",
    aggregation: "list",
    description: "Each SKU's own shipping weight.",
  },
  {
    key: "weightUnit",
    label: "Variant Weight Unit",
    group: "advanced",
    valueType: "text",
    aggregation: "list",
    description: "The unit each SKU's weight is recorded in.",
  },
];

const VARIANT_FIELD_BY_KEY = new Map(VARIANT_FIELD_DEFS.map((field) => [field.key, field]));

export function variantFieldDef(key: string): VariantFieldDef | undefined {
  return VARIANT_FIELD_BY_KEY.get(key);
}

/** Which demo-style group a `SOURCE_FIELDS` entry belongs under — every store on every platform
 *  has these, so unlike a platform's own `field.*`/`meta.*` columns they need no registry of their
 *  own, just a group assignment for the dropdown to sort them into. */
const SOURCE_FIELD_GROUP: Record<string, CmsColumnGroup> = {
  title: "identifiers",
  description: "identifiers",
  brand: "identifiers",
  productGroupId: "identifiers",
  sku: "identifiers",
  price: "pricing_inventory",
  inStock: "pricing_inventory",
  images: "media_urls",
  productUrl: "media_urls",
};

export function sourceFieldGroup(key: string): CmsColumnGroup {
  return SOURCE_FIELD_GROUP[key] ?? "advanced";
}

const ACS_FIELD_KIND_TO_VALUE_TYPE: Record<AcsFieldKind, CmsColumnValueType> = {
  text: "text",
  textList: "list",
  number: "number",
  boolean: "boolean",
  url: "url",
  urlList: "list",
};

export function sourceFieldColumn(field: SourceFieldDef): CmsColumnDef {
  return {
    ref: { kind: "field", key: field.key },
    label: field.label,
    group: sourceFieldGroup(field.key),
    scope: "product",
    valueType: ACS_FIELD_KIND_TO_VALUE_TYPE[field.kind],
  };
}

/** Every native per-variant field as a `CmsColumnDef`, for merging into the discovered column list
 *  unconditionally — see this module's own doc comment on why these can't come from the sample. */
export function nativeVariantFieldColumns(): CmsColumnDef[] {
  return VARIANT_FIELD_DEFS.map((field) => ({
    ref: { kind: "variantField", key: field.key },
    label: field.label,
    group: field.group,
    scope: "variant",
    valueType: field.valueType,
    // The aggregation is folded into the description text itself rather than a separate UI field,
    // so a merchant reading the dropdown's hint sees "each SKU's own price... folded onto the
    // product as the lowest of them" as one sentence instead of a name (`min`) they'd have to look
    // up — see `aggregationNote`.
    description: `${field.description} (${aggregationNote(field.aggregation)})`,
    aggregation: field.aggregation,
  }));
}

/**
 * The group/scope/type for a column discovered live off the sample rather than declared in a
 * static registry — a merchant's own `variantOptions` group, a Shopify `metafield.*`/WooCommerce
 * `meta.*` product field, or a per-variant custom field. Never called for `field`/`variantField`:
 * those are always either a `SOURCE_FIELDS` entry (`sourceFieldColumn`) or a native platform
 * registry entry (`nativeVariantFieldColumns`), both of which already know their own group.
 */
export function classifyDiscoveredColumn(
  ref: Extract<CmsColumnRef, { kind: "option" | "meta" | "variantMeta" }>
): { group: CmsColumnGroup; scope: CmsColumnScope; valueType: CmsColumnValueType } {
  switch (ref.kind) {
    case "option":
      return { group: "variant_options", scope: "variant", valueType: "list" };
    case "variantMeta":
      return { group: "variant_custom", scope: "variant", valueType: "text" };
    case "meta":
      return { group: "product_custom", scope: "product", valueType: "text" };
  }
}
