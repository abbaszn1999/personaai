import { runSizingJobPass } from "@/lib/sizing/jobs";
import { isInternalRequest } from "@/lib/utils/internal-auth";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Advances size-intelligence runs on deployments where the in-process worker can't run.
 *
 * Same split as `internal/catalog/enqueue`, for the same reason: the scan pages a merchant's entire
 * catalog, which is far too long to hold a request open and too fragile to fire and forget in a
 * function that can be torn down as soon as it responds. Both drivers go through `runSizingJobPass`
 * so neither can drift from the other.
 */
export async function POST(request: Request) {
  if (!isInternalRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const advanced = await runSizingJobPass();
    return Response.json({ advanced });
  } catch (err) {
    console.error("[internal/sizing/advance]", err);
    return Response.json({ error: "Sizing pass failed" }, { status: 500 });
  }
}
