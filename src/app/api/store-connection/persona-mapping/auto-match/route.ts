import { after, NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { refuseDuringSetupReset } from "@/lib/catalog/setup-reset-guard";
import { effectiveAutoMatchState } from "@/lib/catalog/auto-match-state";
import { runAutoMatchJob, startAutoMatch } from "@/lib/catalog/persona-auto-match";

/** The run happens in `after()`, which gets this route's time limit on platforms that impose one. */
export const runtime = "nodejs";
export const maxDuration = 660;

/**
 * AI matching for the Mapping page.
 *
 * `POST { categoryIds }` starts a run and answers at once: reading product titles and the AI call
 * take minutes, longer than a request should be held open, so the run works in the background and
 * saves its own result. `GET` is what the page polls to follow it, including after a refresh.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const connection = await getStoreConnectionByOwner(user.id);
  if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

  return Response.json({
    autoMatch: effectiveAutoMatchState(connection.autoMatchJob),
    autoMatchCompletedAt: connection.personaAutoMatchCompletedAt,
  });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });
    const resetting = refuseDuringSetupReset(connection);
    if (resetting) return resetting;

    const body = (await req.json().catch(() => null)) as { categoryIds?: unknown } | null;
    const started = await startAutoMatch(connection, body?.categoryIds);
    if (!started.ok) return Response.json({ error: started.error }, { status: started.status });

    after(() => runAutoMatchJob(connection.id, started.jobId, started.categoryIds));
    return Response.json({ ok: true, jobId: started.jobId, total: started.categoryIds.length }, { status: 202 });
  } catch (error) {
    console.error("[store-connection persona-mapping auto-match POST]", error);
    return Response.json({ error: "Could not start AI matching. Please try again." }, { status: 500 });
  }
}
