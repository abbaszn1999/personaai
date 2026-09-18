import { runCmsColumnDiscoveryPass } from "@/lib/catalog/discover-cms-columns";
import { isInternalRequest } from "@/lib/utils/internal-auth";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Advances every connection's full-catalog CMS column walk by one page each.
 *
 * Needed only where the in-process worker can't run (see `lib/catalog/worker`) — a serverless
 * deployment relies on the `pg_cron` schedule to reach this the same way it reaches
 * `/api/internal/catalog/drain`. Both drivers go through `runCmsColumnDiscoveryPass` so neither
 * can advance a walk differently from the other.
 */
export async function POST(request: Request) {
  if (!isInternalRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runCmsColumnDiscoveryPass();
    return Response.json({ results });
  } catch (err) {
    console.error("[internal/catalog/discover-columns]", err);
    return Response.json({ error: "Discovery pass failed" }, { status: 500 });
  }
}
