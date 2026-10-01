import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { listPrivateChartsForBrands, listSharedChartsForBrands } from "@/lib/db/sizing-charts";
import { listSizingCoverage } from "@/lib/db/sizing-coverage";
import {
  brandMappingIsCurrent,
  parseStoreBrandMapping,
} from "@/lib/sizing/brand-mapping";
import { canonicalizeCoverageForCharts } from "@/lib/sizing/brand-mapping-view";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { buildSizingTesterOptions } from "@/modules/store/sizing/tester/options";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

    const coverage = await listSizingCoverage(connection.id);
    const mapping = parseStoreBrandMapping(connection.sizingBrandMapping);
    const globalKeys = coverage
      .filter((row) => row.brandType === "global")
      .map((row) => row.brandKey);
    if (globalKeys.length > 0 && !brandMappingIsCurrent(globalKeys, mapping)) {
      return Response.json(
        { error: "Confirm the canonical brand mapping before opening the Sizing Tester." },
        { status: 409 },
      );
    }

    const canonical = canonicalizeCoverageForCharts(coverage, mapping);
    const sharedKeys = [
      ...new Set(
        canonical.rows
          .filter((row) => row.brandType === "global")
          .map((row) => row.brandKey),
      ),
    ];
    const privateKeys = [
      ...new Set(
        canonical.rows
          .filter((row) => row.brandType === "private" || row.brandType === "none")
          .map((row) => row.brandKey),
      ),
    ];
    const [sharedCharts, privateCharts] = await Promise.all([
      listSharedChartsForBrands(sharedKeys),
      listPrivateChartsForBrands(connection.id, privateKeys),
    ]);

    return Response.json(
      buildSizingTesterOptions(
        canonical.rows,
        [...sharedCharts, ...privateCharts],
        canonical.membersByCanonicalKey,
      ),
    );
  } catch (error) {
    console.error("[store-connection sizing/tester/options GET]", error);
    return Response.json({ error: "Could not load Sizing Tester options" }, { status: 500 });
  }
}
