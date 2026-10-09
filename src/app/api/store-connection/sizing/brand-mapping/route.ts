import { getCurrentUser } from "@/modules/auth/lib/get-user";
import {
  getStoreConnectionByOwner,
  updateSizingBrandMapping,
} from "@/lib/db/store-connections";
import { markPathConfigStale } from "@/lib/catalog/path-config/rebuild";
import { refuseDuringSetupReset } from "@/lib/catalog/setup-reset-guard";
import { listSizingCoverage } from "@/lib/db/sizing-coverage";
import { listSharedChartBrandKeys } from "@/lib/db/sizing-charts";
import {
  mappingFromGroups,
  privateAliasesFromGroups,
  type BrandMappingGroup,
} from "@/lib/sizing/brand-mapping";
import { buildBrandMappingState } from "@/lib/sizing/brand-mapping-state";

async function stateFor(
  connection: NonNullable<Awaited<ReturnType<typeof getStoreConnectionByOwner>>>,
) {
  const [coverage, sharedBrandKeys] = await Promise.all([
    listSizingCoverage(connection.id),
    listSharedChartBrandKeys(),
  ]);
  return buildBrandMappingState({
    coverage,
    mapping: connection.sizingBrandMapping,
    sharedBrandKeys,
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
    const resetting = refuseDuringSetupReset(connection);
    if (resetting) return resetting;

    const current = await stateFor(connection);
    const body = (await request.json().catch(() => null)) as
      | { groups?: unknown; privateGroups?: unknown }
      | null;
    if (!body || !Array.isArray(body.groups)) {
      return Response.json({ error: "Send the complete canonical brand groups." }, { status: 400 });
    }
    if (body.privateGroups !== undefined && !Array.isArray(body.privateGroups)) {
      return Response.json({ error: "Private brand groups must be a list." }, { status: 400 });
    }

    let mapping;
    try {
      mapping = mappingFromGroups(
        connection.sizingBrandMapping,
        current.brands,
        body.groups as BrandMappingGroup[],
        new Date().toISOString(),
      );
      if (body.privateGroups !== undefined) {
        const reserved = new Set([
          ...current.brands.map((brand) => brand.rawKey),
          ...Object.values(mapping.aliases).map((alias) => alias.canonicalKey),
        ]);
        mapping = {
          ...mapping,
          privateAliases: privateAliasesFromGroups(
            mapping,
            current.privateBrands,
            body.privateGroups as BrandMappingGroup[],
            reserved,
          ),
        };
      }
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Invalid brand mapping." },
        { status: 400 },
      );
    }

    const updated = await updateSizingBrandMapping(user.id, mapping);
    if (!updated) return Response.json({ error: "Could not save brand mapping" }, { status: 500 });
    // The agents' path config groups brands by this mapping.
    await markPathConfigStale(updated.id);

    return Response.json(await stateFor(updated));
  } catch (error) {
    console.error("[store-connection sizing/brand-mapping PUT]", error);
    return Response.json({ error: "Could not save brand mapping" }, { status: 500 });
  }
}
