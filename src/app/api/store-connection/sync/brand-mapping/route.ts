import { updateSizingBrandMapping, type StoreConnectionRow } from "@/lib/db/store-connections";
import { markPathConfigStale } from "@/lib/catalog/path-config/rebuild";
import { listSizingCoverage } from "@/lib/db/sizing-coverage";
import { listSharedChartBrandKeys } from "@/lib/db/sizing-charts";
import {
  mappingWithNewBrandGroups,
  parseStoreBrandMapping,
  privateAliasesFromGroups,
  type BrandMappingGroup,
} from "@/lib/sizing/brand-mapping";
import { buildBrandMappingState, buildNewBrandMappingState } from "@/lib/sizing/brand-mapping-state";
import { runProducts } from "@/lib/sync/scope";
import { currentSyncRun, liveSyncRun, syncConnection } from "@/lib/sync/route-context";

async function statesFor(connection: StoreConnectionRow) {
  const [coverage, sharedBrandKeys, run] = await Promise.all([
    listSizingCoverage(connection.id),
    listSharedChartBrandKeys(),
    currentSyncRun(connection.id),
  ]);
  const products = run ? await runProducts(run) : [];
  const input = {
    coverage,
    mapping: connection.sizingBrandMapping,
    sharedBrandKeys,
    runBrandKeys: new Set(products.map((product) => product.brandKey)),
  };
  return { full: buildBrandMappingState(input), sync: buildNewBrandMappingState(input) };
}

/**
 * The brand mapping step of a sync: only the brands the sync's products introduced. Brands Setup
 * confirmed keep their canonical brand and are not shown again.
 */
export async function GET() {
  try {
    const { connection, response } = await syncConnection();
    if (response) return response;
    return Response.json((await statesFor(connection)).sync);
  } catch (error) {
    console.error("[store-connection sync/brand-mapping GET]", error);
    return Response.json({ error: "Could not load brand mapping" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { connection, response } = await syncConnection({ writing: true });
    if (response) return response;
    const live = await liveSyncRun(connection.id);
    if (live.response) return live.response;

    const { full, sync } = await statesFor(connection);
    const body = (await request.json().catch(() => null)) as
      | { groups?: unknown; privateGroups?: unknown }
      | null;
    if (!body || !Array.isArray(body.groups)) {
      return Response.json({ error: "Send the canonical brand groups for the new brands." }, { status: 400 });
    }
    if (body.privateGroups !== undefined && !Array.isArray(body.privateGroups)) {
      return Response.json({ error: "Private brand groups must be a list." }, { status: 400 });
    }

    const current = parseStoreBrandMapping(connection.sizingBrandMapping);
    let mapping;
    try {
      mapping = mappingWithNewBrandGroups(
        current,
        full.brands,
        sync.brands,
        body.groups as BrandMappingGroup[],
        new Date().toISOString(),
      );
      if (body.privateGroups !== undefined) {
        const reserved = new Set([
          ...full.brands.map((brand) => brand.rawKey),
          ...Object.values(mapping.aliases).map((alias) => alias.canonicalKey),
        ]);
        mapping = {
          ...mapping,
          privateAliases: {
            ...current.privateAliases,
            ...privateAliasesFromGroups(mapping, sync.privateBrands, body.privateGroups as BrandMappingGroup[], reserved),
          },
        };
      }
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Invalid brand mapping." },
        { status: 400 },
      );
    }

    const updated = await updateSizingBrandMapping(connection.ownerId, mapping);
    if (!updated) return Response.json({ error: "Could not save brand mapping" }, { status: 500 });
    // The agents' path config groups brands by this mapping.
    await markPathConfigStale(updated.id);

    return Response.json((await statesFor(updated)).sync);
  } catch (error) {
    console.error("[store-connection sync/brand-mapping PUT]", error);
    return Response.json({ error: "Could not save brand mapping" }, { status: 500 });
  }
}
