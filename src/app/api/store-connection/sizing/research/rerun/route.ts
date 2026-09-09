import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { listSizingCoverage, resetResearchOutcomes } from "@/lib/db/sizing-coverage";
import { deleteResearchedCharts } from "@/lib/db/sizing-charts";
import { rewindRun } from "@/lib/db/sizing-runs";
import { UNKNOWN_BRAND_KEY } from "@/lib/sizing/keys";

/**
 * Runs chart research again, for every global brand or for one.
 *
 * Stage 4 had no way to re-run itself. Once a pass finished, the run parked at `gap_fill`/`blocked`
 * and the only route that could move it (`/sizing/run/continue`) advances rather than rewinds — so
 * every improvement to extraction was unverifiable without deleting rows by hand, and a merchant
 * whose research went badly had no action at all beyond hand-filling every gap.
 *
 * Three things have to happen together, which is why this is one endpoint and not a flag on
 * `continue`:
 *
 *  1. The run goes back to `research`/`pending` so the worker picks it up.
 *  2. Recorded outcomes reset to `pending`, or the review screen would keep showing last pass's
 *     `not_found` next to a brand currently being searched again.
 *  3. The existing researched charts are deleted. This is the one that is easy to miss: the
 *     registry short-circuit skips any brand already holding a chart above the confidence bar, so
 *     without it a "re-run" would skip precisely the brands whose charts prompted it.
 *
 * Deleting only `provenance = 'research'` keeps a merchant's own hand-filled charts out of it.
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

    const body = (await request.json().catch(() => ({}))) as { brandKey?: unknown };
    const brandKey = typeof body.brandKey === "string" && body.brandKey.trim() ? body.brandKey.trim() : null;

    // Resolved from coverage rather than taken on trust: `brandKey` arrives from the client, and
    // `deleteResearchedCharts` writes to rows shared with every other merchant. A brand this store
    // does not carry has no business being cleared out of the shared registry from here.
    const coverage = await listSizingCoverage(connection.id);
    const researchable = coverage
      .filter((row) => row.brandType === "global" && row.brandKey !== UNKNOWN_BRAND_KEY)
      .map((row) => row.brandKey);
    const brandKeys = [...new Set(brandKey ? researchable.filter((key) => key === brandKey) : researchable)];

    if (brandKeys.length === 0) {
      return Response.json(
        { error: "No researchable brand matches this request.", reason: "no_brands" },
        { status: 409 }
      );
    }

    const [chartsDeleted] = await Promise.all([
      deleteResearchedCharts(brandKeys),
      resetResearchOutcomes(connection.id, brandKeys),
    ]);

    const run = await rewindRun(connection.id, "research");
    if (!run) {
      // No live run to rewind. The charts and statuses are already cleared, so saying so plainly is
      // better than a 500: the merchant needs to start a run, not retry this.
      return Response.json(
        { error: "This connection has no run in progress to re-run.", reason: "no_live_run" },
        { status: 409 }
      );
    }

    return Response.json({ run, brands: brandKeys.length, chartsDeleted });
  } catch (err) {
    console.error("[store-connection sizing/research/rerun POST]", err);
    return Response.json({ error: "Could not re-run chart research" }, { status: 500 });
  }
}
