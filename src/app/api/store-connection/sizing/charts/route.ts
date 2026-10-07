import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { refuseDuringSetupReset } from "@/lib/catalog/setup-reset-guard";
import { listSizingCoverage, setResearchOutcomes } from "@/lib/db/sizing-coverage";
import {
  insertPrivateChart,
  listPrivateChartsForBrands,
  listSharedChartsForBrands,
  updatePrivateChartById,
} from "@/lib/db/sizing-charts";
import { getLatestSizingRun } from "@/lib/db/sizing-runs";
import {
  buildChartResults,
  buildBrandResearch,
  missingLeavesFor,
  stockedLeavesKey,
} from "@/lib/sizing/chart-results";
import { parseDraft, type ChartDraftRow } from "@/lib/sizing/chart-draft";
import { chartHasBounds } from "@/lib/sizing/chart-schema";
import { isSizingGroup } from "@/lib/sizing/measurements";
import { isAudience, normalizeBrandKey, UNKNOWN_BRAND_KEY } from "@/lib/sizing/keys";
import { sanitizeCoverage } from "@/lib/sizing/variant-match";
import { canonicalizeCoverageForCharts } from "@/lib/sizing/brand-mapping-view";
import { listSizingPathCoverage } from "@/lib/db/sizing-path-coverage";
import { buildStockedLeaves } from "@/lib/sizing/stocked-leaves";
import { clearGeneratedStageFiveCache } from "@/lib/catalog/acs/stage-five-preview";
import { leafSourceLinks } from "@/lib/catalog/storefront-links";
import { leafLabel, mappedPersonaLeaves } from "@/modules/store/mapping/persona-taxonomy";
import {
  brandMappingIsCurrent,
  parseStoreBrandMapping,
  resolveChartBrandKey,
} from "@/lib/sizing/brand-mapping";

/**
 * Stage 4's whole surface: the coverage-driven chart and gap join, plus one row per global brand at
 * the grain the Generate button works on.
 *
 * This route was missing, which the Stage 4 UI had been calling since it was written — every load
 * came back 405 and the screen showed an empty registry beside real coverage. The brand rows are
 * computed here rather than in the component because they depend on the run's live research scope,
 * which the client has no other way to join against.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    const [coverage, run, pathCoverage] = await Promise.all([
      listSizingCoverage(connection.id),
      getLatestSizingRun(connection.id),
      listSizingPathCoverage(connection.id),
    ]);
    const brandMapping = parseStoreBrandMapping(connection.sizingBrandMapping);
    const globalKeys = coverage.filter((row) => row.brandType === "global").map((row) => row.brandKey);
    if (!brandMappingIsCurrent(globalKeys, brandMapping)) {
      return Response.json(
        { error: "Confirm the canonical brand mapping before viewing chart research." },
        { status: 409 },
      );
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
    const types = new Map(coverage.map((row) => [row.brandKey, row.brandType]));
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

    return Response.json({
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
    });
  } catch (err) {
    console.error("[store-connection sizing/charts GET]", err);
    return Response.json({ error: "Could not load the researched charts" }, { status: 500 });
  }
}

/**
 * Doc Part 4 — the merchant's own size chart, for stock no research could reach.
 *
 * Private-label and unbranded charts are always written to `sizing_charts_private`. Global brands
 * are rejected here: their verified shared charts are written only by research/seeding to
 * `sizing_charts`, so a merchant-entered chart can never be assigned to global-brand products.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }
    const resetting = refuseDuringSetupReset(connection);
    if (resetting) return resetting;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const sizingCategory = body.sizingCategory;
    if (!isSizingGroup(sizingCategory)) {
      return Response.json({ error: "Unknown sizing category." }, { status: 400 });
    }

    const variantName = typeof body.variantName === "string" ? body.variantName.trim() : "";
    if (!variantName) {
      return Response.json({ error: "The chart needs a name." }, { status: 400 });
    }

    if (!isAudience(body.audience)) {
      return Response.json({ error: "Choose who this chart is for." }, { status: 400 });
    }
    const chartAudience = body.audience;
    const coversLeaves = sanitizeCoverage(
      body.coversLeaves,
      chartAudience,
      sizingCategory,
      variantName,
    );
    if (coversLeaves.length === 0) {
      return Response.json(
        { error: "Choose at least one mapped sub-category for this chart." },
        { status: 400 },
      );
    }

    const rows = Array.isArray(body.rows) ? (body.rows as ChartDraftRow[]) : null;
    if (!rows) {
      return Response.json({ error: "No chart rows were sent." }, { status: 400 });
    }

    // The same parser and the same plausibility rules the editor ran against, re-run server-side.
    // The client already reports these, but the client is not what makes them true.
    const { rows: chartRows, problems } = parseDraft(rows, sizingCategory, chartAudience);
    if (problems.length > 0) {
      return Response.json({ error: "This chart is not complete.", problems }, { status: 400 });
    }

    // Belt and braces over `parseDraft`, which already requires the parent's main field: a chart
    // with no bound at all cannot match a shopper, so it is the one output worth nothing rather
    // than worth reviewing. Research applies the identical gate before writing.
    if (!chartHasBounds(chartRows, sizingCategory, chartAudience)) {
      return Response.json({ error: "This chart has no usable measurements." }, { status: 400 });
    }

    // Resolved against coverage rather than taken from the client. The brand key decides which
    // charts a product later resolves against, so accepting an arbitrary one would let a chart be
    // filed under a brand this store does not carry, where nothing would ever read it.
    const brandKeyInput = typeof body.brandKey === "string" ? body.brandKey.trim() : "";
    const coverage = await listSizingCoverage(connection.id);
    const brandMapping = parseStoreBrandMapping(connection.sizingBrandMapping);
    // Every store label filed under this chart brand: a private group spans several raw labels, and
    // all of them are sized by what is saved here.
    const members = coverage.filter(
      (row) =>
        resolveChartBrandKey(row.brandKey, row.brandType, brandMapping) === brandKeyInput &&
        row.sizingCategory === sizingCategory
    );
    const known = members.find((row) => row.brandType === "private" || row.brandType === "none") ?? members[0];

    const unbranded = brandKeyInput === UNKNOWN_BRAND_KEY;
    if (!known) {
      return Response.json(
        { error: "This store does not carry that brand in that category." },
        { status: 409 }
      );
    }
    if (
      (unbranded && known.brandType !== "none") ||
      (!unbranded && known.brandType !== "private")
    ) {
      return Response.json(
        { error: "Manual charts are only available for private-label and unbranded products." },
        { status: 409 },
      );
    }

    const brandKey = unbranded ? UNKNOWN_BRAND_KEY : normalizeBrandKey(brandKeyInput);

    const chartId = typeof body.chartId === "string" && body.chartId.trim() ? body.chartId.trim() : null;
    const existingCharts = (await listPrivateChartsForBrands(connection.id, [brandKey])).filter(
      (chart) => chart.sizingCategory === sizingCategory
    );
    if (chartId && !existingCharts.some((chart) => chart.id === chartId)) {
      return Response.json({ error: "That chart no longer exists. Reload and try again." }, { status: 404 });
    }

    // One leaf, one chart. Two private charts claiming the same subcategory would make which of them
    // governs a product depend on row order, so the second claim is refused and named instead.
    for (const other of existingCharts) {
      if (other.id === chartId) continue;
      const taken = coversLeaves.filter((leaf) => other.coversLeaves.includes(leaf));
      if (taken.length > 0) {
        return Response.json(
          {
            error: `${taken.map(leafLabel).join(", ")} ${taken.length === 1 ? "is" : "are"} already covered by your chart "${other.variantName}". Edit that chart or uncheck ${taken.length === 1 ? "it" : "them"} here.`,
            conflictingLeaves: taken,
          },
          { status: 409 }
        );
      }
    }

    const write = {
      brandKey,
      sizingCategory,
      variantName,
      // Same rule as the research writer (`sanitizeCoverage` in `variant-match.ts`): a leaf outside
      // this chart's own audience/sizing-category is dropped rather than stored, whether it came
      // from a model or from a merchant's own checklist.
      coversLeaves,
      audience: chartAudience,
      // Provenance for a hand-filled chart is the person who filled it, so there is no page to cite.
      sourceTitle: typeof body.sourceTitle === "string" ? body.sourceTitle.trim() : "Entered by hand",
      chartRows,
      // Not a probability. A merchant reading a garment's own label is the most reliable source in
      // this pipeline, and anything below the review bar would flag their own work for review.
      confidence: 1,
      sourceUrl: null,
      provenance: "manual" as const,
    };

    const saved = chartId
      ? await updatePrivateChartById(connection.id, chartId, write)
      : await insertPrivateChart({ connectionId: connection.id, ...write });

    if (!saved.ok) {
      if (saved.reason === "name_conflict") {
        return Response.json(
          {
            error: `You already have a chart named "${variantName}" for this brand and category. Choose a different name, or edit that chart instead.`,
          },
          { status: 409 }
        );
      }
      if (saved.reason === "not_found") {
        return Response.json({ error: "That chart no longer exists. Reload and try again." }, { status: 404 });
      }
      return Response.json({ error: "Could not save this chart." }, { status: 500 });
    }

    // Closes the gap that sent them here — but only once nothing stocked is left uncovered. Marking the
    // pair "found" after the first of several charts told Stage 4 the brand was finished while the
    // other subcategories it sells still had no chart.
    clearGeneratedStageFiveCache(connection.id);
    const [pathCoverage, pairCharts] = await Promise.all([
      listSizingPathCoverage(connection.id),
      listPrivateChartsForBrands(connection.id, [brandKey]),
    ]);
    const types = new Map(coverage.map((row) => [row.brandKey, row.brandType]));
    const stocked = buildStockedLeaves(
      pathCoverage,
      types,
      brandMapping,
      mappedPersonaLeaves(connection.personaCategoryMap, connection.personaTaxonomyScope)
    );
    const remaining = missingLeavesFor(
      stocked.get(stockedLeavesKey(brandKey, sizingCategory)),
      pairCharts.filter((chart) => chart.sizingCategory === sizingCategory)
    );
    if (remaining.leaves.length === 0) {
      await Promise.all(
        [...new Set(members.map((row) => row.brandKey))].map((rawKey) =>
          setResearchOutcomes(connection.id, rawKey, [sizingCategory], "found", "Filled in by hand."),
        ),
      );
    }

    return Response.json({
      ok: true,
      id: saved.id,
      sizes: chartRows.length,
      missingLeaves: remaining.leaves,
    });
  } catch (err) {
    console.error("[store-connection sizing/charts POST]", err);
    return Response.json({ error: "Could not save this chart" }, { status: 500 });
  }
}
