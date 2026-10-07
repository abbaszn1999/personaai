import { deleteAllAcsProductsForConnection } from "@/lib/catalog/acs/catalog-reads";
import { clearAcsStageFiveCache } from "@/lib/catalog/acs/stage-five-listing";
import { clearGeneratedStageFiveCache } from "@/lib/catalog/acs/stage-five-preview";
import { markPathConfigStale } from "@/lib/catalog/path-config/rebuild";
import { purgeConnectionFromQueue } from "@/lib/db/catalog-queue";
import { resetSetupColumns, wipeAcsMirror, wipeSetupTables, writeSetupResetState } from "@/lib/db/setup-reset";
import type { SetupResetScope } from "./setup-reset-state";

/** How often, in removed documents, the cleanup writes its progress for the banner to read. */
const PROGRESS_EVERY = 200;

/**
 * The immediate half of "Start from scratch": the store's Setup data, and its mapping when Mapping's
 * button was pressed, are gone before this returns, so Setup reopens on Stage 1 at once.
 *
 * Writers are stopped first. The catalog queue is purged and Column Mapping's approval cleared, and
 * without that approval no backfill, scan or publish runs. The store's products are still in ACS when
 * this returns; `cleanAcsAfterReset` removes them in the background, and the cleanup is marked running
 * before anything else so a publish is refused for the whole window.
 */
export async function resetSetupData(
  connectionId: string,
  scope: SetupResetScope,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const startedAt = new Date().toISOString();
  const marked = await writeSetupResetState(connectionId, {
    status: "running",
    scope,
    startedAt,
    finishedAt: null,
    deleted: 0,
    error: null,
  });
  if (!marked) return { ok: false, error: "Could not start the reset. Nothing was changed." };

  // A database step that fails leaves no cleanup to wait for or retry: the merchant presses the
  // button again, and every step is safe to repeat.
  const abandon = async (error: string) => {
    await writeSetupResetState(connectionId, { status: "idle", finishedAt: new Date().toISOString() });
    return { ok: false as const, error };
  };

  if (!(await resetSetupColumns(connectionId, scope))) {
    return abandon("Could not reset this store's setup. Please try again.");
  }

  await purgeConnectionFromQueue(connectionId);
  const failedTables = await wipeSetupTables(connectionId);
  await markPathConfigStale(connectionId);
  clearGeneratedStageFiveCache(connectionId);
  clearAcsStageFiveCache(connectionId);

  if (failedTables.length > 0) {
    return abandon(`Some setup data could not be removed (${failedTables.join(", ")}). Please try again.`);
  }
  return { ok: true };
}

/**
 * The slow half: deletes every one of the store's documents from the shared ACS catalog, recording
 * progress as it goes and the outcome when it ends. Safe to run again after a failure; a document
 * already gone counts as removed.
 */
export async function cleanAcsAfterReset(connectionId: string): Promise<void> {
  let reported = 0;
  try {
    const deleted = await deleteAllAcsProductsForConnection(connectionId, {
      onProgress: async (count) => {
        if (count - reported < PROGRESS_EVERY) return;
        reported = count;
        await writeSetupResetState(connectionId, { deleted: count });
      },
    });
    // The mirror is rewritten from ACS by the next publish; anything left in it now describes
    // documents that no longer exist.
    await wipeAcsMirror(connectionId);
    await writeSetupResetState(connectionId, {
      status: "done",
      deleted,
      finishedAt: new Date().toISOString(),
      error: null,
    });
  } catch (error) {
    console.error("[start-from-scratch cleanAcsAfterReset]", connectionId, error);
    await writeSetupResetState(connectionId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: "Could not finish removing the old products from ACS. Retry to continue where it stopped.",
    });
  }
}

/** Marks a failed or interrupted cleanup as running again, ready for `cleanAcsAfterReset`. */
export async function restartAcsCleanup(connectionId: string): Promise<boolean> {
  return writeSetupResetState(connectionId, {
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  });
}
