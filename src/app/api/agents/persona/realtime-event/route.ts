import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getWorkspaceByIdForOwner } from "@/lib/db/workspaces";
import { consumeLiveTryOnSeconds } from "@/lib/db/realtime-tryon-events";
import { getAccountBillingContext } from "@/lib/billing/account";
import { isLiveTryOnEnabled } from "@/modules/workspaces/constants";

interface RequestBody {
  workspaceId?: string;
  sessionId?: string;
  productId?: string;
  productName?: string;
  durationSeconds?: number;
  idempotencyKey?: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body: RequestBody = await req.json().catch(() => ({}));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    const productName = typeof body.productName === "string" ? body.productName.trim() : "";
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const durationSeconds = Number.isInteger(body.durationSeconds)
      ? Math.min(90, Math.max(1, body.durationSeconds as number))
      : 0;

    if (!workspaceId || !sessionId || !productId || !productName || !durationSeconds || !idempotencyKey) {
      return Response.json({ error: "Missing required realtime try-on event fields" }, { status: 400 });
    }

    const workspace = await getWorkspaceByIdForOwner(workspaceId, user.id);
    if (!workspace || workspace.mode !== "wearable") {
      return Response.json({ error: "Wearable workspace not found" }, { status: 404 });
    }
    if (!isLiveTryOnEnabled(workspace.branding)) {
      return Response.json({ error: "Live camera try-on is disabled for this store" }, { status: 403 });
    }

    const billing = await getAccountBillingContext(user.id);
    if (!billing) return Response.json({ error: "Account not found" }, { status: 404 });

    const secondsBalance = await consumeLiveTryOnSeconds({
      ownerId: user.id,
      sessionId,
      productId,
      productName,
      durationSeconds,
      cycleStartIso: billing.cycleStartIso,
      includedAllowanceSeconds: billing.tier.monthlyLiveTryOnSeconds,
      idempotencyKey,
    });
    return Response.json({ ok: true, secondsBalance });
  } catch (error) {
    console.error("[api/agents/persona/realtime-event POST]", error);
    return Response.json({ error: "Unable to record realtime try-on usage" }, { status: 500 });
  }
}
