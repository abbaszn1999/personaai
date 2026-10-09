import type { AcsAvailability, AcsProduct, AcsProductType } from "./types";
import { normalizeBrandKey } from "@/lib/sizing/keys";
import type { BrandType } from "@/lib/db/sizing-coverage";

/**
 * The Stage 5 row shape and the pure conversions around it. Kept free of the ACS client and the
 * database so the ACS write path can build mirror rows without importing either.
 */

export interface AcsStageFiveRow {
  id: string;
  type: AcsProductType;
  primaryProductId: string | null;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  availability: AcsAvailability | "UNKNOWN";
  brand: string | null;
  brandType: BrandType;
  categories: string[];
  sizes: string[];
  fitLeaf: string | null;
  fitGroup: string | null;
  fitAudience: string | null;
  fitChartVariant: string | null;
  fitSizeLabels: string[];
  fitRows: string[];
}

export interface AcsStageFiveListing {
  rows: AcsStageFiveRow[];
  total: number;
  counts: {
    primary: number;
    variant: number;
    inStock: number;
    outOfStock: number;
    otherAvailability: number;
  };
}

/** One Stage 5 row plus what its filters need, kept instead of the full ACS document. */
export interface StageFiveRecord {
  row: Omit<AcsStageFiveRow, "brandType">;
  brandKey: string;
  haystack: string;
}

export interface StageFiveFilters {
  query?: string;
  type?: "PRIMARY" | "VARIANT";
  availability?: "IN_STOCK" | "OUT_OF_STOCK";
  brandKeys?: readonly string[] | null;
}

function textAttribute(product: AcsProduct, key: string): string[] {
  return product.attributes?.[key]?.text?.filter((value) => value.trim().length > 0) ?? [];
}

export function belongsToConnection(product: AcsProduct, connectionId: string): boolean {
  return product.id.startsWith(`${connectionId}_`) ||
    textAttribute(product, "merchant_id").includes(connectionId);
}

export function brandTypeOf(brand: string | null, brandTypes?: ReadonlyMap<string, BrandType>): BrandType {
  const trimmed = brand?.trim();
  if (!trimmed) return "none";
  return brandTypes?.get(normalizeBrandKey(trimmed)) ?? "unclassified";
}

export function toAcsStageFiveRow(
  product: AcsProduct,
  brandTypes?: ReadonlyMap<string, BrandType>,
): AcsStageFiveRow {
  return withBrandType(toStageFiveRecord(product), brandTypes);
}

export function toStageFiveRecord(product: AcsProduct): StageFiveRecord {
  const row: StageFiveRecord["row"] = {
    id: product.id,
    type: product.type ?? "PRIMARY",
    primaryProductId: product.primaryProductId ?? null,
    title: product.title,
    sku: textAttribute(product, "sku")[0] ?? null,
    imageUrl: product.images?.[0]?.uri ?? null,
    price: product.priceInfo?.price ?? null,
    currency: product.priceInfo?.currencyCode ?? null,
    availability: product.availability ?? "UNKNOWN",
    brand: product.brands?.[0] ?? null,
    categories: product.categories ?? [],
    sizes: product.sizes ?? [],
    fitLeaf: textAttribute(product, "fit_leaf")[0] ?? null,
    fitGroup: textAttribute(product, "fit_group")[0] ?? null,
    fitAudience: textAttribute(product, "fit_audience")[0] ?? null,
    fitChartVariant: textAttribute(product, "fit_chart_variant")[0] ?? null,
    fitSizeLabels: textAttribute(product, "fit_size_labels"),
    fitRows: textAttribute(product, "fit_rows"),
  };
  const haystack = [
    product.id,
    product.primaryProductId,
    product.title,
    product.brands?.join(" "),
    product.categories?.join(" "),
    product.sizes?.join(" "),
    row.sku,
    row.fitLeaf,
    row.fitChartVariant,
  ].filter(Boolean).join(" ").toLowerCase();
  return { row, brandKey: normalizeBrandKey(row.brand), haystack };
}

/** Brand type is joined at read time, so a Global/Private override shows without a rebuild. */
export function withBrandType(record: StageFiveRecord, brandTypes?: ReadonlyMap<string, BrandType>): AcsStageFiveRow {
  return { ...record.row, brandType: brandTypeOf(record.row.brand, brandTypes) };
}

export function filterStageFiveRecords(
  records: readonly StageFiveRecord[],
  filters: StageFiveFilters,
): StageFiveRecord[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  const brandKeys = filters.brandKeys ? new Set(filters.brandKeys) : null;
  return records.filter((record) => {
    if (filters.type && record.row.type !== filters.type) return false;
    if (filters.availability && record.row.availability !== filters.availability) return false;
    if (brandKeys && !brandKeys.has(record.brandKey)) return false;
    return !query || record.haystack.includes(query);
  });
}
