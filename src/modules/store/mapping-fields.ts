import {
  customAttributeKeyFor,
  normalizeOptionGroupName,
  resolveOptionRole,
  type VariantRole,
} from "@/lib/catalog/option-groups";
import type { MappingPreviewSample } from "./types";

/**
 * The merchant-facing field-mapping table config: one row per field `rawCatalogProductToAcsProduct`
 * (`src/lib/catalog/acs/map-product.ts`) actually touches, in the order that function reads/writes
 * them. Kept as data rather than JSX so `buildFieldRows` — and therefore the whole mapping — stays
 * unit-testable without a DOM.
 *
 * Option-group routing goes through the shared `resolveOptionRole`, the same function the indexer
 * calls, so this table shows a merchant's override rather than the built-in default. It used to
 * carry its own copies of the option-name sets, which was fine only while nothing was overridable:
 * a merchant reassigning "Talla" to `size` would have seen `Size → —` here while the indexer wrote
 * their sizes correctly.
 *
 * `raw`/`mapped` come across the wire as `Record<string, unknown>` (see `MappingPreviewSample`),
 * not the real `RawCatalogProduct`/`AcsProduct` types — this is a read-only display shape, so every
 * extractor treats its input as untrusted and returns `undefined` rather than throwing on a
 * missing/malformed field.
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
  /** True for a store field that reaches nothing. Populated when a merchant sets an option group
   *  to `ignore`, so their choice is visible as a row rather than the group vanishing. */
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

function attributeText(mapped: Record<string, unknown>, key: string): string[] | undefined {
  const attribute = record(record(mapped.attributes)[key]);
  return strList(attribute.text);
}

/** One option group's contribution: the labels it holds and the store's name for it, so a row can
 *  say `variantOptions["Talla"]` rather than naming the ACS field the merchant pointed it at. */
interface GroupContribution {
  name: string;
  labels: string[];
}

/** Every `variantOptions` group bucketed by where the merchant's mapping actually sends it. */
interface GroupedOptions {
  byRole: Map<VariantRole, GroupContribution[]>;
  /** Groups with no predefined ACS field, headed for the `opt_<name>` catch-all. */
  custom: GroupContribution[];
}

function groupOptions(raw: Record<string, unknown>, optionRoles: Record<string, VariantRole>): GroupedOptions {
  const byRole = new Map<VariantRole, GroupContribution[]>();
  const custom: GroupContribution[] = [];

  for (const [optionName, entries] of Object.entries(record(raw.variantOptions))) {
    if (!Array.isArray(entries)) continue;
    const labels = entries
      .map((entry) => record(entry).label)
      .filter((label): label is string => typeof label === "string");
    if (labels.length === 0) continue;

    const role = resolveOptionRole(normalizeOptionGroupName(optionName), optionRoles);
    if (role === "custom") {
      custom.push({ name: optionName, labels });
      continue;
    }
    byRole.set(role, [...(byRole.get(role) ?? []), { name: optionName, labels }]);
  }

  return { byRole, custom };
}

function contributionsFor(grouped: GroupedOptions, role: VariantRole): GroupContribution[] {
  return grouped.byRole.get(role) ?? [];
}

function valuesFor(grouped: GroupedOptions, role: VariantRole): string[] | undefined {
  const labels = contributionsFor(grouped, role).flatMap((group) => group.labels);
  return labels.length > 0 ? labels : undefined;
}

/** `variantOptions["Colour"]`, or a list when more than one group feeds the same role. Falls back
 *  to a role-shaped placeholder so a row with no matching group still explains what would fill it. */
function pathFor(grouped: GroupedOptions, role: VariantRole, fallback: string): string {
  const names = contributionsFor(grouped, role).map((group) => `variantOptions["${group.name}"]`);
  return names.length > 0 ? names.join(", ") : fallback;
}

interface FieldDefinition {
  label: string;
  storePath: string | null;
  storeValue: (raw: Record<string, unknown>, grouped: GroupedOptions) => string | string[] | undefined;
  acsPath: string;
  acsValue: (mapped: Record<string, unknown>) => string | string[] | undefined;
  internal?: boolean;
  /** Set for rows fed by a `variantOptions` group, so `storePath` names the merchant's own group
   *  instead of a guess at what it might be called. */
  role?: VariantRole;
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
    // An option group explicitly reassigned to `brand` wins over the platform's own brand field,
    // matching the mapper's precedence.
    storeValue: (raw, grouped) => valuesFor(grouped, "brand") ?? str(raw.brand),
    acsPath: "brands[0]",
    acsValue: (mapped) => strList(mapped.brands)?.[0],
    role: "brand",
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
    storePath: null,
    storeValue: (_raw, grouped) => valuesFor(grouped, "color"),
    acsPath: "colorInfo.colors",
    acsValue: (mapped) => strList(record(mapped.colorInfo).colors),
    role: "color",
  },
  {
    label: "Size",
    storePath: null,
    storeValue: (_raw, grouped) => valuesFor(grouped, "size"),
    acsPath: "sizes",
    acsValue: (mapped) => strList(mapped.sizes),
    role: "size",
  },
  {
    label: "Material",
    storePath: null,
    storeValue: (_raw, grouped) => valuesFor(grouped, "material"),
    acsPath: "materials",
    acsValue: (mapped) => strList(mapped.materials),
    role: "material",
  },
  {
    label: "Pattern",
    storePath: null,
    storeValue: (_raw, grouped) => valuesFor(grouped, "pattern"),
    acsPath: "patterns",
    acsValue: (mapped) => strList(mapped.patterns),
    role: "pattern",
  },
  {
    label: "Gender",
    storePath: null,
    storeValue: (_raw, grouped) => valuesFor(grouped, "gender"),
    acsPath: "genders",
    acsValue: (mapped) => strList(mapped.genders),
    role: "gender",
  },
  {
    label: "Age group",
    storePath: null,
    storeValue: (_raw, grouped) => valuesFor(grouped, "age_group"),
    acsPath: "ageGroups",
    acsValue: (mapped) => strList(mapped.ageGroups),
    role: "age_group",
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

/** Default `storePath` text for a role-fed row with no contributing group, so the cell explains
 *  what the row is waiting for rather than showing a bare dash. */
const ROLE_PLACEHOLDER: Record<VariantRole, string> = {
  color: 'variantOptions["Color"]',
  size: 'variantOptions["Size"]',
  material: 'variantOptions["Material"]',
  pattern: 'variantOptions["Pattern"]',
  gender: 'variantOptions["Gender"]',
  age_group: 'variantOptions["Age group"]',
  brand: "brand",
  ignore: "—",
};

/** One row per group the merchant set to `ignore`, so the choice is visible rather than the group
 *  silently disappearing from the table. */
function ignoredRows(grouped: GroupedOptions): MappingFieldRow[] {
  return contributionsFor(grouped, "ignore").map((group) => ({
    label: group.name,
    storePath: `variantOptions["${group.name}"]`,
    storeValue: display(group.labels),
    acsPath: "—",
    acsValue: "Not sent to search",
    internal: false,
    notSent: true,
  }));
}

/** One row per group with no predefined ACS field — the `opt_<name>` catch-all. Emitted only for
 *  groups actually present on this sample, unlike the static rows above: there is no fixed universe
 *  of these to always show a "—" row for. */
function customOptionRows(grouped: GroupedOptions, mapped: Record<string, unknown>): MappingFieldRow[] {
  const rows: MappingFieldRow[] = [];

  for (const group of grouped.custom) {
    const acsKey = customAttributeKeyFor(group.name);
    if (!acsKey) continue;

    rows.push({
      label: group.name,
      storePath: `variantOptions["${group.name}"]`,
      storeValue: display(group.labels),
      acsPath: `attributes.${acsKey}`,
      acsValue: display(attributeText(mapped, acsKey)),
      internal: false,
      notSent: false,
    });
  }

  return rows;
}

/**
 * Builds one field-mapping table's worth of rows for a single sample product — the table the
 * merchant reviews before approving indexing. Every static row always renders, even when a field is
 * empty for this particular sample ("—" rather than a skipped row), so switching between the
 * sampled products never changes which rows are present.
 *
 * `optionRoles` is the merchant's saved override set; passing `{}` reproduces the mapper's built-in
 * name matching.
 */
export function buildFieldRows(
  sample: MappingPreviewSample,
  optionRoles: Record<string, VariantRole> = {}
): MappingFieldRow[] {
  const raw = record(sample.raw);
  const mapped = record(sample.mapped);
  const grouped = groupOptions(raw, optionRoles);

  const staticRows: MappingFieldRow[] = FIELD_DEFINITIONS.map((def) => ({
    label: def.label,
    storePath: def.role ? pathFor(grouped, def.role, ROLE_PLACEHOLDER[def.role]) : def.storePath,
    storeValue: display(def.storeValue(raw, grouped)),
    acsPath: def.acsPath,
    acsValue: display(def.acsValue(mapped)),
    internal: def.internal ?? false,
    notSent: false,
  }));

  return [...staticRows, ...customOptionRows(grouped, mapped), ...ignoredRows(grouped)];
}
