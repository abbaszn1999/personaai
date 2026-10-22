import { listPrivateChartsForBrands, listSharedChartsForBrands } from "@/lib/db/sizing-charts";
import type { BrandType, SizingCoverageRow } from "@/lib/db/sizing-coverage";
import type { SizingPathCoverageRow } from "@/lib/db/sizing-path-coverage";
import { getSizingProductFacets } from "@/lib/db/sizing-product-records";
import type { SizingRunRow } from "@/lib/db/sizing-runs";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { brandFilterSource, leafSourceLinks } from "@/lib/catalog/storefront-links";
import { probeShopifyFilter, shopifyFilterParameter } from "@/lib/catalog/storefront-filter-probe";
import { getWooBrandTerms } from "@/lib/catalog/storefront-brand-terms";
import { brandLeafSourceLinks, type BrandLeafSourceLinks } from "./brand-leaf-sources";
import { brandMappingIsCurrent, parseStoreBrandMapping, resolveChartBrandKey } from "./brand-mapping";
import { canonicalizeCoverageForCharts } from "./brand-mapping-view";
import { buildBrandResearch, buildChartResults } from "./chart-results";
import { facetsHaveSources } from "./record-facets";
import { buildStockedLeaves } from "./stocked-leaves";
import { mappedPersonaLeaves } from "@/modules/store/mapping/persona-taxonomy";

/**
 * The collections that hold each chart brand's items under each subcategory, as links that open the
 * storefront already filtered to that brand. Empty until a scan has saved collections per product, and
 * never allowed to fail the chart list it rides along with: the screen falls back to the full list of
 * collections mapped to the subcategory.
 */
async function loadBrandLeafSources(
  connection: StoreConnectionRow,
  types: ReadonlyMap<string, BrandType>,
  brandMapping: ReturnType<typeof parseStoreBrandMapping>,
): Promise<BrandLeafSourceLinks> {
  try {
    const facetRows = await getSizingProductFacets(connection.id);
    if (!facetRows || !facetsHaveSources(facetRows)) return {};

    const source = brandFilterSource(connection.acsFieldMapping);
    const parameter = connection.platform === "shopify" ? shopifyFilterParameter(source) : null;
    const handle = connection.categories.find((category) => category.handle?.trim())?.handle?.trim();
    const [support, wooBrands] = await Promise.all([
      parameter && handle
        ? probeShopifyFilter(storefrontOrigin(connection.storeUrl), handle, parameter)
        : Promise.resolve(null),
      source.kind === "vendor" ? getWooBrandTerms(connection) : Promise.resolve([]),
    ]);

    return brandLeafSourceLinks({
      facetRows,
      resolveBrandKey: (rawKey) => resolveChartBrandKey(rawKey, types.get(rawKey), brandMapping),
      categories: connection.categories,
      platform: connection.platform,
      storeUrl: connection.storeUrl,
      source,
      wooBrands,
      support,
    });
  } catch (err) {
    console.error("[sizing charts-view brandLeafSources]", err);
    return {};
  }
}

function storefrontOrigin(storeUrl: string): string {
  const trimmed = storeUrl.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export type ChartsView =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

/**
 * Stage 4's whole surface: the coverage-driven chart and gap join, plus one row per global brand at
 * the grain the Generate button works on.
 *
 * `coverage` and `pathCoverage` decide what is listed. Setup passes the store's; Sync passes only
 * the pairs and leaves its run's products sit on, counted over those products, so a sync asks for
 * the charts its products need and nothing Setup already left open. `allCoverage` is always the
 * store's, because the brand mapping and brand types are store facts either way.
 */
export async function buildChartsView(input: {
  connection: StoreConnectionRow;
  run: SizingRunRow | null;
  allCoverage: readonly SizingCoverageRow[];
  coverage: SizingCoverageRow[];
  pathCoverage: SizingPathCoverageRow[];
}): Promise<ChartsView> {
  const { connection, run, allCoverage, coverage, pathCoverage } = input;
  const brandMapping = parseStoreBrandMapping(connection.sizingBrandMapping);
  const globalKeys = allCoverage.filter((row) => row.brandType === "global").map((row) => row.brandKey);
  if (!brandMappingIsCurrent(globalKeys, brandMapping)) {
    return { ok: false, status: 409, error: "Confirm the canonical brand mapping before viewing chart research." };
  }
  const canonical = canonicalizeCoverageForCharts(coverage, brandMapping);

  const globalBrandKeys = [
    ...new Set(canonical.rows.filter((row) => row.brandType === "global").map((row) => row.brandKey)),
  ];
  const privateBrandKeys = [
    ...new Set(
      canonical.rows
        .filter((row) => row.brandType === "private" || row.brandType === "none")
        .map((row) => row.brandKey),
    ),
  ];
  const [sharedCharts, privateCharts] = await Promise.all([
    listSharedChartsForBrands(globalBrandKeys),
    listPrivateChartsForBrands(connection.id, privateBrandKeys),
  ]);
  const charts = [...sharedCharts, ...privateCharts];

  const mappedLeaves = mappedPersonaLeaves(connection.personaCategoryMap, connection.personaTaxonomyScope);
  const types = new Map(allCoverage.map((row) => [row.brandKey, row.brandType]));
  const stocked = buildStockedLeaves(pathCoverage, types, brandMapping, mappedLeaves);

  const results = buildChartResults(canonical.rows, charts, stocked);
  const brands = buildBrandResearch(
    canonical.rows,
    charts,
    {
      // Only while research is the live stage. A scope left on a run that has moved past research is
      // spent, and reading it would show brands as Queued forever.
      scopedBrandKeys: run?.stage === "research" ? run.researchBrandKeys : [],
      currentBrandKey: run?.stage === "research" ? run.researchCurrentBrandKey : null,
    },
    stocked
  ).map((brand) => ({
    ...brand,
    memberBrands: canonical.membersByCanonicalKey.get(brand.brandKey) ?? [
      { brandKey: brand.brandKey, brandName: brand.brandName, skuCount: brand.skuCount },
    ],
  }));

  const leafCounts = new Map<string, number>();
  for (const path of pathCoverage) {
    const brandKey = resolveChartBrandKey(path.brandKey, types.get(path.brandKey), brandMapping);
    const key = `${brandKey}\u0000${path.categoryId}`;
    leafCounts.set(key, (leafCounts.get(key) ?? 0) + path.skuCount);
  }

  return {
    ok: true,
    body: {
      ...results,
      brands,
      mappedLeaves,
      leafCounts: [...leafCounts].map(([key, skuCount]) => {
        const [brandKey, leafKey] = key.split("\u0000");
        return { brandKey, leafKey, skuCount };
      }),
      leafSources: leafSourceLinks(
        connection.personaCategoryMap,
        connection.categories,
        connection.platform,
        connection.storeUrl,
      ),
      brandLeafSources: await loadBrandLeafSources(connection, types, brandMapping),
    },
  };
}
