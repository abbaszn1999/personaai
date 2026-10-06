import type { RawCatalogProduct } from "./sync-types";
import type { AcsFieldMapping } from "@/lib/catalog/acs-mapping";
import { extractInStockSizeLabels, extractVariantAttributes, resolveProductBrand } from "./acs/map-product";
import { toRawFormat } from "@/lib/sizing/aggregate";
import {
  resolveProductChart,
  type ProductChartInput,
  type ProductChartResolution,
  type SizingResolutionContext,
} from "@/lib/sizing/product-chart";
import { buildAcsSizingPayload, type AcsSizingPayload } from "@/lib/sizing/acs-payload";
import { buildPersonaMappingConfig, resolvePersonaPaths } from "./persona-mapping";
import type { StoreCategory } from "@/modules/store/types";
import type {
  PersonaCategoryMap,
  SerializedTaxonomyScope,
} from "@/modules/store/mapping/persona-taxonomy";
import type { SkuParentOverrides } from "@/modules/store/types";
import { audienceHintFor, normalizeBrandKey } from "@/lib/sizing/keys";
import { isSizingGroup } from "@/lib/sizing/measurements";

export interface ProductSizingConnection {
  categories: StoreCategory[];
  personaTaxonomyScope: SerializedTaxonomyScope;
  personaCategoryMap: PersonaCategoryMap;
  acsFieldMapping: AcsFieldMapping;
  skuParentOverrides: SkuParentOverrides;
}

/**
 * The one place a live store product becomes a chart-resolution input. Push, the Stage 5 preview
 * and the publish gate all read it, so what is previewed and confirmed is exactly what is published.
 */
export function productChartInputForRaw(
  raw: RawCatalogProduct,
  connection: ProductSizingConnection,
): ProductChartInput {
  const personaConfig = buildPersonaMappingConfig(
    connection.personaTaxonomyScope,
    connection.personaCategoryMap,
    connection.categories,
  );
  const primary = resolvePersonaPaths(raw.sourceCategoryIds, personaConfig)[0] ?? null;
  const routed = extractVariantAttributes(raw, connection.acsFieldMapping);
  const purchasable = extractInStockSizeLabels(raw, connection.acsFieldMapping);
  const parentOverride = connection.skuParentOverrides[raw.externalId];
  return {
    brandKey: normalizeBrandKey(resolveProductBrand(raw, connection.acsFieldMapping)),
    sizingCategory: isSizingGroup(parentOverride) ? parentOverride : primary?.sizingGroup ?? "",
    primaryPersonaLeafKey: primary?.key ?? null,
    rawSizeFormat: toRawFormat(routed.sizes),
    purchasableSizeFormat: toRawFormat(purchasable),
    audienceHint: audienceHintFor({ genders: routed.genders, title: raw.title }),
  };
}

export interface RawProductSizing {
  input: ProductChartInput;
  resolution: ProductChartResolution;
  sizing: AcsSizingPayload | null;
}

export function resolveRawProductSizing(
  raw: RawCatalogProduct,
  connection: ProductSizingConnection,
  context: SizingResolutionContext,
): RawProductSizing {
  const input = productChartInputForRaw(raw, connection);
  const resolution = resolveProductChart(input, context);
  return {
    input,
    resolution,
    sizing: resolution.status === "matched" ? buildAcsSizingPayload(resolution) : null,
  };
}

export function sizingForRawProduct(
  raw: RawCatalogProduct,
  connection: ProductSizingConnection,
  context: SizingResolutionContext,
): AcsSizingPayload | null {
  return resolveRawProductSizing(raw, connection, context).sizing;
}
