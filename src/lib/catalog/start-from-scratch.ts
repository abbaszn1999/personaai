import { sweepAcsProductsForConnection } from "@/lib/catalog/acs/catalog-reads";
import { clearAcsStageFiveCache } from "@/lib/catalog/acs/stage-five-listing";
import { clearGeneratedStageFiveCache } from "@/lib/catalog/acs/stage-five-preview";
import { markPathConfigStale } from "@/lib/catalog/path-config/rebuild";
import { purgeConnectionFromQueue } from "@/lib/db/catalog-queue";
import {
  claimSetupResetLease,
  listUnclaimedSetupResets,
  resetSetupColumns,
  wipeAcsMirror,
  wipeSetupTables,
  writeSetupResetState,
} from "@/lib/db/setup-reset";
import type { SetupResetScope } from "./setup-reset-state";

/**
 * How long one pass may keep starting deletes. ACS removes about 20 documents a second, so a large
 * store needs several passes; this leaves a 300-second function room to finish its last batch and
 * record where it stopped.
 */
export const SETUP_RESET_PASS_BUDGET_MS = 210_000;
/** How long a claimed pass holds the cleanup without reporting. Comfortably more than one heartbeat. */
const LEASE_MS = 90_000;
/** How often a pass records its progress, which also extends its lease. */
const HEARTBEAT_MS = 10_000;

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
    total: null,
    leaseUntil: null,
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

export type SetupResetPassOutcome = "done" | "continuing" | "failed" | "busy";

/**
 * One pass of the slow half: deletes the store's documents from the shared ACS catalog until its
 * time budget runs out, then either finishes the cleanup or leaves it running for the next pass,
 * which the per-minute schedule starts. A pass that removes nothing before ACS refuses marks the
 * cleanup failed, so a lasting fault surfaces as Retry instead of looping.
 */
export async function cleanAcsAfterReset(connectionId: string): Promise<SetupResetPassOutcome> {
  const passStartedAt = Date.now();
  const claimed = await claimSetupResetLease(connectionId, LEASE_MS);
  if (!claimed) return "busy";

  const before = claimed.deleted;
  const lease = () => new Date(Date.now() + LEASE_MS).toISOString();
  const released = () => new Date().toISOString();
  let lastBeat = passStartedAt;

  try {
    const sweep = await sweepAcsProductsForConnection(connectionId, {
      until: passStartedAt + SETUP_RESET_PASS_BUDGET_MS,
      onProgress: async ({ deleted, found }) => {
        if (Date.now() - lastBeat < HEARTBEAT_MS) return;
        lastBeat = Date.now();
        await writeSetupResetState(connectionId, {
          deleted: before + deleted,
          total: before + found,
          leaseUntil: lease(),
        });
      },
    });
    const progress = { deleted: before + sweep.deleted, total: before + sweep.found };

    if (sweep.complete) {
      // The mirror is rewritten from ACS by the next publish; anything left in it now describes
      // documents that no longer exist.
      await wipeAcsMirror(connectionId);
      await writeSetupResetState(connectionId, {
        ...progress,
        status: "done",
        leaseUntil: released(),
        finishedAt: new Date().toISOString(),
        error: null,
      });
      return "done";
    }

    if (sweep.error !== undefined) {
      console.error("[start-from-scratch cleanAcsAfterReset]", connectionId, sweep.error);
      if (sweep.deleted === 0) return fail(connectionId, progress);
    }
    await writeSetupResetState(connectionId, { ...progress, leaseUntil: released() });
    return "continuing";
  } catch (error) {
    console.error("[start-from-scratch cleanAcsAfterReset]", connectionId, error);
    return fail(connectionId);
  }
}

async function fail(connectionId: string, progress?: { deleted: number; total: number }): Promise<"failed"> {
  await writeSetupResetState(connectionId, {
    ...progress,
    status: "failed",
    leaseUntil: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error: "Could not finish removing the old products from ACS. Retry to continue where it stopped.",
  });
  return "failed";
}

/**
 * Carries every unfinished cleanup one pass further. The per-minute schedule calls this, and so does
 * the in-process worker; a store another pass is still working on is left to that pass.
 */
export async function runSetupResetCleanupPass(): Promise<Array<{ connectionId: string; outcome: SetupResetPassOutcome }>> {
  // One store per call: every pass lists the whole shared catalog, and a pass already fills most of
  // a function's time. A second store waits for the next minute's call.
  const [connectionId] = await listUnclaimedSetupResets(1);
  if (!connectionId) return [];
  return [{ connectionId, outcome: await cleanAcsAfterReset(connectionId) }];
}

/**
 * Marks a failed or interrupted cleanup as running again, ready for `cleanAcsAfterReset`. The lease
 * is left free but dated now, so the retry does not read as abandoned before its first pass claims it.
 */
export async function restartAcsCleanup(connectionId: string): Promise<boolean> {
  return writeSetupResetState(connectionId, {
    status: "running",
    leaseUntil: new Date().toISOString(),
    finishedAt: null,
    error: null,
  });
}
