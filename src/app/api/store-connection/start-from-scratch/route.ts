import { after } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { getLastPublishedAt } from "@/lib/db/sizing-runs";
import {
  effectiveSetupResetState,
  isSetupResetScope,
  SETUP_RESET_CONFIRM_WORD as CONFIRM_WORD,
  setupResetRunning,
} from "@/lib/catalog/setup-reset-state";
import { cleanAcsAfterReset, resetSetupData, restartAcsCleanup } from "@/lib/catalog/start-from-scratch";
import { autoMatchRunning } from "@/lib/catalog/auto-match-state";

/** The first cleanup pass runs in `after()`, which gets this route's time limit. */
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * "Start from scratch" for Setup and Mapping.
 *
 * `GET` is what the confirmation dialog and the progress banner read: the cleanup's state, and
 * whether the store is live, which the dialog warns about. `POST` resets: `{ scope, confirm }`
 * starts over, `{ retry: true }` resumes an ACS cleanup that failed or was cut off.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const connection = await getStoreConnectionByOwner(user.id);
  if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

  const live = (await getLastPublishedAt(connection.id)) !== null;
  return Response.json({ reset: effectiveSetupResetState(connection.setupReset), live });
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (setupResetRunning(connection.setupReset)) {
      return Response.json(
        { error: "Old products are still being removed from ACS. Wait for that to finish." },
        { status: 409 },
      );
    }
    if (autoMatchRunning(connection.autoMatchJob)) {
      return Response.json(
        { error: "AI matching is still running on the Mapping tab. Wait for it to finish." },
        { status: 409 },
      );
    }

    if (body.retry === true) {
      if (effectiveSetupResetState(connection.setupReset).status !== "failed") {
        return Response.json({ error: "There is no failed cleanup to retry." }, { status: 409 });
      }
      if (!(await restartAcsCleanup(connection.id))) {
        return Response.json({ error: "Could not restart the cleanup." }, { status: 500 });
      }
      after(() => cleanAcsAfterReset(connection.id));
      return Response.json({ ok: true });
    }

    if (!isSetupResetScope(body.scope)) {
      return Response.json({ error: "Choose what to start from scratch." }, { status: 400 });
    }
    if (typeof body.confirm !== "string" || body.confirm.trim().toUpperCase() !== CONFIRM_WORD) {
      return Response.json({ error: `Type ${CONFIRM_WORD} to confirm.` }, { status: 400 });
    }

    // Only a literal `true` deletes the merchant's hand-filled private charts; anything else keeps them.
    const reset = await resetSetupData(connection.id, body.scope, {
      deletePrivateCharts: body.deletePrivateCharts === true,
    });
    if (!reset.ok) return Response.json({ error: reset.error }, { status: 500 });

    // Removing the store's documents walks the whole shared ACS catalog, which outlasts any
    // reasonable request. This is the first pass; the per-minute schedule runs the rest. The screen
    // follows it through `GET`, and publishing waits for it.
    after(() => cleanAcsAfterReset(connection.id));
    return Response.json({ ok: true, scope: body.scope });
  } catch (error) {
    console.error("[store-connection start-from-scratch POST]", error);
    return Response.json({ error: "Could not start from scratch." }, { status: 500 });
  }
}
