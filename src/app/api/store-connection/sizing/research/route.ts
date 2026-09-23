import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { listSizingCoverage, resetResearchOutcomes } from "@/lib/db/sizing-coverage";
import { getActiveSizingRun, queueScopedResearch } from "@/lib/db/sizing-runs";
import { UNKNOWN_BRAND_KEY } from "@/lib/sizing/keys";
import { buildBrandResearch } from "@/lib/sizing/chart-results";
import { listChartsForBrands } from "@/lib/db/sizing-charts";
import { buildBrandMappingState } from "@/lib/sizing/brand-mapping-state";

/**
 * Starts chart research for one brand, or for every brand still outstanding.
 *
 * The only way research ever begins. It used to begin by itself: classification parked the run at
 * `research`/`pending` and the worker searched every global brand it could find, so a merchant who
 * simply pressed Continue past the brand list bought a bulk pass over their whole catalog with no way
 * to try one brand first and no way to stop it.
 *
 * Three things make this safe to expose, and all three are enforced here rather than trusted to the
 * client:
 *
 *  1. **The brand list is resolved from coverage.** `brandKey` arrives from the browser, and research
 *     writes to `sizing_charts` rows shared with every other merchant. A brand this store does not
 *     carry as `global` has no business being searched from here.
 *  2. **The scope is persisted on the run.** A pass is bounded per tick, so a Generate All over twenty
 *     brands comes back through the worker many times; a scope living in this request would be gone by
 *     the second tick and the worker would fall back to "everything", which is the behaviour being
 *     removed.
 *  3. **Regenerate does not delete first.** The old re-run endpoint cleared the brand's researched
 *     charts up front so the registry short-circuit could not skip them. That left a merchant with
 *     nothing at all if the new search then failed. `force` bypasses the short-circuit instead, and
 *     `upsertChart` replaces each table as it succeeds.
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

    const body = (await request.json().catch(() => ({}))) as { brandKey?: unknown; force?: unknown };
    const requested = typeof body.brandKey === "string" && body.brandKey.trim() ? body.brandKey.trim() : null;
    const force = body.force === true;

    const run = await getActiveSizingRun(connection.id);
    if (!run) {
      return Response.json(
        { error: "This connection has no run in progress. Read the catalog first.", reason: "no_live_run" },
        { status: 409 }
      );
    }
    // A scan or classification still in flight has not written the coverage research reads, so a
    // request now would search a brand list that is still empty or still unclassified.
    if (run.stage === "scan" || run.stage === "classify") {
      return Response.json(
        { error: "The catalog is still being read. Research can start once brands are classified.", reason: "scan_running" },
        { status: 409 }
      );
    }

    const coverage = await listSizingCoverage(connection.id);
    const mappingState = buildBrandMappingState({
      coverage,
      mapping: connection.sizingBrandMapping,
      sharedBrandKeys: [],
      run,
    });
    if (!mappingState.ready) {
      return Response.json(
        {
          error: "Review and save the canonical brand mapping before starting chart research.",
          reason: mappingState.status === "rescanning" ? "brand_mapping_rescanning" : "brand_mapping_required",
        },
        { status: 409 },
      );
    }

    const charts = await listChartsForBrands(
      connection.id,
      [...new Set(coverage.map((row) => row.brandKey))]
    );
    const brands = buildBrandResearch(coverage, charts);

    const eligible = brands.filter((brand) => brand.brandKey !== UNKNOWN_BRAND_KEY);
    const scope = requested
      ? eligible.filter((brand) => brand.brandKey === requested)
      : // Generate All means everything not already finished. A brand whose charts are complete is left
        // out rather than re-searched: re-running those is what Regenerate is for, per brand, and
        // sweeping them into a bulk press would re-pay for every chart the store already holds.
        eligible.filter((brand) => force || brand.status !== "done");

    if (scope.length === 0) {
      return Response.json(
        {
          error: requested
            ? "This store does not carry that brand as a researchable global brand."
            : "Every brand already has its charts. Use Regenerate on a brand to search it again.",
          reason: requested ? "unknown_brand" : "nothing_outstanding",
        },
        { status: 409 }
      );
    }

    const brandKeys = scope.map((brand) => brand.brandKey);

    // Reopens the recorded conclusions so the pass looks at them again. Without this a brand marked
    // `not_found` last time is skipped by the outstanding-pairs filter, and Regenerate would report
    // success having searched nothing.
    if (force) await resetResearchOutcomes(connection.id, brandKeys);

    const queued = await queueScopedResearch(connection.id, brandKeys, { force });
    if (!queued) {
      return Response.json({ error: "Could not queue chart research." }, { status: 500 });
    }

    return Response.json({ run: queued, brands: brandKeys.length });
  } catch (err) {
    console.error("[store-connection sizing/research POST]", err);
    return Response.json({ error: "Could not start chart research" }, { status: 500 });
  }
}
