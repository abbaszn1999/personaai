import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getWorkspaceByIdForOwner, getWorkspacesByOwner } from "@/lib/db/workspaces";
import { CREDIT_BUNDLES } from "@/modules/billing/constants";
import { createStripeCheckout } from "@/lib/stripe/checkout";
import type { StripePurchaseKey } from "@/lib/stripe/config";

const BUNDLE_PURCHASE_KEYS: Record<string, StripePurchaseKey> = {
  starter: "credits_starter",
  growth: "credits_growth",
  scale: "credits_scale",
};

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : null;
    const workspace = workspaceId
      ? await getWorkspaceByIdForOwner(workspaceId, user.id)
      : (await getWorkspacesByOwner(user.id))[0] ?? null;
    if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });
    if (workspace.mode !== "wearable") {
      return Response.json({ error: "Image credits are only available for wearable workspaces" }, { status: 400 });
    }

    const bundle = CREDIT_BUNDLES.find((candidate) => candidate.id === body.bundleId);
    if (!bundle) return Response.json({ error: "Unknown credit bundle" }, { status: 400 });

    const checkout = await createStripeCheckout({
      user,
      workspaceMode: workspace.mode,
      purchaseKey: BUNDLE_PURCHASE_KEYS[bundle.id],
    });
    return Response.json({ ...checkout, checkoutMode: "stripe" });
  } catch (error) {
    console.error("[api/account/credits/purchase POST]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to purchase credits" },
      { status: 500 }
    );
  }
}
