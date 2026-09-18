import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { listSizingCoverage, setResearchOutcomes } from "@/lib/db/sizing-coverage";
import { listChartsForBrands, upsertChart } from "@/lib/db/sizing-charts";
import { getLatestSizingRun } from "@/lib/db/sizing-runs";
import { buildChartResults, buildBrandResearch } from "@/lib/sizing/chart-results";
import { parseDraft, type ChartDraftRow } from "@/lib/sizing/chart-draft";
import { chartHasBounds, isChartRegion } from "@/lib/sizing/chart-schema";
import { isSizingGroup } from "@/lib/sizing/measurements";
import { isAudience, normalizeBrandKey, UNKNOWN_BRAND_KEY } from "@/lib/sizing/keys";

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

    const [coverage, run] = await Promise.all([
      listSizingCoverage(connection.id),
      getLatestSizingRun(connection.id),
    ]);

    // Read for every brand in coverage, not only the global ones: a merchant's hand-filled chart for
    // a private label is a chart, and omitting it would leave the gap it closed on the screen.
    const brandKeys = [...new Set(coverage.map((row) => row.brandKey))];
    const charts = await listChartsForBrands(connection.id, brandKeys);

    const results = buildChartResults(coverage, charts);
    const brands = buildBrandResearch(coverage, charts, {
      // Only while research is the live stage. A scope left on a run that has moved past research is
      // spent, and reading it would show brands as Queued forever.
      scopedBrandKeys: run?.stage === "research" ? run.researchBrandKeys : [],
      currentBrandKey: run?.stage === "research" ? run.researchCurrentBrandKey : null,
    });

    return Response.json({ ...results, brands });
  } catch (err) {
    console.error("[store-connection sizing/charts GET]", err);
    return Response.json({ error: "Could not load the researched charts" }, { status: 500 });
  }
}

/**
 * Doc Part 4 — the merchant's own size chart, for stock no research could reach.
 *
 * The first merchant write to `sizing_charts`: until now `upsertChart` was only ever called by the
 * research pass. Two things follow from that, and both are enforced here rather than trusted to the
 * caller.
 *
 * **It is always connection-scoped.** `connection_id` is this store's, never null. A null
 * `connection_id` is the shared cross-merchant registry that research writes, and letting a hand-
 * typed chart land there would publish one store's numbers to every other store carrying the brand.
 *
 * **It never overwrites a researched chart.** Doc Part 6 has charts editable, and the answer to
 * editing a shared row is to mint a merchant-owned variant beside it rather than to change it —
 * which the scoped index gives us for free, since `(connection_id, brand_key, sizing_category,
 * variant_name)` is a different key from the global one. `chart-results.ts` then prefers this
 * store's row over the shared one, so the merchant sees their own numbers where they made them.
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

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const sizingCategory = body.sizingCategory;
    if (!isSizingGroup(sizingCategory)) {
      return Response.json({ error: "Unknown sizing category." }, { status: 400 });
    }

    const variantName = typeof body.variantName === "string" ? body.variantName.trim() : "";
    if (!variantName) {
      return Response.json({ error: "A chart variant needs a name." }, { status: 400 });
    }

    const rows = Array.isArray(body.rows) ? (body.rows as ChartDraftRow[]) : null;
    if (!rows) {
      return Response.json({ error: "No chart rows were sent." }, { status: 400 });
    }

    // The same parser and the same plausibility rules the editor ran against, re-run server-side.
    // The client already reports these, but the client is not what makes them true.
    const { rows: chartRows, problems } = parseDraft(rows, sizingCategory);
    if (problems.length > 0) {
      return Response.json({ error: "This chart is not complete.", problems }, { status: 400 });
    }

    // Belt and braces over `parseDraft`, which already requires the parent's main field: a chart
    // with no bound at all cannot match a shopper, so it is the one output worth nothing rather
    // than worth reviewing. Research applies the identical gate before writing.
    if (!chartHasBounds(chartRows, sizingCategory)) {
      return Response.json({ error: "This chart has no usable measurements." }, { status: 400 });
    }

    // Resolved against coverage rather than taken from the client. The brand key decides which
    // charts a product later resolves against, so accepting an arbitrary one would let a chart be
    // filed under a brand this store does not carry, where nothing would ever read it.
    const brandKeyInput = typeof body.brandKey === "string" ? body.brandKey.trim() : "";
    const coverage = await listSizingCoverage(connection.id);
    const known = coverage.find(
      (row) => row.brandKey === brandKeyInput && row.sizingCategory === sizingCategory
    );

    // The unbranded queue is legitimate and has no coverage brand to match: doc Tab 3 routes those
    // rows to manual fill grouped by category precisely because there is no brand name on them.
    const unbranded = brandKeyInput === UNKNOWN_BRAND_KEY;
    if (!known && !unbranded) {
      return Response.json(
        { error: "This store does not carry that brand in that category." },
        { status: 409 }
      );
    }

    const brandKey = unbranded ? UNKNOWN_BRAND_KEY : normalizeBrandKey(brandKeyInput);

    const wrote = await upsertChart({
      connectionId: connection.id,
      brandKey,
      sizingCategory,
      variantName,
      variantGender: isAudience(body.variantGender) ? body.variantGender : null,
      variantFitType:
        typeof body.variantFitType === "string" && body.variantFitType.trim()
          ? body.variantFitType.trim()
          : null,
      audience: isAudience(body.audience) ? body.audience : "unisex",
      // Provenance for a hand-filled chart is the person who filled it, so there is no page to cite.
      sourceTitle: typeof body.sourceTitle === "string" ? body.sourceTitle.trim() : "Entered by hand",
      region: isChartRegion(body.region) ? body.region : null,
      chartRows,
      // Not a probability. A merchant reading a garment's own label is the most reliable source in
      // this pipeline, and anything below the review bar would flag their own work for review.
      confidence: 1,
      sourceUrl: null,
      provenance: "manual",
    });

    if (!wrote) {
      return Response.json({ error: "Could not save this chart." }, { status: 500 });
    }

    // Closes the gap that sent them here. Without it the coverage row keeps whatever research
    // concluded — `not_found`, most often — and Stage 4 would list the row as an outstanding gap
    // directly beside the chart that just filled it.
    if (known) {
      await setResearchOutcomes(connection.id, brandKey, [sizingCategory], "found", "Filled in by hand.");
    }

    return Response.json({ ok: true, sizes: chartRows.length });
  } catch (err) {
    console.error("[store-connection sizing/charts POST]", err);
    return Response.json({ error: "Could not save this chart" }, { status: 500 });
  }
}
