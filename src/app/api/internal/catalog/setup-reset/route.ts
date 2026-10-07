import { runSetupResetCleanupPass } from "@/lib/catalog/start-from-scratch";
import { isInternalRequest } from "@/lib/utils/internal-auth";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Carries a "Start from scratch" ACS cleanup one pass further. A large store's products take longer
 * to delete than one function may run, so the `pg_cron` schedule calls this every minute while a
 * cleanup is running, the same way it reaches `/api/internal/catalog/drain`.
 */
export async function POST(request: Request) {
  if (!isInternalRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runSetupResetCleanupPass();
    return Response.json({ results });
  } catch (err) {
    console.error("[internal/catalog/setup-reset]", err);
    return Response.json({ error: "Setup reset pass failed" }, { status: 500 });
  }
}
