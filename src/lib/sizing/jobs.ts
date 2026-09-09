import { getStoreConnectionById } from "@/lib/db/store-connections";
import {
  claimSizingRun,
  failSizingRun,
  listActionableSizingRuns,
  updateSizingRun,
  type SizingRunRow,
} from "@/lib/db/sizing-runs";
import { runBrandClassification } from "./classify";
import { runChartResearch } from "./research";
import { runSizingScan } from "./scan";

/**
 * Drives size-intelligence runs from the background, shared by the in-process worker and the
 * `pg_cron` route so neither driver can make a different decision from the other.
 *
 * Why a background job at all: the scan pages a merchant's entire catalog, which takes minutes on a
 * large store. That is far too long to hold a request open, and firing it off inside a request that
 * then returns means a serverless teardown kills it halfway — leaving a run marked `running` that
 * nothing will ever finish. The merchant-facing route only records the intent; this picks it up.
 */

/**
 * How long a `running` run may go without a progress write before it is treated as abandoned.
 *
 * Needed because the active-run unique index allows exactly one live run per connection: without
 * recovery, a dev-server restart or a serverless teardown mid-scan wedges that connection
 * permanently — every retry collides with a run whose worker no longer exists. Comfortably longer
 * than the scan's own flush interval so a slow store is never mistaken for a dead worker.
 */
const STALLED_AFTER_MS = 20 * 60 * 1000;

export interface SizingPassResult {
  runId: string;
  connectionId: string;
  stage: SizingRunRow["stage"];
  outcome: "advanced" | "failed" | "skipped";
}

/**
 * Advances every run waiting on a job.
 *
 * Sequential rather than parallel: each scan pages one merchant's store API, and running several at
 * once turns a background job into a plausible source of rate limits on stores that are also serving
 * live shoppers.
 */
export async function runSizingJobPass(): Promise<SizingPassResult[]> {
  const { pending: queued, stalled } = await listActionableSizingRuns(
    new Date(Date.now() - STALLED_AFTER_MS).toISOString()
  );

  // Returned to `pending` rather than failed: the work is idempotent — a scan rewrites the same
  // coverage from the same catalog — so a torn-down worker should cost a merchant a delay, not a
  // failed pipeline they have to restart by hand.
  for (const run of stalled) {
    console.warn(`[sizing jobs] run ${run.id} stalled at stage "${run.stage}"; returning it to the queue`);
    await updateSizingRun(run.id, { status: "pending" });
  }

  const results: SizingPassResult[] = [];

  for (const pending of queued) {
    // The claim is what makes two concurrent workers safe: both attempt the same guarded
    // transition, exactly one gets a row back, and the loser skips rather than walking the same
    // catalog twice.
    const run = await claimSizingRun(pending.id);
    if (!run) {
      results.push({ runId: pending.id, connectionId: pending.connectionId, stage: pending.stage, outcome: "skipped" });
      continue;
    }

    results.push(await advanceRun(run));
  }

  return results;
}

async function advanceRun(run: SizingRunRow): Promise<SizingPassResult> {
  const base = { runId: run.id, connectionId: run.connectionId, stage: run.stage };

  try {
    const connection = await getStoreConnectionById(run.connectionId);
    if (!connection) {
      await failSizingRun(run.id, "The store connection this run belongs to no longer exists.");
      return { ...base, outcome: "failed" };
    }

    switch (run.stage) {
      case "scan": {
        const result = await runSizingScan(connection, run);
        console.log(
          `[sizing jobs] scanned ${result.stats.counted} product(s) for ${connection.id}: ` +
            `${result.rows} coverage row(s), ${result.stats.unsized} unsized, ${result.stats.sizeless} sizeless, ` +
            `${result.stats.unbranded} unbranded`
        );
        // Straight into classification rather than handing back to the merchant: both are automatic,
        // and stopping between them would show a brand list that is still entirely unclassified.
        await updateSizingRun(run.id, { stage: "classify", status: "pending", error: null });
        return { ...base, outcome: "advanced" };
      }

      case "classify": {
        const result = await runBrandClassification(connection);
        console.log(
          `[sizing jobs] classified ${result.classified} brand(s) for ${connection.id}: ` +
            `${result.global} global, ${result.private} private, ${result.none} unbranded, ${result.reused} reused`
        );
        // `blocked` means waiting on the merchant, which is exactly right here: the next step spends
        // money on chart research, so it happens when they continue past the brand list, not before.
        await updateSizingRun(run.id, { stage: "research", status: "blocked", error: null });
        return { ...base, outcome: "advanced" };
      }

      case "research": {
        const result = await runChartResearch(connection);
        console.log(
          `[sizing jobs] researched ${result.brandsConsidered} brand(s) for ${connection.id}: ` +
            `${result.written} chart(s) written, ${result.reused} reused, ${result.notFound} not found, ` +
            `${result.categoriesNotCovered} categor(y/ies) not covered, ${result.failed} failed, ` +
            `${result.tablesRejected} table(s) rejected, ${result.brandsRemaining} brand(s) left`
        );

        // Research is bounded per tick, so a catalog with a long brand tail comes back here several
        // times. Re-queued at the same stage rather than advanced, which is also what makes the work
        // survivable on a platform that caps a request at five minutes: each tick either finishes a
        // brand or loses only that brand's progress.
        if (result.brandsRemaining > 0) {
          await updateSizingRun(run.id, { stage: "research", status: "pending", error: null });
          return { ...base, outcome: "advanced" };
        }

        // `gap_fill` is next in the stage list, but Phase 5 is what builds its real backend — parked
        // `blocked` here rather than advancing status, so it reads as "waiting on the merchant" for
        // the same reason `classify` -> `research` did, until that phase lands.
        await updateSizingRun(run.id, { stage: "gap_fill", status: "blocked", error: null });
        return { ...base, outcome: "advanced" };
      }

      default:
        // A stage no driver implements yet. Parked as `blocked` rather than left `pending`, which
        // would have every tick re-claim it and log the same line forever.
        console.warn(`[sizing jobs] no handler for stage "${run.stage}" on run ${run.id}; parking it`);
        await updateSizingRun(run.id, { status: "blocked" });
        return { ...base, outcome: "skipped" };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "The sizing run failed.";
    console.error("[sizing jobs] run failed", run.id, err);
    await failSizingRun(run.id, message);
    return { ...base, outcome: "failed" };
  }
}