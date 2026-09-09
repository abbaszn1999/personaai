import { getCatalogQueueDepth } from "@/lib/db/catalog-queue";
import { runSizingJobPass } from "@/lib/sizing/jobs";
import { runCatalogEnqueuePass } from "./jobs";
import { drainCatalogQueue, settleFinishedRuns } from "./process-queue";

/** Gap between idle polls. Short enough that saving a category selection feels like it starts
 *  indexing immediately, long enough that an idle install isn't querying in a tight loop. */
const IDLE_POLL_MS = 5_000;

/** Backoff after an unexpected tick failure, so a persistent fault (database unreachable, say)
 *  doesn't spin. */
const ERROR_BACKOFF_MS = 30_000;

/**
 * Drives catalog indexing from inside the Next.js server.
 *
 * The `pg_cron` schedule reaches the same work over HTTP through `pg_net`, which only works
 * when the database can actually resolve the app: never on a developer's machine, and only
 * with `app_url` and `internal_job_secret` present in Supabase Vault. Whenever the process is
 * long-lived, calling the job functions directly is both simpler and impossible to misconfigure
 * — no URL, no shared secret, no network hop.
 */
export function isCatalogWorkerEnabled(): boolean {
  const flag = process.env.CATALOG_WORKER;
  if (flag) return flag === "1" || flag === "true";

  // Serverless instances are torn down between requests, so a loop started here would die
  // mid-batch and never be restarted. Those deployments are what the `pg_cron` schedule is for.
  return !process.env.VERCEL;
}

let running = false;

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

  // Size-intelligence runs ride the same loop rather than getting their own. Both are "background
  // work for a merchant's catalog", both have to survive a request ending, and one driver means one
  // place where scheduling can be wrong. A sizing pass is a cheap no-op when nothing is queued.
  await runSizingJobPass();

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
