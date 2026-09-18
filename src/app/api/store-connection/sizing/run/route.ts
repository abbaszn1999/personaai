import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { hasApprovedCurrentMapping } from "@/lib/catalog/acs/field-overrides";
import { MAPPER_VERSION } from "@/lib/catalog/acs/map-product";
import { createSizingRun, getLatestSizingRun } from "@/lib/db/sizing-runs";
import { listSizingCoverage } from "@/lib/db/sizing-coverage";
import { listSizingNullRecords } from "@/lib/db/sizing-null-records";
import { summarizeCoverage } from "@/lib/sizing/summary";
import { buildIdentification, buildRouting } from "@/lib/sizing/routing";
import { mappedSourceCategoryIds } from "@/lib/catalog/persona-mapping";

/**
 * The size-intelligence pipeline's run state and its results.
 *
 * `GET` is what the pipeline polls while a scan is walking, and what it reads on mount so a merchant
 * who refreshes mid-pipeline lands back where they were instead of at stage 1. `POST` starts a run.
 *
 * Deliberately one route for both: the client needs the run and the coverage it produced together on
 * every poll, and splitting them would let the UI render a completed run against a previous run's
 * brand list for one frame.
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

    const run = await getLatestSizingRun(connection.id);

    // Coverage is only meaningful once a scan has written it. Skipping the reads when no run exists
    // keeps first load on a fresh connection to a single query.
    const [coverage, nullRecords] = run
      ? await Promise.all([listSizingCoverage(connection.id), listSizingNullRecords(connection.id)])
      : [[], []];

    return Response.json({
      run,
      summary: summarizeCoverage(coverage),
      // Tab 2's three lists and Tab 3's routing, sent together with the run for the same reason
      // coverage is: the pipeline renders them on one screen, and fetching them separately would
      // let it show a completed run's routing against the previous run's brand list.
      identification: buildIdentification(coverage, nullRecords),
      routing: buildRouting(coverage, nullRecords),
      mappingApproved: hasApprovedCurrentMapping(connection, MAPPER_VERSION),
      sizingStagesSkipped: connection.sizingStagesSkippedAt !== null,
    });
  } catch (err) {
    console.error("[store-connection sizing/run GET]", err);
    return Response.json({ error: "Could not load the sizing run" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    // Gated on the same approval the index is gated on. The scan reads sizes and audience through the
    // merchant's option-group mapping, so scanning before that is approved would classify brands and
    // collect size formats from a mapping they are about to change — and every one of those results
    // would then be wrong in a way nothing surfaces.
    if (!hasApprovedCurrentMapping(connection, MAPPER_VERSION)) {
      return Response.json(
        { error: "Approve the field mapping in stage 1 before scanning the catalog.", reason: "mapping_not_approved" },
        { status: 409 }
      );
    }

    if (mappedSourceCategoryIds(connection.personaCategoryMap).length === 0) {
      return Response.json(
        { error: "Map at least one store category to Persona before scanning.", reason: "no_categories" },
        { status: 409 }
      );
    }

    // Returns the live run if one is already open rather than erroring, so a double-clicked "Run"
    // is idempotent instead of showing the merchant a failure for something that is working.
    const run = await createSizingRun(connection.id);
    if (!run) {
      return Response.json({ error: "Could not start the sizing run" }, { status: 500 });
    }

    // Nothing is executed here. The scan pages the merchant's whole catalog, which outlasts a
    // request; the background driver (`lib/sizing/jobs.ts`) picks the run up on its next tick.
    return Response.json({ run });
  } catch (err) {
    console.error("[store-connection sizing/run POST]", err);
    return Response.json({ error: "Could not start the sizing run" }, { status: 500 });
  }
}
