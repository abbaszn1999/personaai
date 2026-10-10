import { isInternalRequest } from "@/lib/utils/internal-auth";
import { RECONCILE_JOB, runCatalogReconcilePass } from "@/lib/catalog/reconcile";
import { claimScheduledJob } from "@/lib/db/scheduled-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** The `pg_cron` driver of the hourly reconcile (see `runCatalogReconcilePass`). It always runs, and
 *  moves the worker loop's claim on so the loop does not run it again right behind. */
export async function POST(request: Request) {
  if (!isInternalRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await claimScheduledJob(RECONCILE_JOB, 0);
    return Response.json(await runCatalogReconcilePass());
  } catch (err) {
    console.error("[internal/catalog/reconcile]", err);
    return Response.json({ error: "Reconcile failed" }, { status: 500 });
  }
}
