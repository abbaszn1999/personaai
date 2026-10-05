import {
  resolveProductChart,
  type ProductChartInput,
  type ProductChartStatus,
  type SizingResolutionContext,
  type UnsupportedSourceState,
} from "./product-chart";

export interface DemandedSizingProduct {
  productId: string;
  input: ProductChartInput;
}

export interface SizingPublicationIssue {
  productId: string;
  brandKey: string;
  leafKey: string | null;
  rawSizeFormat: string | null;
  status: Exclude<ProductChartStatus, "matched">;
  unmatchedLabels: string[];
  unsupportedSource?: UnsupportedSourceState;
}

export interface SizingPublicationGate {
  publishable: boolean;
  demandedProducts: number;
  demandedLeaves: string[];
  demandedLabels: string[];
  matchedProducts: number;
  issues: SizingPublicationIssue[];
}

/**
 * The release gate for actual catalog demand. Parent-level chart existence cannot pass this gate:
 * every product must resolve to one chart and every stocked label must resolve to one row.
 */
export function evaluateSizingPublicationGate(
  products: readonly DemandedSizingProduct[],
  context: SizingResolutionContext,
): SizingPublicationGate {
  const leaves = new Set<string>();
  const labels = new Set<string>();
  const issues: SizingPublicationIssue[] = [];
  let matchedProducts = 0;

  for (const product of products) {
    if (product.input.primaryPersonaLeafKey) leaves.add(product.input.primaryPersonaLeafKey);
    for (const label of product.input.rawSizeFormat?.split(/[,;|\n]+/) ?? []) {
      if (label.trim()) labels.add(label.trim());
    }

    const resolution = resolveProductChart(product.input, context);
    if (resolution.status === "matched") {
      matchedProducts += 1;
      continue;
    }
    issues.push({
      productId: product.productId,
      brandKey: resolution.canonicalBrandKey,
      leafKey: resolution.leafKey,
      rawSizeFormat: product.input.rawSizeFormat,
      status: resolution.status,
      unmatchedLabels: resolution.unmatchedLabels,
      unsupportedSource: resolution.unsupportedSource,
    });
  }

  return {
    publishable: issues.length === 0,
    demandedProducts: products.length,
    demandedLeaves: [...leaves].sort(),
    demandedLabels: [...labels].sort(),
    matchedProducts,
    issues,
  };
}
