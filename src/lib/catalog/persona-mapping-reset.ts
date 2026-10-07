import { updateStoreConnection, type StoreConnectionRow } from "@/lib/db/store-connections";
import { getLastPublishedAt, rewindRun } from "@/lib/db/sizing-runs";
import { deactivateAcsCatalogForRemapping } from "@/lib/catalog/acs/catalog-reads";
import { markPathConfigStale } from "@/lib/catalog/path-config/rebuild";
import { clearGeneratedStageFiveCache } from "@/lib/catalog/acs/stage-five-preview";
import { EMPTY_PERSONA_SCOPE, PERSONA_TAXONOMY_VERSION } from "@/modules/store/mapping/persona-taxonomy";

/**
 * Clears a store's whole Persona mapping so onboarding restarts at Mapping.
 *
 * Shared by the Mapping tab's "Clear mapping" action and the taxonomy-upgrade script, so both leave
 * a store in exactly the same state: no scope, no mapping, Auto-Match unlocked, sizing rewound, and
 * the Stage 5 preview dropped. A store that has gone live keeps serving its published catalog until
 * the next publish replaces it; one that never published has its catalog deactivated.
 */
export async function resetPersonaMapping(
  connection: Pick<StoreConnectionRow, "id" | "ownerId">,
): Promise<StoreConnectionRow | null> {
  const live = (await getLastPublishedAt(connection.id)) !== null;

  const updated = await updateStoreConnection(connection.ownerId, {
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
  if (!updated) return null;

  await Promise.all([
    live ? Promise.resolve(0) : deactivateAcsCatalogForRemapping(updated.id),
    markPathConfigStale(updated.id),
    // Nothing is mapped any more, so there is nothing for a fresh run to scan; only a live one is rewound.
    rewindRun(updated.id, "scan"),
  ]);
  clearGeneratedStageFiveCache(updated.id);
  return updated;
}
