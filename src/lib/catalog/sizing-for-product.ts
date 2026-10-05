import type { RawCatalogProduct } from "./sync-types";
import type { AcsFieldMapping } from "@/lib/catalog/acs-mapping";
import { extractInStockSizeLabels, extractVariantAttributes } from "./acs/map-product";
import { toRawFormat } from "@/lib/sizing/aggregate";
import {
  resolveProductChart,
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

export function sizingForRawProduct(
  raw: RawCatalogProduct,
  connection: ProductSizingConnection,
  context: SizingResolutionContext,
): AcsSizingPayload | null {
  const personaConfig = buildPersonaMappingConfig(
    connection.personaTaxonomyScope,
    connection.personaCategoryMap,
    connection.categories,
  );
  const primary = resolvePersonaPaths(raw.sourceCategoryIds, personaConfig)[0] ?? null;
  const labels = extractInStockSizeLabels(raw, connection.acsFieldMapping);
  const routed = extractVariantAttributes(raw, connection.acsFieldMapping);
  const parentOverride = connection.skuParentOverrides[raw.externalId];
  const resolution = resolveProductChart({
    brandKey: normalizeBrandKey(routed.brands[0] ?? raw.brand),
    sizingCategory: isSizingGroup(parentOverride) ? parentOverride : primary?.sizingGroup ?? "",
    primaryPersonaLeafKey: primary?.key ?? null,
    rawSizeFormat: toRawFormat(labels),
    audienceHint: audienceHintFor({ genders: routed.genders, title: raw.title }),
  }, context);
  return resolution.status === "matched" ? buildAcsSizingPayload(resolution) : null;
}
