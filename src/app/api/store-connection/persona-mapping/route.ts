import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner, updateStoreConnection } from "@/lib/db/store-connections";
import {
  buildPersonaMappingConfig,
  effectiveMappingFor,
  mappedSourceCategoryIds,
  storeCategoryBreadcrumb,
} from "@/lib/catalog/persona-mapping";
import { buildCategoryIndex } from "@/lib/catalog/category-parents";
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
import { markPathConfigStale } from "@/lib/catalog/path-config/rebuild";
import { clearGeneratedStageFiveCache } from "@/lib/catalog/acs/stage-five-preview";
import { createSizingRun, getLastPublishedAt, getLatestSizingRun, rewindRun } from "@/lib/db/sizing-runs";
import { getSizingProductPrimaryLeafCounts } from "@/lib/db/sizing-product-records";
import { listSizingCoverage } from "@/lib/db/sizing-coverage";

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

async function responseFor(connection: NonNullable<Awaited<ReturnType<typeof getStoreConnectionByOwner>>>) {
  const [counts, coverage] = await Promise.all([
    getSizingProductPrimaryLeafCounts(connection.id),
    listSizingCoverage(connection.id),
  ]);
  const stageTwoTotal = coverage.reduce((total, row) => total + row.skuCount, 0);
  const mappingUpdatedAt = connection.personaMappingUpdatedAt
    ? Date.parse(connection.personaMappingUpdatedAt)
    : null;
  const scannedAt = counts?.scannedAt ? Date.parse(counts.scannedAt) : null;
  const countsMatchCurrentMapping =
    counts !== null &&
    counts.total > 0 &&
    counts.total === stageTwoTotal &&
    counts.assigned === counts.total &&
    scannedAt !== null &&
    (mappingUpdatedAt === null || scannedAt >= mappingUpdatedAt);

  const hierarchy = buildCategoryIndex(connection.categories);
  const nameOf = new Map(connection.categories.map((category) => [category.id, category.name]));

  return {
    taxonomyVersion: connection.personaTaxonomyVersion,
    scope: connection.personaTaxonomyScope,
    mappingUpdatedAt: connection.personaMappingUpdatedAt,
    autoMatchCompletedAt: connection.personaAutoMatchCompletedAt,
    scanCounts: countsMatchCurrentMapping
      ? { total: counts.total, byLeaf: counts.byLeaf }
      : null,
    categories: connection.categories.map((category) => {
      const mapping = connection.personaCategoryMap[category.id];
      const inherited = mapping
        ? null
        : effectiveMappingFor(category.id, connection.personaCategoryMap, hierarchy);
      const inheritedMapping = inherited?.mapping;
      const inheritedFromParent =
        inherited?.inheritedFrom &&
        inheritedMapping?.status === "mapped" &&
        inheritedMapping.departmentId &&
        inheritedMapping.categoryId &&
        inheritedMapping.subCategory
          ? {
              inheritedFromName: nameOf.get(inherited.inheritedFrom) ?? inherited.inheritedFrom,
              inheritedPersonaPath: formatPersonaPath(
                inheritedMapping.departmentId,
                inheritedMapping.categoryId,
                inheritedMapping.subCategory,
              ),
            }
          : {};
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
        ...inheritedFromParent,
      };
    }),
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const connection = await getStoreConnectionByOwner(user.id);
  if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

  return Response.json(await responseFor(connection));
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

  // Saving what is already saved changes nothing downstream, so it must not restart the scan, throw
  // away classification and chart research, or touch the catalog. Re-saving an unchanged mapping used
  // to do all three.
  const unchanged =
    stableStringify(config.scope) === stableStringify(connection.personaTaxonomyScope) &&
    stableStringify(config.mappings) === stableStringify(connection.personaCategoryMap) &&
    connection.personaTaxonomyVersion === PERSONA_TAXONOMY_VERSION;
  if (unchanged) {
    if (!markAutoMatchCompleted || connection.personaAutoMatchCompletedAt) {
      return Response.json(await responseFor(connection));
    }
    const stamped = await updateStoreConnection(user.id, { personaAutoMatchCompletedAt: now });
    if (!stamped) return Response.json({ error: "Could not save category mappings" }, { status: 500 });
    return Response.json(await responseFor(stamped));
  }

  // A store that has gone live keeps serving its published catalog while the merchant remaps: the
  // sync state is left alone and nothing is taken out of stock. The new mapping only reaches
  // shoppers through the next publish, which replaces the catalog and retires what it no longer
  // writes.
  const lastPublishedAt = await getLastPublishedAt(connection.id);
  const live = lastPublishedAt !== null;

  const updated = await updateStoreConnection(user.id, {
    personaTaxonomyVersion: PERSONA_TAXONOMY_VERSION,
    personaTaxonomyScope: config.scope,
    personaCategoryMap: config.mappings,
    personaMappingUpdatedAt: now,
    ...(markAutoMatchCompleted ? { personaAutoMatchCompletedAt: now } : {}),
    ...(live
      ? {}
      : {
          catalogSyncStatus: "idle" as const,
          catalogSyncProgress: 0,
          catalogSyncTotal: 0,
          catalogPendingCategoryIds: [],
        }),
  });

  if (!updated) return Response.json({ error: "Could not save category mappings" }, { status: 500 });
  await Promise.all([
    live ? Promise.resolve(0) : deactivateAcsCatalogForRemapping(updated.id),
    markPathConfigStale(updated.id),
    // Category paths are one of the scan's inputs. A live run goes back to the scan; a finished one
    // is replaced by a fresh setup run, because leaving it complete keeps `sizing_path_coverage`
    // describing the old mapping — exactly how leafless products remained in Stage 4 after their
    // mapping was corrected.
    restartSizingAfterRemap(updated.id, mappedSourceCategoryIds(updated.personaCategoryMap).length > 0),
  ]);
  clearGeneratedStageFiveCache(updated.id);
  return Response.json(await responseFor(updated));
}

async function restartSizingAfterRemap(connectionId: string, hasMappedCategories: boolean) {
  const rewound = await rewindRun(connectionId, "scan");
  if (rewound || !hasMappedCategories) return rewound;
  if (!(await getLatestSizingRun(connectionId))) return null;
  return createSizingRun(connectionId);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const connection = await getStoreConnectionByOwner(user.id);
  if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

  const live = (await getLastPublishedAt(connection.id)) !== null;

  const updated = await updateStoreConnection(user.id, {
    personaTaxonomyVersion: PERSONA_TAXONOMY_VERSION,
    personaTaxonomyScope: EMPTY_PERSONA_SCOPE,
    personaCategoryMap: {},
    personaMappingUpdatedAt: null,
    // Clearing the mapping is the only way to unlock Auto-Match for another one-shot run.
    personaAutoMatchCompletedAt: null,
    ...(live
      ? {}
      : {
          catalogSyncStatus: "idle" as const,
          catalogSyncProgress: 0,
          catalogSyncTotal: 0,
          catalogPendingCategoryIds: [],
        }),
  });

  if (!updated) return Response.json({ error: "Could not clear category mappings" }, { status: 500 });
  await Promise.all([
    live ? Promise.resolve(0) : deactivateAcsCatalogForRemapping(updated.id),
    markPathConfigStale(updated.id),
    // Nothing is mapped any more, so there is nothing for a fresh run to scan; only a live one is rewound.
    rewindRun(updated.id, "scan"),
  ]);
  clearGeneratedStageFiveCache(updated.id);
  return Response.json(await responseFor(updated));
}
