import { NOT_SENT, type AcsFieldKind } from "./acs-targets";

/**
 * The merchant's own fields, as the columns Stage 1 offers for each ACS field.
 *
 * One vocabulary shared by the mapper and the table. They each extract values their own way — the
 * mapper against a typed `RawCatalogProduct`, the table against the untyped wire shape of a preview
 * sample — but which fields exist, what they are called, what kind of value they hold and where
 * they go by default is decided here once. Two copies of that is exactly the drift
 * `option-groups.ts` was extracted to stop: a table that says `Brand → —` while the indexer writes
 * a brand leaves the merchant with no way to tell which half is lying.
 */
export interface SourceFieldDef {
  /** Stable id. Keys the merchant's `fieldTargets` override, so it must outlive any label change. */
  key: string;
  label: string;
  /** The store-side path shown under the label. */
  storePath: string;
  kind: AcsFieldKind;
  /** Where auto-mapping puts it. The merchant's override, where they set one, replaces this. */
  defaultTarget: string;
  /** Filled by the pipeline rather than read off the product, so its destination is fixed and it is
   *  never given a dropdown — there is no store field behind it to point anywhere else. */
  internal?: boolean;
}

/**
 * The fields every synced product has, in the order `rawCatalogProductToAcsProduct` handles them.
 *
 * Note what is absent. `variantOptions` groups are discovered per store and can be many, and
 * `customFields` keys are whatever the merchant's platform happens to hold — neither can be a fixed
 * list, so both reach Stage 1 through the discovery pass in the mapping-options route instead. This
 * list is only the columns that exist for every store on every platform.
 */
export const SOURCE_FIELDS: readonly SourceFieldDef[] = [
  { key: "title", label: "Title", storePath: "title", kind: "text", defaultTarget: "title" },
  {
    key: "description",
    label: "Description",
    storePath: "description",
    kind: "text",
    defaultTarget: "description",
  },
  { key: "brand", label: "Brand", storePath: "brand", kind: "text", defaultTarget: "brand" },
  { key: "price", label: "Price", storePath: "price, currency", kind: "number", defaultTarget: "price" },
  { key: "inStock", label: "Stock", storePath: "inStock", kind: "boolean", defaultTarget: "availability" },
  {
    key: "rawCategories",
    label: "Categories",
    storePath: "rawCategories",
    kind: "textList",
    defaultTarget: "categories",
    internal: true,
  },
  { key: "images", label: "Images", storePath: "images, imageUrl", kind: "urlList", defaultTarget: "images" },
  { key: "productUrl", label: "Product URL", storePath: "productUrl", kind: "url", defaultTarget: "uri" },
  {
    key: "productGroupId",
    label: "Variant group",
    storePath: "productGroupId",
    kind: "text",
    defaultTarget: "productGroupId",
  },
  // Internal: the ACS id is built from this plus the connection id, so it is the row's identity
  // rather than a value that could land somewhere else.
  {
    key: "externalId",
    label: "Product ID",
    storePath: "externalId",
    kind: "text",
    defaultTarget: "id",
    internal: true,
  },
  { key: "sku", label: "SKU", storePath: "sku", kind: "text", defaultTarget: "sku" },
];

const BY_KEY = new Map(SOURCE_FIELDS.map((field) => [field.key, field]));

export function sourceField(key: string): SourceFieldDef | undefined {
  return BY_KEY.get(key);
}

/** True when this field reaches nothing — the merchant switched it off. */
export function isNotSent(target: string): boolean {
  return target === NOT_SENT;
}
