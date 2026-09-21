import { ACS_TARGETS, NOT_SENT } from "@/lib/catalog/acs-targets";
import {
  columnKey,
  isRoleTarget,
  resolveBinding,
  type AcsFieldMapping,
  type CmsColumnRef,
} from "@/lib/catalog/acs-mapping";
import { CMS_COLUMN_GROUPS, cmsColumnGroupLabel } from "@/lib/catalog/cms-columns";
import type { CmsColumn } from "./types";
import type { SelectOption } from "./components/mapping-select";

/**
 * Setup Stage 1's rows: one per ACS field, each carrying whichever of the merchant's columns feeds it.
 *
 * The row is the ACS field and not the merchant's column, which is the whole shape of this screen.
 * ACS's schema is Google's and fixed, so "what arrives in `colorInfo.colors`" is a question with one
 * answer, where "where does my Colour option go" is a question the merchant has to be taught to ask.
 * The previous version was keyed the other way and had to invert on every render.
 */
export interface AcsFieldRow {
  /** ACS target key. The row's identity, and what `AcsFieldMapping.sources` is keyed by. */
  key: string;
  label: string;
  /** Where the value lands in the payload — `title`, `attributes.sku`, `colorInfo.colors`. */
  acsPath: string;
  section: AcsRowSection;
  /** True when ACS rejects a product that has no value here, so an unmapped row is a real problem
   *  rather than a choice. Only `title` and `categories` qualify; everything else is optional signal. */
  required: boolean;
  /** One line saying what the field is for, since an ACS path is not self-explanatory. */
  description: string;
  /** The column feeding this field right now. */
  ref: CmsColumnRef;
  /** False when this is auto-mapping's choice rather than the merchant's. */
  explicit: boolean;
  /**
   * True only for `categories`. That row has no CMS column behind it at all — `map-product.ts`
   * always writes it from `resolveCategoryPaths` (the Persona taxonomy paths resolved on the
   * Categories mapping page), never from `ref` — so offering a column dropdown for it would let a
   * merchant "map" something that is quietly ignored. The table renders this row with a fixed
   * "Persona Taxonomy" badge and a real resolved path as its sample instead of a `MappingSelect`.
   */
  personaSourced: boolean;
}

/**
 * Which of the three groups a row belongs to, derived rather than listed.
 *
 * `core` is anything with a default store field behind it and `native` anything ACS fills from an
 * option group by name. Per-product size-chart ingestion is intentionally not offered here: every
 * store now completes the sizing pipeline rather than bypassing Stages 2–5.
 */
export type AcsRowSection = "core" | "native";

const REQUIRED_ACS_KEYS = new Set(["title", "categories"]);

/** Copy for each row, keyed by ACS target. Absent falls back to the target's ACS path, which is
 *  honest but terse — a row worth showing is worth a sentence. */
const ROW_DESCRIPTIONS: Record<string, string> = {
  title: "The product name shoppers search against. ACS rejects a product without one.",
  description: "Long-form copy, used for semantic matching rather than shown as-is.",
  brand: "The label a product belongs to. Also what per-brand sizing exceptions key off.",
  price: "Current price and its currency, for price filters and budget-aware bundles.",
  availability: "Whether the product can be bought right now. Out-of-stock items stop being offered.",
  categories: "The Persona category paths from your Mapping page — not your store's own category names.",
  images: "Every image URL, first one first. Needed for anything visual to work.",
  uri: "The product page a shopper is sent to.",
  sku: "Your own identifier, kept for lookups and support rather than search.",
  productGroupId: "Groups colourways and sizes of the same product together.",
  colors: "Colour values, matched from your option group names.",
  sizes: "Size labels. The whole sizing pipeline reads these, so a wrong binding here is expensive.",
  materials: "Fabric and material values.",
  patterns: "Print and pattern values.",
  genders: "Audience, when your catalog states it per product.",
  ageGroups: "Adult, kids, infant — when your catalog states it per product.",
};

/**
 * Every ACS field a merchant can bind, with its current binding resolved.
 *
 * `optionGroups` is the discovered group names, needed because the native rows' *default* is a name
 * match against the merchant's own catalog rather than a fixed column — see `resolveBinding`.
 */
export function buildAcsRows(mapping: AcsFieldMapping, optionGroups: readonly string[]): AcsFieldRow[] {
  const rows: AcsFieldRow[] = [];

  for (const target of ACS_TARGETS) {
    // Internal fields are written by the pipeline (product id, merchant isolation), and `custom` is a
    // role destination rather than a field — an attribute a merchant wants by name is a Table 2 row.
    if (
      target.internal ||
      target.key === NOT_SENT ||
      target.key === "custom" ||
      target.key === "sizeChartData"
    ) {
      continue;
    }

    const section: AcsRowSection = isRoleTarget(target.key) ? "native" : "core";

    const { ref, explicit } = resolveBinding(mapping, target.key, optionGroups);

    rows.push({
      key: target.key,
      label: target.label,
      acsPath: target.acsPath,
      section,
      required: REQUIRED_ACS_KEYS.has(target.key),
      description: ROW_DESCRIPTIONS[target.key] ?? target.acsPath,
      ref,
      explicit,
      personaSourced: target.key === "categories",
    });
  }

  return rows;
}

/** True when this row is fed by nothing — either the merchant switched it off or auto-mapping had
 *  nothing to offer. */
export function isUnmapped(row: AcsFieldRow): boolean {
  return row.ref.kind === "unmapped";
}

/**
 * The merchant's columns as dropdown options, plus the explicit "don't send this" choice.
 *
 * Sorted into the demo-style groups `MappingSelect` renders headers for (`cms-columns.ts`'s own
 * order — core fields before taxonomy before the two variant-scoped groups before advanced), and
 * each option hints at its own sample, coverage, and scope — what makes an unfamiliar metafield or
 * a "Variant Price" row bindable with any confidence instead of a guess.
 */
export function toColumnOptions(columns: readonly CmsColumn[]): SelectOption[] {
  const grouped = CMS_COLUMN_GROUPS.flatMap((group) =>
    columns
      .filter((column) => column.group === group.id)
      .map((column) => ({
        key: column.key,
        label: column.scope === "variant" ? `${column.label} (variant)` : column.label,
        group: cmsColumnGroupLabel(group.id),
        hint: columnHint(column),
      }))
  );

  return [...grouped, { key: columnKey({ kind: "unmapped" }), label: "Not sent", group: "Nothing" }];
}

/** One line under a dropdown option: a real sample first, since that is what makes an unfamiliar
 *  column bindable with confidence at all; failing that, how much of the sample this column
 *  covered, or — for a column this app's discovery cannot actually see values for at all
 *  (`discoverable: false`, currently only a Shopify variant metafield definition) — why not. */
function columnHint(column: CmsColumn): string | undefined {
  if (column.discoverable === false) return "declared on your platform, but not readable by this app yet";
  if (column.sample) return column.sample;
  if (column.sampled === 0) return undefined;
  return column.presence === 0 ? "empty across the sample" : `${column.presence}/${column.sampled} sampled`;
}

/** How many rows have something feeding them, for the table's own header stat. Counts the rows a
 *  merchant can act on, so a store with no colour option is not shown as 15 of 17 broken. */
export function countMapped(rows: readonly AcsFieldRow[]): { mapped: number; total: number } {
  return { mapped: rows.filter((row) => !isUnmapped(row)).length, total: rows.length };
}

/**
 * True when auto-mapping would have picked this column anyway, so choosing it should clear the binding
 * rather than store a no-op — which is what keeps a later improvement to auto-mapping from being
 * locked out of every row a merchant happened to click through.
 *
 * Answered by re-resolving the row with its own explicit binding dropped, rather than by comparing
 * against `defaultColumnForTarget`: a native attribute row's default is a name match against this
 * store's option groups, so there is no static column to compare with.
 */
export function isDefaultChoice(
  mapping: AcsFieldMapping,
  acsKey: string,
  optionGroups: readonly string[],
  chosen: string
): boolean {
  const sources = Object.fromEntries(Object.entries(mapping.sources).filter(([key]) => key !== acsKey));
  return columnKey(resolveBinding({ ...mapping, sources }, acsKey, optionGroups).ref) === chosen;
}
