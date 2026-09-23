import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner, updateStoreConnection } from "@/lib/db/store-connections";
import {
  buildPersonaMappingConfig,
  storeCategoryBreadcrumb,
} from "@/lib/catalog/persona-mapping";
import {
  ALL_PERSONA_LEAF_KEYS,
  EMPTY_PERSONA_SCOPE,
  PERSONA_TAXONOMY_VERSION,
  derivePersonaValues,
  formatPersonaPath,
  type PersonaCategoryId,
  type PersonaDepartmentId,
} from "@/modules/store/mapping/persona-taxonomy";
import { deactivateAcsCatalogForRemapping } from "@/lib/catalog/acs/catalog-reads";
import { rewindRun } from "@/lib/db/sizing-runs";

function invalidLeafMappingIds(
  value: unknown,
  enabledLeafKeys: readonly string[],
  customLeaves: readonly { deptId: string; catId: string; subCategory: string }[],
): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const enabled = new Set(enabledLeafKeys);
  const known = new Set([
    ...ALL_PERSONA_LEAF_KEYS,
    ...customLeaves.map((leaf) => `${leaf.deptId}:${leaf.catId}:${leaf.subCategory}`),
  ]);

  return Object.entries(value as Record<string, unknown>).flatMap(([sourceId, raw]) => {
    if (!raw || typeof raw !== "object" || (raw as Record<string, unknown>).status !== "mapped") return [];
    const mapping = raw as Record<string, unknown>;
    const dept = typeof mapping.departmentId === "string" ? mapping.departmentId.trim() : "";
    const category = typeof mapping.categoryId === "string" ? mapping.categoryId.trim() : "";
    const subCategory = typeof mapping.subCategory === "string" ? mapping.subCategory.trim() : "";
    const leafKey = `${dept}:${category}:${subCategory}`;
    return dept && category && subCategory && known.has(leafKey) && enabled.has(leafKey) ? [] : [sourceId];
  });
}

function responseFor(connection: NonNullable<Awaited<ReturnType<typeof getStoreConnectionByOwner>>>) {
  return {
    taxonomyVersion: connection.personaTaxonomyVersion,
    scope: connection.personaTaxonomyScope,
    mappingUpdatedAt: connection.personaMappingUpdatedAt,
    autoMatchCompletedAt: connection.personaAutoMatchCompletedAt,
    categories: connection.categories.map((category) => {
      const mapping = connection.personaCategoryMap[category.id];
      const mapped =
        mapping?.status === "mapped" &&
        mapping.departmentId &&
        mapping.categoryId &&
        mapping.subCategory;
      return {
        id: category.id,
        name: category.name,
        storePath: storeCategoryBreadcrumb(category.id, connection.categories) || category.name,
        productCount: category.productCount,
        status: mapping?.status ?? "unmapped",
        assignedPersonaPath: mapped
          ? formatPersonaPath(mapping.departmentId!, mapping.categoryId!, mapping.subCategory)
          : undefined,
        departmentId: mapped ? mapping.departmentId : undefined,
        categoryId: mapped ? mapping.categoryId : undefined,
        subCategory: mapped ? mapping.subCategory : undefined,
        derived: mapped
          ? (() => {
              const derived = derivePersonaValues(mapping.departmentId as PersonaDepartmentId, mapping.categoryId as PersonaCategoryId);
              const custom = connection.personaTaxonomyScope.customCategories.find(
                (item) => item.id === mapping.categoryId && item.deptId === mapping.departmentId,
              );
              const labels = {
                tops: "Tops",
                bottoms: "Bottoms",
                dresses: "Dresses/Full-body",
                outerwear: "Outerwear/Jackets",
                footwear: "Footwear",
              } as const;
              return custom?.sizingGroup ? { ...derived, sizingParent: labels[custom.sizingGroup] } : derived;
            })()
          : undefined,
        excludeReason: mapping?.status === "excluded" ? mapping.excludeReason : undefined,
        isAutoMatched: mapping?.isAutoMatched === true,
      };
    }),
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const connection = await getStoreConnectionByOwner(user.id);
  if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

  return Response.json(responseFor(connection));
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const connection = await getStoreConnectionByOwner(user.id);
  if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid mapping payload" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const config = buildPersonaMappingConfig(
    payload.scope,
    payload.mappings,
    connection.categories,
  );
  if (!config.scope.configured) {
    return Response.json({ error: "Configure the Persona taxonomy scope before saving mappings." }, { status: 400 });
  }

  const invalidMappings = invalidLeafMappingIds(
    payload.mappings,
    config.scope.enabledLeafKeys,
    config.scope.customLeaves,
  );
  if (invalidMappings.length > 0) {
    return Response.json(
      {
        error:
          "Every mapped store category must target one enabled subcategory leaf. " +
          `${invalidMappings.length} mapping${invalidMappings.length === 1 ? "" : "s"} must be completed or left unmapped.`,
        invalidCategoryIds: invalidMappings,
      },
      { status: 400 },
    );
  }

  // Auto-Match is a one-shot action: the mapping-view marks this save as its completion, which
  // stamps the connection so `POST .../auto-match` refuses to run again until a full clear (see
  // the DELETE handler below). A manual save never sets this — only Auto-Match's own request does.
  const markAutoMatchCompleted = payload.markAutoMatchCompleted === true;

  const now = new Date().toISOString();
  const updated = await updateStoreConnection(user.id, {
    personaTaxonomyVersion: PERSONA_TAXONOMY_VERSION,
    personaTaxonomyScope: config.scope,
    personaCategoryMap: config.mappings,
    personaMappingUpdatedAt: now,
    ...(markAutoMatchCompleted ? { personaAutoMatchCompletedAt: now } : {}),
    catalogSyncStatus: "idle",
    catalogSyncProgress: 0,
    catalogSyncTotal: 0,
    catalogPendingCategoryIds: [],
  });

  if (!updated) return Response.json({ error: "Could not save category mappings" }, { status: 500 });
  await Promise.all([
    deactivateAcsCatalogForRemapping(updated.id),
    // Category paths are one of the scan's inputs. Keeping a completed/blocked run after changing
    // them leaves `sizing_path_coverage` describing the old mapping — exactly how leafless products
    // remained in Stage 4 after their mapping was corrected.
    rewindRun(updated.id, "scan"),
  ]);
  return Response.json(responseFor(updated));
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const connection = await getStoreConnectionByOwner(user.id);
  if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

  const updated = await updateStoreConnection(user.id, {
    personaTaxonomyVersion: PERSONA_TAXONOMY_VERSION,
    personaTaxonomyScope: EMPTY_PERSONA_SCOPE,
    personaCategoryMap: {},
    personaMappingUpdatedAt: null,
    // Clearing the mapping is the only way to unlock Auto-Match for another one-shot run.
    personaAutoMatchCompletedAt: null,
    catalogSyncStatus: "idle",
    catalogSyncProgress: 0,
    catalogSyncTotal: 0,
    catalogPendingCategoryIds: [],
  });

  if (!updated) return Response.json({ error: "Could not clear category mappings" }, { status: 500 });
  await Promise.all([
    deactivateAcsCatalogForRemapping(updated.id),
    rewindRun(updated.id, "scan"),
  ]);
  return Response.json(responseFor(updated));
}
