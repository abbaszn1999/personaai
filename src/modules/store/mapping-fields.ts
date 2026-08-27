import type { MappingPreviewSample } from "./types";

/**
 * The merchant-facing field-mapping table config: one row per field `rawCatalogProductToAcsProduct`
 * (`src/lib/catalog/acs/map-product.ts`) actually touches, in the order that function reads/writes
 * them. Kept as data rather than JSX so `buildFieldRows` — and therefore the whole mapping — stays
 * unit-testable without a DOM.
 *
 * `raw`/`mapped` come across the wire as `Record<string, unknown>` (see `MappingPreviewSample`),
 * not the real `RawCatalogProduct`/`AcsProduct` types — this is a read-only display shape for a
 * modal, not something this module constructs or validates, so every extractor treats its input
 * as untrusted and returns `undefined` rather than throwing on a missing/malformed field.
 */

export interface MappingFieldRow {
  label: string;
  /** The store's own field name/path, or `null` for a value with no single store field (derived,
   *  or assigned entirely internally) — see `storeValue` in that case for the explanation shown
   *  in place of a path. */
  storePath: string | null;
  storeValue: string;
  acsPath: string;
  acsValue: string;
  /** True for attributes that exist purely for ACS's own search isolation/scoping — never a
   *  customer-facing store field — so the UI can flag them rather than implying the merchant's
   *  store has a "merchant_id" column. */
  internal: boolean;
  /** True for a store field the mapper reads but never sends anywhere — shown so the merchant
   *  sees the whole real picture, gaps included, not just what looks good. Nothing hits this today
   *  (`sku` used to, before it became a real custom attribute), but the mechanism stays for the
   *  next field that turns out to be a genuine gap. */
  notSent: boolean;
}

const DASH = "—";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

function strList(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.map((v) => String(v));
}

function display(value: string | string[] | undefined): string {
  if (value === undefined) return DASH;
  return Array.isArray(value) ? value.join(", ") : value;
}

/** Pulls every option-group value (case-insensitively) matching any of `names` out of
 *  `variantOptions`, the same rule `extractColorAndSize` in `map-product.ts` uses. */
function variantOptionValues(raw: Record<string, unknown>, names: Set<string>): string[] | undefined {
  const groups = record(raw.variantOptions);
  const values: string[] = [];
  for (const [optionName, entries] of Object.entries(groups)) {
    if (!names.has(optionName.trim().toLowerCase()) || !Array.isArray(entries)) continue;
    for (const entry of entries) {
      const label = record(entry).label;
      if (typeof label === "string") values.push(label);
    }
  }
  return values.length > 0 ? values : undefined;
}

const COLOR_OPTION_NAMES = new Set(["color", "colour"]);
const SIZE_OPTION_NAMES = new Set(["size"]);
const MATERIAL_OPTION_NAMES = new Set(["material", "materials", "fabric"]);
const PATTERN_OPTION_NAMES = new Set(["pattern", "patterns", "print"]);
const GENDER_OPTION_NAMES = new Set(["gender", "genders", "sex"]);
const AGE_GROUP_OPTION_NAMES = new Set(["age group", "agegroup", "age_group", "age"]);

/** Every option name `map-product.ts` routes into a predefined ACS field rather than the
 *  `opt_<name>` catch-all — kept in sync with that module's own name sets so a "Material" option
 *  group shows up under the dedicated Material row here, not duplicated as a leftover row too. */
const KNOWN_OPTION_NAMES = new Set([
  ...COLOR_OPTION_NAMES,
  ...SIZE_OPTION_NAMES,
  ...MATERIAL_OPTION_NAMES,
  ...PATTERN_OPTION_NAMES,
  ...GENDER_OPTION_NAMES,
  ...AGE_GROUP_OPTION_NAMES,
]);

/** Mirrors `sanitizeAttributeKeySegment` in `map-product.ts` — duplicated rather than imported
 *  since that module pulls in server-only isolation/id-building helpers this purely-display
 *  module (rendered client-side in the mapping preview modal) has no business depending on. */
function sanitizeAttributeKeySegment(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function attributeText(mapped: Record<string, unknown>, key: string): string[] | undefined {
  const attribute = record(record(mapped.attributes)[key]);
  return strList(attribute.text);
}

/** One row per `variantOptions` group the mapper had no dedicated field for (fit, style, ...) —
 *  the same `opt_<name>` catch-all `map-product.ts` sends to a generic custom attribute. Rows are
 *  only emitted for groups actually present on this sample, unlike the static rows above: unlike
 *  Color/Size/Material/etc., there is no fixed universe of these to always show a "—" row for. */
function otherVariantOptionRows(raw: Record<string, unknown>, mapped: Record<string, unknown>): MappingFieldRow[] {
  const groups = record(raw.variantOptions);
  const rows: MappingFieldRow[] = [];

  for (const [optionName, entries] of Object.entries(groups)) {
    const normalized = optionName.trim().toLowerCase();
    if (KNOWN_OPTION_NAMES.has(normalized) || !Array.isArray(entries)) continue;

    const values = entries
      .map((entry) => record(entry).label)
      .filter((label): label is string => typeof label === "string");
    if (values.length === 0) continue;

    const key = sanitizeAttributeKeySegment(optionName);
    if (!key) continue;
    const acsKey = `opt_${key}`;

    rows.push({
      label: optionName,
      storePath: `variantOptions["${optionName}"]`,
      storeValue: display(values),
      acsPath: `attributes.${acsKey}`,
      acsValue: display(attributeText(mapped, acsKey)),
      internal: false,
      notSent: false,
    });
  }

  return rows;
}

interface FieldDefinition {
  label: string;
  storePath: string | null;
  storeValue: (raw: Record<string, unknown>) => string | string[] | undefined;
  acsPath: string;
  acsValue: (mapped: Record<string, unknown>) => string | string[] | undefined;
  internal?: boolean;
  notSent?: boolean;
}

const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    label: "Title",
    storePath: "title",
    storeValue: (raw) => str(raw.title),
    acsPath: "title",
    acsValue: (mapped) => str(mapped.title),
  },
  {
    label: "Description",
    storePath: "description",
    storeValue: (raw) => str(raw.description),
    acsPath: "description",
    acsValue: (mapped) => str(mapped.description),
  },
  {
    label: "Brand",
    storePath: "brand",
    storeValue: (raw) => str(raw.brand),
    acsPath: "brands[0]",
    acsValue: (mapped) => strList(mapped.brands)?.[0],
  },
  {
    label: "Price",
    storePath: "price, currency",
    storeValue: (raw) => {
      const price = str(raw.price);
      const currency = str(raw.currency);
      return price ? `${price}${currency ? ` ${currency}` : ""}` : undefined;
    },
    acsPath: "priceInfo.price, priceInfo.currencyCode",
    acsValue: (mapped) => {
      const priceInfo = record(mapped.priceInfo);
      const price = str(priceInfo.price);
      const currencyCode = str(priceInfo.currencyCode);
      return price ? `${price}${currencyCode ? ` ${currencyCode}` : ""}` : undefined;
    },
  },
  {
    label: "Stock",
    storePath: "inStock",
    storeValue: (raw) => (typeof raw.inStock === "boolean" ? String(raw.inStock) : undefined),
    acsPath: "availability",
    acsValue: (mapped) => str(mapped.availability),
  },
  {
    label: "Categories",
    storePath: "rawCategories",
    storeValue: (raw) => strList(raw.rawCategories),
    acsPath: "categories",
    acsValue: (mapped) => strList(mapped.categories),
  },
  {
    label: "Category membership",
    storePath: "sourceCategoryIds",
    storeValue: (raw) => strList(raw.sourceCategoryIds),
    acsPath: "attributes.source_category_ids",
    acsValue: (mapped) => attributeText(mapped, "source_category_ids"),
    internal: true,
  },
  {
    label: "Images",
    storePath: "images, imageUrl",
    storeValue: (raw) => strList(raw.images) ?? str(raw.imageUrl),
    acsPath: "images[].uri",
    acsValue: (mapped) => {
      const images = mapped.images;
      if (!Array.isArray(images) || images.length === 0) return undefined;
      return images.map((image) => str(record(image).uri) ?? DASH);
    },
  },
  {
    label: "Product URL",
    storePath: "productUrl",
    storeValue: (raw) => str(raw.productUrl),
    acsPath: "uri",
    acsValue: (mapped) => str(mapped.uri),
  },
  {
    label: "Color",
    storePath: 'variantOptions["Color"/"Colour"]',
    storeValue: (raw) => variantOptionValues(raw, COLOR_OPTION_NAMES),
    acsPath: "colorInfo.colors",
    acsValue: (mapped) => strList(record(mapped.colorInfo).colors),
  },
  {
    label: "Size",
    storePath: 'variantOptions["Size"]',
    storeValue: (raw) => variantOptionValues(raw, SIZE_OPTION_NAMES),
    acsPath: "sizes",
    acsValue: (mapped) => strList(mapped.sizes),
  },
  {
    label: "Material",
    storePath: 'variantOptions["Material"/"Fabric"]',
    storeValue: (raw) => variantOptionValues(raw, MATERIAL_OPTION_NAMES),
    acsPath: "materials",
    acsValue: (mapped) => strList(mapped.materials),
  },
  {
    label: "Pattern",
    storePath: 'variantOptions["Pattern"/"Print"]',
    storeValue: (raw) => variantOptionValues(raw, PATTERN_OPTION_NAMES),
    acsPath: "patterns",
    acsValue: (mapped) => strList(mapped.patterns),
  },
  {
    label: "Gender",
    storePath: 'variantOptions["Gender"]',
    storeValue: (raw) => variantOptionValues(raw, GENDER_OPTION_NAMES),
    acsPath: "genders",
    acsValue: (mapped) => strList(mapped.genders),
  },
  {
    label: "Age group",
    storePath: 'variantOptions["Age group"]',
    storeValue: (raw) => variantOptionValues(raw, AGE_GROUP_OPTION_NAMES),
    acsPath: "ageGroups",
    acsValue: (mapped) => strList(mapped.ageGroups),
  },
  {
    label: "Variant group",
    storePath: "productGroupId",
    storeValue: (raw) => str(raw.productGroupId),
    acsPath: "attributes.product_group_id",
    acsValue: (mapped) => attributeText(mapped, "product_group_id"),
  },
  {
    label: "Garment type",
    storePath: null,
    storeValue: () => "Derived from title, not a store field",
    acsPath: "attributes.garment_category, attributes.garment_subcategory",
    acsValue: (mapped) => {
      const category = attributeText(mapped, "garment_category")?.[0];
      const subcategory = attributeText(mapped, "garment_subcategory")?.[0];
      return [category, subcategory].filter((v): v is string => Boolean(v));
    },
    internal: true,
  },
  {
    label: "Product ID",
    storePath: "externalId",
    storeValue: (raw) => str(raw.externalId),
    acsPath: "id",
    acsValue: (mapped) => str(mapped.id),
  },
  {
    label: "Merchant",
    storePath: null,
    storeValue: () => "This store connection, not a store field",
    acsPath: "attributes.merchant_id",
    acsValue: (mapped) => attributeText(mapped, "merchant_id"),
    internal: true,
  },
  {
    label: "SKU",
    storePath: "sku",
    storeValue: (raw) => str(raw.sku),
    acsPath: "attributes.sku",
    acsValue: (mapped) => attributeText(mapped, "sku"),
  },
];

/** Builds one field-mapping table's worth of rows for a single sample product — the table the
 *  merchant reviews before approving indexing. Every row always renders, even when a field is
 *  empty for this particular sample ("—" rather than a skipped row), so switching between the 5
 *  sampled products never changes which rows are present. */
export function buildFieldRows(sample: MappingPreviewSample): MappingFieldRow[] {
  const raw = record(sample.raw);
  const mapped = record(sample.mapped);

  const staticRows = FIELD_DEFINITIONS.map((def) => ({
    label: def.label,
    storePath: def.storePath,
    storeValue: display(def.storeValue(raw)),
    acsPath: def.acsPath,
    acsValue: def.notSent ? "Not sent to search" : display(def.acsValue(mapped)),
    internal: def.internal ?? false,
    notSent: def.notSent ?? false,
  }));

  return [...staticRows, ...otherVariantOptionRows(raw, mapped)];
}
