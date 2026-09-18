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
    console.warn(
      `[sizing jobs] run ${run.id} stalled at stage "${run.stage}"` +
        `${run.phase ? ` (phase "${run.phase}")` : ""}; returning it to the queue`
    );
    // Phase goes with it: a requeued scan restarts from the walk, so leaving "aggregating" on the row
    // would have the screen promise to resume work that is about to begin again from the first page.
    // The in-flight brand goes too, for the same reason — nothing is inside it any more. The scope
    // itself stays, so a Generate All whose worker died resumes rather than silently stopping.
    await updateSizingRun(run.id, {
      status: "pending",
      phase: null,
      phaseDone: null,
      phaseTotal: null,
      researchCurrentBrandKey: null,
    });
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
            `${result.rows} coverage row(s), ${result.pathRows} category-path row(s), ` +
            `${result.stats.unsized} unsized, ${result.stats.sizeless} sizeless, ` +
            `${result.stats.unbranded} unbranded`
        );
        // Straight into classification rather than handing back to the merchant: both are automatic,
        // and stopping between them would show a brand list that is still entirely unclassified.
        // Phase is cleared for the same reason `error` is: only the scan has sub-steps, so one left
        // behind would have the screen reporting work that is no longer happening.
        await updateSizingRun(run.id, {
          stage: "classify",
          status: "pending",
          error: null,
          phase: null,
          phaseDone: null,
          phaseTotal: null,
        });
        return { ...base, outcome: "advanced" };
      }

      case "classify": {
        const result = await runBrandClassification(connection);
        console.log(
          `[sizing jobs] classified ${result.classified} brand(s) for ${connection.id}: ` +
            `${result.global} global, ${result.private} private, ${result.none} unbranded`
        );
        // `blocked` means waiting on the merchant, which is exactly right here: the next step spends
        // money on chart research, so it happens when they ask for a brand on Stage 4, not before.
        // The empty scope is what enforces that — see the research case below.
        await updateSizingRun(run.id, {
          stage: "research",
          status: "blocked",
          error: null,
          researchBrandKeys: [],
          researchCurrentBrandKey: null,
          researchForce: false,
        });
        return { ...base, outcome: "advanced" };
      }

      case "research": {
        // The gate that stops research being automatic. Reaching this stage used to be enough to
        // start searching every global brand in the catalog; now a brand is only searched because a
        // merchant named it, and an empty scope parks rather than inventing one. It is also what
        // stops a legacy bulk pass, claimed before this change, from picking up a second brand: it
        // finishes the brand it is inside and finds nothing authorised on its next tick.
        if (run.researchBrandKeys.length === 0) {
          await updateSizingRun(run.id, {
            status: "blocked",
            researchCurrentBrandKey: null,
            phase: null,
            phaseDone: null,
            phaseTotal: null,
            error: null,
          });
          return { ...base, outcome: "skipped" };
        }

        // `phaseTotal` is the whole request, set once when it was made; `researchBrandKeys` is what is
        // still owed. Their difference is what earlier ticks already finished, so progress accumulates
        // across ticks instead of restarting at zero on each one. The fallback covers a pass claimed
        // before this stage counted anything.
        const scopeTotal = run.phaseTotal ?? run.researchBrandKeys.length;
        const doneBefore = Math.max(scopeTotal - run.researchBrandKeys.length, 0);
        let startedThisTick = 0;

        const result = await runChartResearch(connection, {
          brandKeys: run.researchBrandKeys,
          force: run.researchForce,
          // Written before the search rather than after, so Stage 4 can name the brand it is inside
          // for the several minutes that search takes instead of showing a blank queue.
          onBrandStart: async (brandKey) => {
            await updateSizingRun(run.id, {
              researchCurrentBrandKey: brandKey,
              phase: "researching",
              phaseTotal: scopeTotal,
              phaseDone: doneBefore + startedThisTick,
            });
            startedThisTick += 1;
          },
        });
        console.log(
          `[sizing jobs] researched ${result.brandsConsidered} brand(s) for ${connection.id}: ` +
            `${result.written} chart(s) written, ${result.reused} reused, ${result.notFound} not found ` +
            `(${result.demoted} reclassified private), ` +
            `${result.categoriesNotCovered} categor(y/ies) not covered, ${result.failed} failed, ` +
            `${result.tablesRejected} table(s) rejected, ${result.brandsRemaining} brand(s) left`
        );

        // Research is bounded per tick, so a Generate All over a long brand tail comes back here
        // several times. The scope is narrowed to what is still owed rather than left as it was: that
        // is what makes each tick's cost predictable, and what makes the work survivable on a platform
        // that caps a request at five minutes — a tick either finishes a brand or loses only that one.
        if (result.remainingBrandKeys.length > 0) {
          await updateSizingRun(run.id, {
            stage: "research",
            status: "pending",
            error: null,
            researchBrandKeys: result.remainingBrandKeys,
            researchCurrentBrandKey: null,
            // Total stays; only what is done moves. Recomputed from the new scope so a brand the tick
            // finished counts even if it was the last thing the tick managed.
            phase: "researching",
            phaseTotal: scopeTotal,
            phaseDone: Math.max(scopeTotal - result.remainingBrandKeys.length, 0),
          });
          return { ...base, outcome: "advanced" };
        }

        // Back to waiting on the merchant at the same stage, with the authorisation spent. Stage 4 is
        // now a screen they stay on — generating one brand at a time, reviewing what came back — so
        // finishing a request must return them to it rather than move the pipeline on. Continue is
        // what advances to `assign`.
        await updateSizingRun(run.id, {
          stage: "research",
          status: "blocked",
          error: null,
          researchBrandKeys: [],
          researchCurrentBrandKey: null,
          researchForce: false,
          // Cleared for the same reason the scan clears its own: a phase left on a parked row describes
          // work that is no longer happening, and Stage 4 would keep a progress bar on screen at rest.
          phase: null,
          phaseDone: null,
          phaseTotal: null,
        });
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