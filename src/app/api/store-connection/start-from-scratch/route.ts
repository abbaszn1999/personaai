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

    const reset = await resetSetupData(connection.id, body.scope);
    if (!reset.ok) return Response.json({ error: reset.error }, { status: 500 });

    // Removing the store's documents walks the whole shared ACS catalog, which outlasts any
    // reasonable request. The screen follows it through `GET`, and publishing waits for it.
    after(() => cleanAcsAfterReset(connection.id));
    return Response.json({ ok: true, scope: body.scope });
  } catch (error) {
    console.error("[store-connection start-from-scratch POST]", error);
    return Response.json({ error: "Could not start from scratch." }, { status: 500 });
  }
}
