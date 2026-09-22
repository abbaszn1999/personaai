import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getWorkspaceByIdForOwner, getWorkspacesByOwner } from "@/lib/db/workspaces";
import { getPlanTiers } from "@/modules/billing/constants";
import { createStripeCheckout } from "@/lib/stripe/checkout";
import { purchaseKeyForPlan } from "@/lib/stripe/config";

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : null;
    const tierId = typeof body.tierId === "string" ? body.tierId : "";
    const workspace = workspaceId
      ? await getWorkspaceByIdForOwner(workspaceId, user.id)
      : (await getWorkspacesByOwner(user.id))[0] ?? null;
    if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });

    const tier = getPlanTiers().find((candidate) => candidate.id === tierId);
    if (!tier) return Response.json({ error: "Unknown plan" }, { status: 400 });

    const checkout = await createStripeCheckout({
      user,
      purchaseKey: purchaseKeyForPlan(tier.id),
    });
    return Response.json({ ...checkout, checkoutMode: "stripe" });
  } catch (error) {
    console.error("[api/account/plan PUT]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to start subscription checkout" },
      { status: 500 }
    );
  }
}
