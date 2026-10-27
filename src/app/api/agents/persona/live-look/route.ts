import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { describeLookForLive } from "@/lib/ai/look-description";
import { parseLookRequest } from "@/lib/live/look-request";
import { getWorkspaceByIdForOwner } from "@/lib/db/workspaces";
import { canStartLiveTryOn, getAccountBillingContext } from "@/lib/billing/account";
import { isLiveTryOnEnabled } from "@/modules/workspaces/constants";

/**
 * The live try-on prompt, written from the avatar render the shopper is about to wear on camera.
 * Gated like `live-token`: only an account that can open a live session gets one, so this cannot
 * be used as a free vision endpoint. The call is a few hundred tokens and is not charged on its
 * own, next to the $0.02 a second the session it serves costs.
 *
 * A model failure is not an error to the shopper: `prompt: null` makes the widget use the prompt
 * it builds from the catalog.
 */
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    if (workspaceId) {
      const workspace = await getWorkspaceByIdForOwner(workspaceId, user.id);
      if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });
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

    const look = parseLookRequest(body);
    if (!look) return Response.json({ error: "A look picture is required" }, { status: 400 });

    try {
      return Response.json({ prompt: await describeLookForLive(look, req.signal) });
    } catch (error) {
      console.error("[api/agents/persona/live-look] description failed", error);
      return Response.json({ prompt: null });
    }
  } catch (error) {
    console.error("[api/agents/persona/live-look POST]", error);
    return Response.json({ error: "Unable to describe this look" }, { status: 500 });
  }
}
