import { drainCatalogQueue } from "@/lib/catalog/process-queue";
import { isInternalRequest } from "@/lib/utils/internal-auth";

/** Enrichment and embedding are network-bound and nowhere near an edge runtime's budget. */
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Drains one batch off the catalog enrichment queue.
 *
 * Called by `pg_cron` through `pg_net`, not by a browser — the schedule lives in the database
 * so indexing doesn't depend on the hosting platform's own cron support. Each call takes one
 * batch and returns; the schedule firing repeatedly is what works through a full backfill.
 */
export async function POST(request: Request) {
  if (!isInternalRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await drainCatalogQueue();
    return Response.json(result);
  } catch (err) {
    console.error("[internal/catalog/drain]", err);
    return Response.json({ error: "Drain failed" }, { status: 500 });
  }
}
