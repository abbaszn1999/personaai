import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { createDecartClientToken, DecartApiError } from "@/lib/ai/decart";
import { getWorkspaceByIdForOwner } from "@/lib/db/workspaces";
import { canStartLiveTryOn, getAccountBillingContext } from "@/lib/billing/account";
import { isLiveTryOnEnabled } from "@/modules/workspaces/constants";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    if (workspaceId) {
      const workspace = await getWorkspaceByIdForOwner(workspaceId, user.id);
      if (!workspace || workspace.mode !== "wearable") {
        return Response.json({ error: "Wearable workspace not found" }, { status: 404 });
      }
      if (!isLiveTryOnEnabled(workspace.branding)) {
        return Response.json({ error: "Live camera try-on is disabled for this store" }, { status: 403 });
      }
    }
    const billing = await getAccountBillingContext(user.id);
    if (!billing || !canStartLiveTryOn(billing)) {
      return Response.json(
        { error: "Your monthly live try-on allowance and purchased minutes are exhausted" },
        { status: 402 }
      );
    }

    const remainingSeconds =
      Math.max(
        billing.tier.monthlyLiveTryOnSeconds - billing.liveTryOnSecondsUsedThisCycle,
        0
      ) + billing.user.live_tryon_seconds_balance;
    const token = await createDecartClientToken(remainingSeconds);
    return Response.json({ apiKey: token.apiKey, expiresAt: token.expiresAt });
  } catch (error) {
    console.error("[api/agents/persona/live-token POST]", error);
    if (error instanceof DecartApiError) {
      return Response.json({ error: error.message }, { status: error.status ?? 502 });
    }
    return Response.json({ error: "Unable to start live try-on" }, { status: 500 });
  }
}
