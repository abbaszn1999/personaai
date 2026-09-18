import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { listSizingCoverage } from "@/lib/db/sizing-coverage";
import { listChartsForBrands } from "@/lib/db/sizing-charts";
import { listSizingPathCoverage } from "@/lib/db/sizing-path-coverage";
import {
  insertAutoAssignments,
  listSizingChartAssignments,
  upsertSizingChartAssignment,
} from "@/lib/db/sizing-chart-assignments";
import {
  assignmentTotals,
  autoMatchAssignments,
  buildPathAssignments,
} from "@/lib/sizing/assignments";
import { isSizingGroup } from "@/lib/sizing/measurements";

/**
 * Doc Part 7 — Stage 5's chart assignments.
 *
 * `GET` returns every merchant category path the scan found, what it is bound to, and every variant it
 * could be bound to. `PATCH` records one merchant decision.
 *
 * The safe auto-matches are applied on read rather than by a background job. They are free (a pure
 * function over rows already in hand), they are idempotent (a path with a row is never touched), and
 * doing it here means a merchant landing on Stage 5 for the first time sees the obvious cases already
 * resolved instead of a table of forty dropdowns where thirty had exactly one option.
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

    const [pathCoverage, coverage, assignments] = await Promise.all([
      listSizingPathCoverage(connection.id),
      listSizingCoverage(connection.id),
      listSizingChartAssignments(connection.id),
    ]);

    const charts = await listChartsForBrands(
      connection.id,
      [...new Set(coverage.map((row) => row.brandKey))]
    );

    let paths = buildPathAssignments({ pathCoverage, coverage, charts, assignments });

    const auto = autoMatchAssignments(paths);
    if (auto.length > 0) {
      const wrote = await insertAutoAssignments(
        auto.map(({ path, variantName }) => ({
          connectionId: connection.id,
          brandKey: path.brandKey,
          categoryId: path.categoryId,
          sizingCategory: path.sizingCategory,
          variantName,
          source: "auto" as const,
        }))
      );
      // Rebuilt from the rows just written rather than patched in memory, so what the merchant sees is
      // what the table holds. A failed write leaves those paths unassigned, which is the honest state.
      if (wrote) {
        paths = buildPathAssignments({
          pathCoverage,
          coverage,
          charts,
          assignments: await listSizingChartAssignments(connection.id),
        });
      }
    }

    return Response.json({ paths, totals: assignmentTotals(paths), autoMatched: auto.length });
  } catch (err) {
    console.error("[store-connection sizing/assignments GET]", err);
    return Response.json({ error: "Could not load the chart assignments" }, { status: 500 });
  }
}

/**
 * Binds one merchant path to a chart variant, or explicitly to none.
 *
 * The variant is validated against what this connection may actually see — a visible shared chart or
 * its own scoped one, for the same brand and parent. Without that check a client could bind a path to
 * another brand's chart, or to a chart for a different parent, and the resolver would later size those
 * products against measurements that have nothing to do with the garment.
 */
export async function PATCH(request: Request) {
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

    const brandKey = typeof body.brandKey === "string" ? body.brandKey : null;
    const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
    const sizingCategory = body.sizingCategory;
    // `null` is a real value here — the merchant choosing that this path publishes no chart — so it is
    // accepted and distinguished from the field being absent.
    const variantName =
      body.variantName === null ? null : typeof body.variantName === "string" ? body.variantName.trim() : undefined;

    if (brandKey === null || !categoryId || !isSizingGroup(sizingCategory) || variantName === undefined) {
      return Response.json({ error: "A path and a variant choice are required." }, { status: 400 });
    }

    // The path has to be one the scan actually produced. Accepting an arbitrary category id would let
    // rows accumulate that no screen ever shows and no resolver ever reads.
    const pathCoverage = await listSizingPathCoverage(connection.id);
    const known = pathCoverage.find(
      (row) =>
        row.brandKey === brandKey && row.categoryId === categoryId && row.sizingCategory === sizingCategory
    );
    if (!known) {
      return Response.json({ error: "This store does not carry that category path." }, { status: 409 });
    }

    if (variantName !== null) {
      const charts = await listChartsForBrands(connection.id, [brandKey]);
      const visible = charts.some(
        (chart) => chart.sizingCategory === sizingCategory && chart.variantName === variantName
      );
      if (!visible) {
        return Response.json(
          { error: "That chart variant is not available for this brand and category." },
          { status: 409 }
        );
      }
    }

    const wrote = await upsertSizingChartAssignment({
      connectionId: connection.id,
      brandKey,
      categoryId,
      sizingCategory,
      variantName,
      // Always `merchant`: this endpoint is only reached by someone pressing something, and the source
      // is what protects the choice from being overwritten by a later auto-match pass.
      source: "merchant",
    });

    if (!wrote) {
      return Response.json({ error: "Could not save this assignment." }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[store-connection sizing/assignments PATCH]", err);
    return Response.json({ error: "Could not save this assignment" }, { status: 500 });
  }
}
