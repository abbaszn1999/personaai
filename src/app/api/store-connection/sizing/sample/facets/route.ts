import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { listSizingCoverage } from "@/lib/db/sizing-coverage";
import { getSizingProductFacets, getSizingProductPrimaryLeafCounts } from "@/lib/db/sizing-product-records";
import { buildSampleFacets } from "@/lib/sizing/sample-facets";

/**
 * The options behind Stage 2's Brand, Persona path and Collection filters, with counts.
 *
 * Separate from the page request because these lists describe the whole snapshot and change only on
 * a rescan, while a page request changes with every click. The client reads this once and keeps it.
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

    const [coverage, leafCounts, facetRows] = await Promise.all([
      listSizingCoverage(connection.id, { fresh: true }),
      getSizingProductPrimaryLeafCounts(connection.id),
      getSizingProductFacets(connection.id),
    ]);

    return Response.json(
      buildSampleFacets({
        coverage,
        leafCounts: leafCounts?.byLeaf ?? {},
        facetRows,
        categories: connection.categories,
      }),
    );
  } catch (err) {
    console.error("[store-connection sizing/sample/facets GET]", err);
    return Response.json({ error: "Could not load the filter options" }, { status: 500 });
  }
}
