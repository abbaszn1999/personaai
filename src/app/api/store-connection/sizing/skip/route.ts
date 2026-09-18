import { getCurrentUser } from "@/modules/auth/lib/get-user";
import {
  getStoreConnectionByOwner,
  recordAcsMappingApproval,
  updateStoreConnection,
} from "@/lib/db/store-connections";
import { hasApprovedCurrentMapping } from "@/lib/catalog/acs/field-overrides";
import { MAPPER_VERSION } from "@/lib/catalog/acs/map-product";
import { isMapped } from "@/lib/catalog/acs-mapping";
import { createSizingRun, updateSizingRun, rewindRun, getActiveSizingRun } from "@/lib/db/sizing-runs";
import { mappedSourceCategoryIds } from "@/lib/catalog/persona-mapping";

/**
 * The shortcut past setup stages 2-5, for a store that already keeps a size chart on every product.
 *
 * Those stages exist to produce charts: discover the brands, research what each publishes, hand-fill
 * what research missed, assign the result to categories. A merchant whose products each carry their
 * own chart has the output already, so walking them through it spends model calls to arrive where
 * they started — and worse, would size their shoppers against a researched guess rather than the
 * chart the merchant actually stands behind.
 *
 * `POST` takes the shortcut, `DELETE` gives it back. The un-skip exists because the skip is a claim
 * about the catalog, and a catalog changes: a merchant who unbinds the column, or adds a line of
 * products with no chart, needs the stages that were skipped to become real again.
 */

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

    // Checked server-side rather than trusted from the button, because this is the whole basis of the
    // shortcut: with nothing bound to the size chart row there are no merchant charts, and skipping
    // would leave the store with no charts at all from either source.
    const bound = connection.acsFieldMapping.sources.sizeChartData;
    if (!bound || !isMapped(bound)) {
      return Response.json(
        {
          error: "Map one of your columns to the size chart row before skipping the sizing stages.",
          reason: "size_chart_not_bound",
        },
        { status: 409 }
      );
    }

    if (mappedSourceCategoryIds(connection.personaCategoryMap).length === 0) {
      return Response.json(
        { error: "Map at least one store category to Persona first.", reason: "no_categories" },
        { status: 409 }
      );
    }

    // The same gate `POST /sizing/run` applies, for the same reason: whatever happens after this reads
    // products through the mapping, so it cannot be a mapping the merchant is still editing. Skipping
    // is itself an approval of Stage 1 — it is the only action they take on that screen.
    if (!hasApprovedCurrentMapping(connection, MAPPER_VERSION) && !(await recordAcsMappingApproval(connection.id, MAPPER_VERSION))) {
      return Response.json({ error: "Could not approve the field mapping" }, { status: 500 });
    }

    // A run row still exists, parked at the last stage. The pipeline's position is a server fact —
    // that is what brings a returning merchant back to Step 6 instead of Step 1 — and a skipped store
    // that later un-skips needs a run to rewind rather than one to invent.
    const run = (await getActiveSizingRun(connection.id)) ?? (await createSizingRun(connection.id));
    if (!run) {
      return Response.json({ error: "Could not record the skip" }, { status: 500 });
    }

    const parked = await updateSizingRun(run.id, {
      stage: "resolve",
      status: "blocked",
      error: null,
      phase: null,
      phaseDone: null,
      phaseTotal: null,
      researchBrandKeys: [],
      researchCurrentBrandKey: null,
    });

    await updateStoreConnection(connection.id, {
      sizingSource: "merchant_charts",
      sizingStagesSkippedAt: new Date().toISOString(),
    });

    return Response.json({ run: parked ?? run, sizingSource: "merchant_charts" });
  } catch (err) {
    console.error("[store-connection sizing/skip POST]", err);
    return Response.json({ error: "Could not skip the sizing stages" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    await updateStoreConnection(connection.id, {
      sizingSource: "ai_pipeline",
      sizingStagesSkippedAt: null,
    });

    // Back to the scan, not to wherever the run was parked before the skip: the stages being reopened
    // all read scan output, and a store that skipped them has none.
    const run = await rewindRun(connection.id, "scan");

    return Response.json({ run, sizingSource: "ai_pipeline" });
  } catch (err) {
    console.error("[store-connection sizing/skip DELETE]", err);
    return Response.json({ error: "Could not restore the sizing stages" }, { status: 500 });
  }
}
