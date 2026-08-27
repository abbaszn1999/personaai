import { runCatalogEnqueuePass } from "@/lib/catalog/jobs";
import { isInternalRequest } from "@/lib/utils/internal-auth";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Starts the catalog walk for stores that have just connected.
 *
 * Split out from the connect request on purpose: walking a large catalog takes minutes, which
 * is too long to hold a shopper-facing request open and too fragile to fire and forget in a
 * function that can be torn down as soon as it responds. Connect marks the store `pending`
 * and returns; this picks it up on the next tick.
 *
 * Needed only where the in-process worker can't run (see `lib/catalog/worker`). Both drivers go
 * through `runCatalogEnqueuePass` so neither can drift from the other.
 */
export async function POST(request: Request) {
  if (!isInternalRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const started = await runCatalogEnqueuePass();
    return Response.json({ started });
  } catch (err) {
    console.error("[internal/catalog/enqueue]", err);
    return Response.json({ error: "Enqueue failed" }, { status: 500 });
  }
}
