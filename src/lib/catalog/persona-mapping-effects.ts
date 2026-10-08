import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { mappedSourceCategoryIds } from "@/lib/catalog/persona-mapping";
import { deactivateAcsCatalogForRemapping } from "@/lib/catalog/acs/catalog-reads";
import { markPathConfigStale } from "@/lib/catalog/path-config/rebuild";
import { clearGeneratedStageFiveCache } from "@/lib/catalog/acs/stage-five-preview";
import { createSizingRun, getLatestSizingRun, rewindRun } from "@/lib/db/sizing-runs";

/**
 * What a saved mapping change sets in motion, whether the merchant saved it or AI matching did.
 *
 * A store that has gone live keeps serving its published catalog while the merchant remaps: nothing
 * is taken out of stock, and the new mapping only reaches shoppers through the next publish. One that
 * never published has its catalog deactivated.
 */
export async function applyPersonaMappingChange(connection: StoreConnectionRow, live: boolean): Promise<void> {
  await Promise.all([
    live ? Promise.resolve(0) : deactivateAcsCatalogForRemapping(connection.id),
    markPathConfigStale(connection.id),
    // Category paths are one of the scan's inputs. A live run goes back to the scan; a finished one
    // is replaced by a fresh setup run, because leaving it complete keeps `sizing_path_coverage`
    // describing the old mapping — exactly how leafless products remained in Stage 4 after their
    // mapping was corrected.
    restartSizingAfterRemap(connection.id, mappedSourceCategoryIds(connection.personaCategoryMap).length > 0),
  ]);
  clearGeneratedStageFiveCache(connection.id);
}

async function restartSizingAfterRemap(connectionId: string, hasMappedCategories: boolean) {
  const rewound = await rewindRun(connectionId, "scan");
  if (rewound || !hasMappedCategories) return rewound;
  if (!(await getLatestSizingRun(connectionId))) return null;
  return createSizingRun(connectionId);
}
