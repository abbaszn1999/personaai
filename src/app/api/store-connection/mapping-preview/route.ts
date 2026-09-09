import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner, recordAcsMappingApproval } from "@/lib/db/store-connections";
import { buildMappingPreview } from "@/lib/catalog/acs/preview";
import { MAPPER_VERSION } from "@/lib/catalog/acs/map-product";
import { hasApprovedCurrentMapping } from "@/lib/catalog/acs/field-overrides";

/**
 * Backs Setup Stage 1: 5 real products from the merchant's own store, run through the exact mapper
 * the real index uses — including their own option-group overrides — for them to review and approve
 * before anything is indexed.
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
      // Shared predicate, so this can't disagree with the gate that actually blocks indexing —
      // it used to be an inline version-only copy that ignored override drift entirely.
      alreadyApproved: hasApprovedCurrentMapping(connection, MAPPER_VERSION),
      samples,
    });
  } catch (err) {
    console.error("[store-connection mapping-preview GET]", err);
    return Response.json({ error: "Could not build a mapping preview" }, { status: 500 });
  }
}

/** Records the merchant's approval of the mapping currently shown in Stage 1. Re-required if the
 *  mapper version changes or they edit an option-group role, per `recordAcsMappingApproval`. */
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
