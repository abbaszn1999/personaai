import {
  analyzeFit,
  bodyMeasurements,
  isChildShopper,
  parseShopperMeasurements,
  sizingGroupOfRows,
  summarizeLookFit,
} from "@/lib/agents/shared/fit";
import { getCatalogProductsByExternalIds } from "@/lib/catalog/acs/catalog-reads";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import type { ItemFitAnalysis, LookFitAnalysis } from "@/modules/commerce/types";

const MAX_ITEMS = 11;

interface RequestedItem {
  productId: string;
  size: string;
}

export interface FitAnalysisRequest {
  productIds?: unknown;
  recommendedSizes?: unknown;
  measurements?: unknown;
  audience?: unknown;
}

function requestedItems(body: FitAnalysisRequest): RequestedItem[] | null {
  if (!Array.isArray(body.productIds) || !body.productIds.every((id) => typeof id === "string" && id.trim())) {
    return null;
  }
  if (!body.recommendedSizes || typeof body.recommendedSizes !== "object" || Array.isArray(body.recommendedSizes)) {
    return null;
  }
  const sizes = body.recommendedSizes as Record<string, unknown>;
  const ids = [...new Set(body.productIds as string[])].slice(0, MAX_ITEMS);
  const items = ids.flatMap((productId) => {
    const size = sizes[productId];
    return typeof size === "string" && size.trim() ? [{ productId, size: size.trim() }] : [];
  });
  return items.length ? items : null;
}

/** Computes one look's analysis exclusively from indexed chart rows and shopper measurements. */
export async function buildLookFitAnalysis(
  ownerId: string,
  request: FitAnalysisRequest
): Promise<LookFitAnalysis | null> {
  const items = requestedItems(request);
  const measurements = parseShopperMeasurements(request.measurements);
  if (!items || !measurements) return null;

  const connection = await getStoreConnectionByOwner(ownerId);
  if (!connection) return null;

  // ACS products are indexed into this synthetic category once the merchant has mapped at least
  // one Persona department. This is the same scoped direct-read contract buildAgentContext uses.
  const candidates = await getCatalogProductsByExternalIds(
    connection.id,
    items.map((item) => item.productId),
    ["persona"]
  );
  const byId = new Map(candidates.map((candidate) => [candidate.externalId, candidate]));
  const body = bodyMeasurements(measurements);
  const child = isChildShopper(typeof request.audience === "string" ? request.audience : null);

  const analyses: ItemFitAnalysis[] = items.map(({ productId, size }) => {
    const candidate = byId.get(productId);
    const rows = candidate?.attributes?.fit_rows ?? [];
    const group = candidate ? sizingGroupOfRows(rows, child, candidate.attributes?.fit_group?.[0]) : null;
    if (!candidate || !group) {
      return {
        productId,
        productName: candidate?.title ?? "Item",
        size,
        group: null,
        score: null,
        label: "Size chart unavailable",
        metrics: [],
        reason: "no_chart",
      };
    }
    return {
      productId,
      productName: candidate.title,
      ...analyzeFit(rows, group, size, body, child),
    };
  });

  return summarizeLookFit(analyses);
}
