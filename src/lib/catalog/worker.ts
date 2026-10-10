import { getCatalogQueueDepth } from "@/lib/db/catalog-queue";
import { claimScheduledJob } from "@/lib/db/scheduled-jobs";
import { runSizingJobPass } from "@/lib/sizing/jobs";
import { runCatalogEnqueuePass } from "./jobs";
import { drainCatalogQueue, settleFinishedRuns } from "./process-queue";
import { runCmsColumnDiscoveryPass } from "./discover-cms-columns";
import { runSetupResetCleanupPass } from "./start-from-scratch";
import { RECONCILE_EVERY_SECONDS, RECONCILE_JOB, runCatalogReconcilePass } from "./reconcile";

/** Gap between idle polls. Short enough that saving a category selection feels like it starts
 *  indexing immediately, long enough that an idle install isn't querying in a tight loop. */
const IDLE_POLL_MS = 5_000;

/** Backoff after an unexpected tick failure, so a persistent fault (database unreachable, say)
 *  doesn't spin. */
const ERROR_BACKOFF_MS = 30_000;

/** How often an instance asks whether the hourly reconcile is due. */
const RECONCILE_CHECK_MS = 60_000;

/**
 * Drives catalog indexing from inside the Next.js server.
 *
 * The `pg_cron` schedule reaches the same work over HTTP through `pg_net`, which only works
 * when the database can actually resolve the app: never on a developer's machine, and only
 * with `app_url` and `internal_job_secret` present in Supabase Vault. Whenever the process is
 * long-lived, calling the job functions directly is both simpler and impossible to misconfigure
 * — no URL, no shared secret, no network hop.
 *
 * Every copy of the app that shares a database also shares its job queue, and a copy running
 * older code will happily claim a scan and write stale results. So the worker only starts by
 * default where the app is actually hosted (Render sets `RENDER`); any other machine, such as
 * a laptop running `next dev` against the shared database, must opt in with `CATALOG_WORKER=1`.
 */
export function isCatalogWorkerEnabled(): boolean {
  const flag = process.env.CATALOG_WORKER;
  if (flag) return flag === "1" || flag === "true";

  // Serverless instances are torn down between requests, so a loop started here would die
  // mid-batch and never be restarted. Those deployments are what the `pg_cron` schedule is for.
  if (process.env.VERCEL) return false;

  return Boolean(process.env.RENDER);
}

let running = false;
let setupResetPass: Promise<unknown> | null = null;
let reconcilePass: Promise<unknown> | null = null;
let nextReconcileCheck = 0;

export function startCatalogWorker(): void {
  // Dev server module reloads re-run the startup hook; a second loop would double every
  // enqueue pass and halve the effective visibility timeout on claimed messages.
  if (running) return;
  running = true;

  console.log("[catalog worker] started");
  void loop();
}

async function loop(): Promise<void> {
  for (;;) {
    let wait = IDLE_POLL_MS;

    try {
      wait = await runCatalogTick();
    } catch (err) {
      console.error("[catalog worker] tick failed", err);
      wait = ERROR_BACKOFF_MS;
    }

    await sleep(wait);
  }
}

/**
 * One unit of the worker's work: start any waiting walks, then drain whatever is queued.
 *
 * Returns how long to wait before running again, so the caller does no scheduling arithmetic
 * of its own.
 */
export async function runCatalogTick(): Promise<number> {
  const started = await runCatalogEnqueuePass();
  for (const { connectionId, enqueued } of started) {
    console.log(`[catalog worker] enqueued ${enqueued} product(s) for ${connectionId}`);
  }

  // Size-intelligence runs and full-catalog column discovery ride the same loop rather than
  // getting their own. All three are "background work for a merchant's catalog", all have to
  // survive a request ending, and one driver means one place where scheduling can be wrong. Both
  // passes are cheap no-ops when nothing is running.
  await runSizingJobPass();
  await runCmsColumnDiscoveryPass();

  // A "Start from scratch" cleanup pass deletes for minutes at a time, so it runs beside the loop
  // rather than in it; indexing for every other store would otherwise wait on it.
  setupResetPass ??= runSetupResetCleanupPass()
    .catch((err) => console.error("[catalog worker] setup reset pass failed", err))
    .finally(() => {
      setupResetPass = null;
    });

  // The hourly reconcile walks every store's catalog for minutes, so it too runs beside the loop:
  // what it enqueues is drained here meanwhile. The claim makes one instance run it per hour.
  if (!reconcilePass && Date.now() >= nextReconcileCheck) {
    nextReconcileCheck = Date.now() + RECONCILE_CHECK_MS;
    reconcilePass = claimScheduledJob(RECONCILE_JOB, RECONCILE_EVERY_SECONDS)
      .then((claimed) => (claimed ? runCatalogReconcilePass() : null))
      .then((result) => {
        if (result) console.log(`[catalog worker] reconciled ${JSON.stringify(result.reconciled)}`);
      })
      .catch((err) => console.error("[catalog worker] reconcile pass failed", err))
      .finally(() => {
        reconcilePass = null;
      });
  }

  // Checked before draining so an idle install does one cheap count instead of a queue read
  // plus the whole batch machinery.
  if ((await getCatalogQueueDepth()) === 0) {
    // A run left unfinished by an earlier drain never reaches the drain path again — there is
    // nothing left to drain — so this is the only place it can still be concluded.
    await settleFinishedRuns();
    return IDLE_POLL_MS;
  }

  const result = await drainCatalogQueue();
  console.log(`[catalog worker] indexed ${result.indexed}, failed ${result.failed}, ${result.remaining} remaining`);

  // Straight back in while there is work: `drainCatalogQueue` returns once it has used its own
  // time budget, not because the queue is empty.
  return result.remaining > 0 ? 0 : IDLE_POLL_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
