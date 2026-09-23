import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner, updateStoreConnection } from "@/lib/db/store-connections";
import { listSizingCoverage } from "@/lib/db/sizing-coverage";
import { listSharedChartBrandKeys } from "@/lib/db/sizing-charts";
import { createSizingRun, getLatestSizingRun, rewindRun } from "@/lib/db/sizing-runs";
import { mappingFromGroups, type BrandMappingGroup } from "@/lib/sizing/brand-mapping";
import { buildBrandMappingState } from "@/lib/sizing/brand-mapping-state";

async function stateFor(
  connection: NonNullable<Awaited<ReturnType<typeof getStoreConnectionByOwner>>>,
) {
  const [coverage, sharedBrandKeys, run] = await Promise.all([
    listSizingCoverage(connection.id),
    listSharedChartBrandKeys(),
    getLatestSizingRun(connection.id),
  ]);
  return buildBrandMappingState({
    coverage,
    mapping: connection.sizingBrandMapping,
    sharedBrandKeys,
    run,
  });
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

    return Response.json(await stateFor(connection));
  } catch (error) {
    console.error("[store-connection sizing/brand-mapping GET]", error);
    return Response.json({ error: "Could not load brand mapping" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

    const current = await stateFor(connection);
    const body = (await request.json().catch(() => null)) as { groups?: unknown } | null;
    if (!body || !Array.isArray(body.groups)) {
      return Response.json({ error: "Send the complete canonical brand groups." }, { status: 400 });
    }

    let mapping;
    try {
      mapping = mappingFromGroups(
        connection.sizingBrandMapping,
        current.brands,
        body.groups as BrandMappingGroup[],
        new Date().toISOString(),
      );
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Invalid brand mapping." },
        { status: 400 },
      );
    }

    const updated = await updateStoreConnection(user.id, { sizingBrandMapping: mapping });
    if (!updated) return Response.json({ error: "Could not save brand mapping" }, { status: 500 });

    const run = (await rewindRun(updated.id, "scan")) ?? (await createSizingRun(updated.id));
    if (!run) {
      return Response.json(
        { error: "The mapping was saved, but the canonical catalog rescan could not start." },
        { status: 500 },
      );
    }

    return Response.json(await stateFor(updated));
  } catch (error) {
    console.error("[store-connection sizing/brand-mapping PUT]", error);
    return Response.json({ error: "Could not save brand mapping" }, { status: 500 });
  }
}
