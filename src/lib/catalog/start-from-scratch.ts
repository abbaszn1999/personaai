import { sweepAcsProductsForConnection } from "@/lib/catalog/acs/catalog-reads";
import { clearAcsStageFiveCache } from "@/lib/catalog/acs/stage-five-listing";
import { clearGeneratedStageFiveCache } from "@/lib/catalog/acs/stage-five-preview";
import { markPathConfigStale } from "@/lib/catalog/path-config/rebuild";
import { purgeConnectionFromQueue } from "@/lib/db/catalog-queue";
import {
  claimSetupResetLease,
  listUnclaimedSetupResets,
  resetSetupColumns,
  setupTablesWithRows,
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
/** A verifying listing of the shared catalog is not started with less time than this left in the pass. */
const VERIFY_HEADROOM_MS = 45_000;
/** Listings in a row that find documents every delete reports already gone, before giving up. */
const MAX_FRUITLESS_SWEEPS = 3;
const SETTLE_MS = 10_000;

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
  const until = passStartedAt + SETUP_RESET_PASS_BUDGET_MS;
  const claimed = await claimSetupResetLease(connectionId, LEASE_MS);
  if (!claimed) return "busy";

  const lease = () => new Date(Date.now() + LEASE_MS).toISOString();
  let removed = claimed.deleted;
  let lastBeat = passStartedAt;
  let fruitless = 0;

  const pause = async (progress: Progress): Promise<"continuing"> => {
    await writeSetupResetState(connectionId, { ...progress, leaseUntil: new Date().toISOString() });
    return "continuing";
  };

  try {
    // Finished means a listing found nothing of this store left. ListProducts is ACS's source of
    // truth, so a sweep that deleted everything is followed by one more to prove it, which also
    // catches a document written while the first was running.
    while (Date.now() < until - VERIFY_HEADROOM_MS) {
      const before = removed;
      const sweep = await sweepAcsProductsForConnection(connectionId, {
        until,
        onProgress: async ({ deleted, found }) => {
          if (Date.now() - lastBeat < HEARTBEAT_MS) return;
          lastBeat = Date.now();
          // While it is still listing, only the lease moves: a total that grows page by page would
          // read as products appearing.
          await writeSetupResetState(
            connectionId,
            deleted === 0 ? { leaseUntil: lease() } : { deleted: before + deleted, total: before + found, leaseUntil: lease() },
          );
        },
      });
      removed += sweep.deleted;
      const progress = { deleted: removed, total: before + sweep.found };

      if (sweep.error !== undefined) {
        console.error("[start-from-scratch cleanAcsAfterReset]", connectionId, sweep.error);
        return sweep.deleted === 0 ? fail(connectionId, progress) : pause(progress);
      }
      if (!sweep.complete) return pause(progress);
      if (sweep.found === 0) return finish(connectionId, progress);

      // Listed, yet every delete found its document already gone: ACS has not caught up with
      // deletes it already applied. Waiting a moment settles that; a store that never settles is
      // a fault for Retry, not something to list the shared catalog for forever.
      if (sweep.deleted === 0) {
        fruitless += 1;
        if (fruitless >= MAX_FRUITLESS_SWEEPS) return fail(connectionId, progress);
        await sleep(SETTLE_MS);
      } else {
        fruitless = 0;
      }
      lastBeat = Date.now();
      await writeSetupResetState(connectionId, { ...progress, leaseUntil: lease() });
    }
    return pause({ deleted: removed, total: removed });
  } catch (error) {
    console.error("[start-from-scratch cleanAcsAfterReset]", connectionId, error);
    return fail(connectionId);
  }
}

type Progress = { deleted: number; total: number };

/**
 * The last step, once ACS holds nothing of the store: its Setup rows are cleared again and counted.
 * The second clear removes whatever a job already in flight at reset time wrote afterwards; nothing
 * the merchant made can be among it, since Setup and Mapping refuse every change until the cleanup
 * ends. The Stage 5 mirror goes with them, as the next publish rewrites it from ACS.
 */
async function finish(connectionId: string, progress: Progress): Promise<"done" | "failed"> {
  const failedTables = await wipeSetupTables(connectionId);
  const remaining = failedTables.length > 0 ? null : await setupTablesWithRows(connectionId);
  if (remaining === null || remaining.length > 0) {
    console.error("[start-from-scratch finish] setup rows left", connectionId, failedTables, remaining);
    return fail(connectionId, progress, "Some of this store's setup data could not be removed. Retry to finish the reset.");
  }

  await writeSetupResetState(connectionId, {
    ...progress,
    status: "done",
    leaseUntil: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error: null,
  });
  return "done";
}

async function fail(
  connectionId: string,
  progress?: Progress,
  error = "Could not finish removing the old products from ACS. Retry to continue where it stopped.",
): Promise<"failed"> {
  await writeSetupResetState(connectionId, {
    ...progress,
    status: "failed",
    leaseUntil: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error,
  });
  return "failed";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
