import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner, recordAcsMappingApproval } from "@/lib/db/store-connections";
import { buildMappingPreview } from "@/lib/catalog/acs/preview";
import { MAPPER_VERSION } from "@/lib/catalog/acs/map-product";

/**
 * The one-time mapping preview: 5 real products from the merchant's own store, run through the
 * exact mapper the real backfill uses, for the merchant to see and approve before any import
 * happens. See the plan's "New requirement: merchant-approved mapping preview during setup".
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    const categoryIdsParam = req.nextUrl.searchParams.get("categoryIds");
    const categoryIds = categoryIdsParam
      ? categoryIdsParam.split(",").filter(Boolean)
      : connection.selectedCategoryIds;

    const samples = await buildMappingPreview(connection, categoryIds);

    return Response.json({
      mapperVersion: MAPPER_VERSION,
      // Already-approved, current-version merchants don't need to see this again — the client
      // uses this to skip straight past the modal rather than re-showing it on every save.
      alreadyApproved:
        connection.acsMappingApprovedAt !== null && connection.acsMapperVersionApproved === MAPPER_VERSION,
      samples,
    });
  } catch (err) {
    console.error("[store-connection mapping-preview GET]", err);
    return Response.json({ error: "Could not build a mapping preview" }, { status: 500 });
  }
}

/** Records the merchant's one-time approval. Never re-shown after this unless the mapper's
 *  version changes, per `recordAcsMappingApproval`. */
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

    const ok = await recordAcsMappingApproval(connection.id, MAPPER_VERSION);
    if (!ok) {
      return Response.json({ error: "Failed to record approval" }, { status: 500 });
    }

    return Response.json({ approved: true, mapperVersion: MAPPER_VERSION });
  } catch (err) {
    console.error("[store-connection mapping-preview POST]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
